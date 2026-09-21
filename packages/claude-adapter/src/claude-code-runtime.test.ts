import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }));
vi.mock("./event-emitter.js", () => ({
  buildEnvelope: vi.fn(
    (
      companyId: string,
      type: string,
      payload: unknown,
      taskId: string,
      _visibility?: string,
      sourceAgentId?: string,
    ) => ({
      companyId,
      type,
      payload,
      taskId,
      ...(sourceAgentId !== undefined ? { sourceAgentId } : {}),
    }),
  ),
  postEvent: vi.fn(async () => {}),
}));
vi.mock("gsd-adapter", () => ({ observeGsdState: vi.fn() }));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { observeGsdState } from "gsd-adapter";
import { postEvent } from "./event-emitter.js";
import { createClaudeCodeRuntime } from "./claude-code-runtime.js";
import { DEFAULT_WATCHDOG_TIMEOUT_MS } from "./watchdog.js";

// Mirrors claude-code-runtime.ts's own GRACEFUL_TIMEOUT_MS constant (not
// exported — an internal implementation detail); tests drive fake timers
// past this window to exercise the hard-kill fallback path.
const GRACEFUL_TIMEOUT_MS = 5000;

// Mirrors claude-code-runtime.ts's own ROLE_POLL_INTERVAL_MS constant (not
// exported — an internal implementation detail).
const ROLE_POLL_INTERVAL_MS = 5000;

// Yields a fixed array of fake SDKMessage-shaped objects — mirrors
// apps/worker/src/poll-loop.test.ts's mocking convention, adapted for the
// SDK's async-generator query() shape (Query extends AsyncGenerator<SDKMessage, void>).
async function* fakeQuery(messages: unknown[]) {
  for (const message of messages) {
    yield message;
  }
}

// A Query-shaped async generator that yields an init message then blocks
// mid-stream on an internal gate — simulating a task pauseTask/cancelTask can
// act on before any result arrives. Its mocked .interrupt() releases the
// gate, letting the for-await loop end cleanly (the graceful path) — mirrors
// the real SDK's documented SIGINT-equivalent "ends the current turn cleanly"
// behavior (04-RESEARCH.md Pattern 3), while `handle.interrupt` itself stays
// a plain vi.fn() so tests can assert it was called.
function pausableQuery(initMsg: unknown) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* gen() {
    yield initMsg;
    await gate;
  }
  const iter = gen() as AsyncGenerator<unknown, void> & { interrupt: Mock };
  iter.interrupt = vi.fn(async () => {
    release();
    return undefined;
  });
  return iter;
}

// A Query-shaped async generator that yields an init message then hangs
// forever, ignoring .interrupt() entirely — simulates a task that does not
// respond to the graceful stop mechanism, forcing the hard-abort fallback.
function hangingQuery(initMsg: unknown) {
  async function* gen() {
    yield initMsg;
    await new Promise(() => {
      /* never resolves — simulates an ungraceful hang */
    });
  }
  const iter = gen() as AsyncGenerator<unknown, void> & { interrupt: Mock };
  iter.interrupt = vi.fn(async () => undefined);
  return iter;
}

// A Query-shaped async generator that yields nothing at all — simulates a
// genuinely silent stream (no init, no result, no progress) for the
// watchdog's bounded-silence timeout to detect.
function silentQuery() {
  async function* gen() {
    await new Promise(() => {
      /* never resolves — no message ever yielded */
    });
  }
  const iter = gen() as AsyncGenerator<unknown, void> & { interrupt: Mock };
  iter.interrupt = vi.fn(async () => undefined);
  return iter;
}

// Flushes pending microtasks (message-loop progression) without depending on
// fake timers — safe in tests that use real timers.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function initMessage(sessionId: string) {
  return { type: "system", subtype: "init", session_id: sessionId };
}

function resultMessage(subtype: "success" | "error") {
  return { type: "result", subtype };
}

const startInput = {
  taskId: "task-1",
  repoPath: "F:/Sidegigs/syncsmith",
  worktreePath: "F:/Sidegigs/syncsmith",
  prompt: "do the thing",
  agentId: "test-agent-1",
};

function runtimeOptions() {
  return { companyId: "company-1", controlPlaneUrl: "http://localhost:3000", token: "worker-1.secret" };
}

describe("ClaudeCodeRuntime.startTask / getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: startTask resolves and getStatus returns completed after a success result", async () => {
    (query as unknown as Mock).mockReturnValue(fakeQuery([initMessage("session-abc"), resultMessage("success")]));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await runtime.startTask(startInput);

    expect(await runtime.getStatus("task-1")).toBe("completed");
  });

  it("Test 2: posts exactly two task.status_changed events — starting (before the loop begins) then completed", async () => {
    (query as unknown as Mock).mockReturnValue(fakeQuery([initMessage("session-abc"), resultMessage("success")]));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await runtime.startTask(startInput);

    const statusChangedCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "task.status_changed",
    );
    expect(statusChangedCalls).toHaveLength(2);
    expect(statusChangedCalls[0][2].payload.status).toBe("starting");
    expect(statusChangedCalls[1][2].payload.status).toBe("completed");
    expect(statusChangedCalls[0][2].sourceAgentId).toBe("test-agent-1");
    expect(statusChangedCalls[1][2].sourceAgentId).toBe("test-agent-1");
  });

  it("Test 2b: requestHandoff throws for a task with no known agentId, rather than fabricating one", async () => {
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await expect(runtime.requestHandoff("never-started", "agent-2")).rejects.toThrow();
  });

  it("Test 3: an error result sets getStatus to failed and posts a failed event, never completed", async () => {
    (query as unknown as Mock).mockReturnValue(fakeQuery([initMessage("session-abc"), resultMessage("error")]));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await runtime.startTask(startInput);

    expect(await runtime.getStatus("task-1")).toBe("failed");
    const statusChangedCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "task.status_changed",
    );
    const finalCall = statusChangedCalls[statusChangedCalls.length - 1];
    expect(finalCall[2].payload.status).toBe("failed");
    expect(finalCall[2].payload.status).not.toBe("completed");
  });

  it("Test 4: getStatus for a taskId that was never started rejects rather than fabricating a status", async () => {
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await expect(runtime.getStatus("never-started")).rejects.toThrow();
  });
});

describe("ClaudeCodeRuntime.pauseTask / resumeTask / sendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: pauseTask on a mid-stream task ends the turn gracefully and sets status to paused", async () => {
    (query as unknown as Mock).mockReturnValue(pausableQuery(initMessage("session-abc")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    const startPromise = runtime.startTask(startInput);
    await flushMicrotasks(); // let the init message be processed before pausing

    await runtime.pauseTask("task-1");

    expect(await runtime.getStatus("task-1")).toBe("paused");
    await startPromise;
  });

  it("Test 2: resumeTask after pause calls query() again with resume set to the captured session_id; success completes the task", async () => {
    (query as unknown as Mock).mockReturnValue(pausableQuery(initMessage("session-abc")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    const startPromise = runtime.startTask(startInput);
    await flushMicrotasks();
    await runtime.pauseTask("task-1");
    await startPromise;

    (query as unknown as Mock).mockReturnValue(fakeQuery([resultMessage("success")]));
    await runtime.resumeTask("task-1");

    expect(query).toHaveBeenCalledTimes(2);
    const secondCallArgs = (query as unknown as Mock).mock.calls[1][0];
    expect(secondCallArgs.options.resume).toBe("session-abc");
    expect(secondCallArgs.prompt).toBe("Continue the task from where you left off");
    expect(await runtime.getStatus("task-1")).toBe("completed");
  });

  it("Test 3: sendMessage on a running task sends the caller's exact message as the new prompt, resuming the session", async () => {
    (query as unknown as Mock).mockReturnValue(pausableQuery(initMessage("session-xyz")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    runtime.startTask(startInput);
    await flushMicrotasks();
    expect(await runtime.getStatus("task-1")).toBe("running");

    (query as unknown as Mock).mockReturnValue(fakeQuery([resultMessage("success")]));
    await runtime.sendMessage("task-1", "do X next");

    expect(query).toHaveBeenCalledTimes(2);
    const secondCallArgs = (query as unknown as Mock).mock.calls[1][0];
    expect(secondCallArgs.options.resume).toBe("session-xyz");
    expect(secondCallArgs.prompt).toBe("do X next");
    expect(await runtime.getStatus("task-1")).toBe("completed");
  });

  it("Test 4: resumeTask/sendMessage reject when no session has been captured, rather than starting a fresh unrelated session", async () => {
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await expect(runtime.resumeTask("never-started")).rejects.toThrow();
    await expect(runtime.sendMessage("never-started", "hi")).rejects.toThrow();

    (query as unknown as Mock).mockReturnValue(fakeQuery([])); // started but never reaches an init message
    await runtime.startTask(startInput);
    await expect(runtime.resumeTask("task-1")).rejects.toThrow();
    await expect(runtime.sendMessage("task-1", "hi")).rejects.toThrow();
  });
});

describe("ClaudeCodeRuntime.requestReview via canUseTool / Notification hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 4: canUseTool invoked with AskUserQuestion triggers requestReview, sets waiting_for_review, posts ceo.approval_requested, and denies", async () => {
    const q = pausableQuery(initMessage("session-abc"));
    (query as unknown as Mock).mockReturnValue(q);
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    const startPromise = runtime.startTask(startInput);
    await flushMicrotasks(); // let the init message be processed

    const callArgs = (query as unknown as Mock).mock.calls[0][0];
    const decision = await callArgs.options.canUseTool("AskUserQuestion", { questions: [] }, {});

    expect(decision.behavior).toBe("deny");
    expect(await runtime.getStatus("task-1")).toBe("waiting_for_review");

    const approvalCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "ceo.approval_requested",
    );
    expect(approvalCalls).toHaveLength(1);
    expect(approvalCalls[0][2].payload.taskId).toBe("task-1");
    expect(approvalCalls[0][2].payload.reason.length).toBeGreaterThan(0);

    q.interrupt(); // release the gate so the task can end cleanly
    await startPromise;
  });

  it("Test 5: the wired Notification hook calls requestReview with a reason containing permission_prompt", async () => {
    const q = pausableQuery(initMessage("session-xyz"));
    (query as unknown as Mock).mockReturnValue(q);
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    const startPromise = runtime.startTask(startInput);
    await flushMicrotasks();

    const callArgs = (query as unknown as Mock).mock.calls[0][0];
    const notificationHook = callArgs.options.hooks.Notification[0].hooks[0];
    await notificationHook(
      { hook_event_name: "Notification", message: "waiting for approval", notification_type: "permission_prompt" },
      "tool-use-1",
      { signal: new AbortController().signal },
    );

    const approvalCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "ceo.approval_requested",
    );
    expect(approvalCalls).toHaveLength(1);
    expect(approvalCalls[0][2].payload.reason).toContain("permission_prompt");

    q.interrupt();
    await startPromise;
  });
});

describe("ClaudeCodeRuntime.cancelTask / watchdog integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 4: cancelTask hard-kills a hung task within the grace period, resulting in status cancelled", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-hang")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0); // let the init message be processed

    const cancelPromise = runtime.cancelTask("task-1");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await cancelPromise;

    expect(await runtime.getStatus("task-1")).toBe("cancelled");
    expect(abortSpy).toHaveBeenCalled();
  });

  it("Test 5: a genuinely silent query() stream triggers the watchdog, transitioning status to blocked (not cancelled)", async () => {
    (query as unknown as Mock).mockReturnValue(silentQuery());
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0); // let runQuery reach the for-await loop and reset the watchdog

    await vi.advanceTimersByTimeAsync(DEFAULT_WATCHDOG_TIMEOUT_MS); // fire the watchdog
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS); // let the onTimeout graceful-then-hard-kill settle

    expect(await runtime.getStatus("task-1")).toBe("blocked");
    const statusChangedCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "task.status_changed",
    );
    const lastCall = statusChangedCalls[statusChangedCalls.length - 1];
    expect(lastCall[2].payload.status).toBe("blocked");
  });
});

describe("ClaudeCodeRuntime.requestHandoff / gsd role-change poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: a role change from PM to Engineering across two poll ticks calls requestHandoff with the new role", async () => {
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-abc")));
    (observeGsdState as unknown as Mock)
      .mockResolvedValueOnce({ phase: "04", status: "executing", category: "planning", role: "PM" })
      .mockResolvedValueOnce({ phase: "04", status: "executing", category: "execution", role: "Engineering" });
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0); // let the init message be processed

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS); // tick 1: baseline (isFirstTick), no handoff
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS); // tick 2: role changed PM -> Engineering

    const handoffCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "agent.handoff_requested",
    );
    expect(handoffCalls).toHaveLength(1);
    expect(handoffCalls[0][2].payload).toEqual({
      taskId: "task-1",
      fromAgentId: "test-agent-1",
      toAgentId: "Engineering",
    });

    const handoffCompletedCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "agent.handoff_completed",
    );
    expect(handoffCompletedCalls).toHaveLength(1);
    expect(handoffCompletedCalls[0][2].payload).toEqual({ taskId: "task-1", toAgentId: "Engineering" });

    // clean up the still-hanging task (hangingQuery ignores interrupt(), so
    // cancelTask needs the grace period advanced before it settles).
    const cancelPromise = runtime.cancelTask("task-1");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await cancelPromise;
  });

  it("Test 2: two consecutive poll ticks with the same role never call requestHandoff", async () => {
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-abc")));
    (observeGsdState as unknown as Mock).mockResolvedValue({
      phase: "04",
      status: "executing",
      category: "execution",
      role: "Engineering",
    });
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);

    const handoffCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "agent.handoff_requested",
    );
    expect(handoffCalls).toHaveLength(0);

    const cancelPromise = runtime.cancelTask("task-1");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await cancelPromise;
  });

  it("Test 3: requestHandoff does not alter the task's own AgentTaskStatus", async () => {
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-abc")));
    (observeGsdState as unknown as Mock)
      .mockResolvedValueOnce({ phase: "04", status: "executing", category: "planning", role: "PM" })
      .mockResolvedValueOnce({ phase: "04", status: "executing", category: "execution", role: "Engineering" });
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    const statusBefore = await runtime.getStatus("task-1");
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    const statusAfter = await runtime.getStatus("task-1");

    expect(statusAfter).toBe(statusBefore);

    const handoffCalls = (postEvent as unknown as Mock).mock.calls.filter(
      (call) => call[2].type === "agent.handoff_requested",
    );
    expect(handoffCalls).toHaveLength(1); // role did change, proving requestHandoff actually fired

    const cancelPromise = runtime.cancelTask("task-1");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await cancelPromise;
  });

  it("Test 4: the role-change poll stops firing once the task reaches a terminal status (cancelled)", async () => {
    // pausableQuery (not hangingQuery) — its mocked interrupt() releases the
    // gate, letting runQuery's for-await loop actually exit and its finally
    // block (which clears the role poll) actually run, unlike a hung stream
    // that never respects abort/interrupt.
    const q = pausableQuery(initMessage("session-abc"));
    (query as unknown as Mock).mockReturnValue(q);
    (observeGsdState as unknown as Mock).mockResolvedValue({
      phase: "04",
      status: "executing",
      category: "execution",
      role: "Engineering",
    });
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS); // baseline tick

    await runtime.cancelTask("task-1"); // graceful interrupt ends the loop cleanly

    const callCountAtCancel = (observeGsdState as unknown as Mock).mock.calls.length;
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS * 3); // would tick 3 more times if not cleared

    expect((observeGsdState as unknown as Mock).mock.calls.length).toBe(callCountAtCancel);
  });
});
