import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }));
vi.mock("./event-emitter.js", () => ({
  buildEnvelope: vi.fn(
    (
      companyId: string,
      type: string,
      payload: unknown,
      taskId: string,
      visibility?: string,
      sourceAgentId?: string,
    ) => ({
      companyId,
      type,
      payload,
      taskId,
      ...(visibility !== undefined ? { visibility } : {}),
      ...(sourceAgentId !== undefined ? { sourceAgentId } : {}),
    }),
  ),
  postEvent: vi.fn(async () => {}),
}));
vi.mock("gsd-adapter", () => ({ observeGsdState: vi.fn() }));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { reduce, emptyState } from "company-core";
import type { CompanyEvent } from "event-schema";
// Namespace imports: a not-yet-existing export fails inside the test body
// (assertion-level RED), not as an ESM link failure.
import * as es from "event-schema";
import * as claudeAdapter from "./index.js";
import * as decisionMapping from "./decision-mapping.js";
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

describe("ClaudeCodeRuntime gsd role-change poll (an observation, never a handoff)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps queued mockResolvedValueOnce values; Test 5 leaves one
    // behind (its cancel no longer ticks the poll during the grace period, 05-18).
    (observeGsdState as unknown as Mock).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // hangingQuery ignores interrupt(), so settling the still-hanging task
  // needs the grace period advanced before cancelTask resolves.
  async function cancelHanging(runtime: ReturnType<typeof createClaudeCodeRuntime>) {
    const cancelPromise = runtime.cancelTask("task-1");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await cancelPromise;
  }

  // Baseline tick, then a tick whose role differs — the transition every
  // test in this block exercises.
  function mockRoleChange() {
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-abc")));
    (observeGsdState as unknown as Mock)
      .mockResolvedValueOnce({ phase: "05", status: "executing", category: "execution", role: "Engineering" })
      .mockResolvedValueOnce({ phase: "05", status: "verifying", category: "verification", role: "QA" });
  }

  function postedOfType(type: string) {
    return (postEvent as unknown as Mock).mock.calls.filter((call) => call[2].type === type);
  }

  it("Test 1: a role change across two poll ticks posts exactly one gsd.phase_observed carrying that observation", async () => {
    mockRoleChange();
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0); // let the init message be processed

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS); // tick 1: baseline (isFirstTick)
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS); // tick 2: role changed Engineering -> QA

    const observed = postedOfType("gsd.phase_observed");
    expect(observed).toHaveLength(1);
    expect(observed[0][2].payload).toEqual({
      phase: "05",
      status: "verifying",
      category: "verification",
      role: "QA",
      active: true,
    });
    expect(observed[0][2].taskId).toBe("task-1");

    await cancelHanging(runtime);
  });

  it("Test 2: the role poll posts no handoff event of either half — a workflow role change is not a handoff", async () => {
    mockRoleChange();
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);

    expect(postedOfType("agent.handoff_requested")).toHaveLength(0);
    expect(postedOfType("agent.handoff_completed")).toHaveLength(0);

    await cancelHanging(runtime);
  });

  it("Test 3 (CR-04): a role change leaves the task's owning agent id untouched, so later events still attribute to the real agent", async () => {
    mockRoleChange();
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);

    const pausePromise = runtime.pauseTask("task-1");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await pausePromise;

    const pausedCall = postedOfType("task.status_changed").find((call) => call[2].payload.status === "paused");
    expect(pausedCall).toBeDefined();
    expect(pausedCall![2].sourceAgentId).toBe(startInput.agentId);
  });

  it("Test 4: two consecutive poll ticks reporting the same role post nothing", async () => {
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-abc")));
    (observeGsdState as unknown as Mock).mockResolvedValue({
      phase: "05",
      status: "executing",
      category: "execution",
      role: "Engineering",
    });
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);

    expect(postedOfType("gsd.phase_observed")).toHaveLength(0);

    await cancelHanging(runtime);
  });

  it("Test 5: the first poll tick only records a baseline and posts nothing", async () => {
    mockRoleChange();
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS); // tick 1 only

    expect(postedOfType("gsd.phase_observed")).toHaveLength(0);

    await cancelHanging(runtime);
  });

  it("Test 6: the emitted envelope, reduced by company-core, refines the REAL agent's status and creates no role-named agent", async () => {
    mockRoleChange();
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(ROLE_POLL_INTERVAL_MS);

    const envelope = postedOfType("gsd.phase_observed")[0][2] as unknown as CompanyEvent;

    // The real agent, running, before any observation refines it.
    const running = reduce(emptyState(), {
      companyId: "company-1",
      type: "task.status_changed",
      payload: { taskId: "task-1", status: "running" },
      sourceAgentId: startInput.agentId,
    } as unknown as CompanyEvent);
    expect(running.agents[startInput.agentId].status).toBe("coding");

    const next = reduce(running, envelope);

    expect(next.agents[startInput.agentId].status).toBe("testing"); // refined by category "verification"
    expect(Object.keys(next.agents)).not.toContain("QA");
    expect(Object.keys(next.agents)).toEqual([startInput.agentId]);

    await cancelHanging(runtime);
  });

  it("Test 7: requestHandoff called directly with a real receiving agent id still posts agent.handoff_requested, and still refuses an unknown task", async () => {
    (query as unknown as Mock).mockReturnValue(hangingQuery(initMessage("session-abc")));
    (observeGsdState as unknown as Mock).mockResolvedValue({
      phase: "05",
      status: "executing",
      category: "execution",
      role: "Engineering",
    });
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);

    await runtime.requestHandoff("task-1", "test-agent-2");

    const handoffCalls = postedOfType("agent.handoff_requested");
    expect(handoffCalls).toHaveLength(1);
    expect(handoffCalls[0][2].payload).toEqual({
      taskId: "task-1",
      fromAgentId: startInput.agentId,
      toAgentId: "test-agent-2",
    });

    await expect(runtime.requestHandoff("never-started", "test-agent-2")).rejects.toThrow();

    await cancelHanging(runtime);
  });

  it("Test 8: the role-change poll stops firing once the task reaches a terminal status (cancelled)", async () => {
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

// 05-VERIFICATION.md gap 4 / review CR-02: several runQuery invocations for
// one task. The superseded invocation's teardown, watchdog, late messages,
// role poll and query() callbacks must never touch the record its successor
// now owns.
describe("ClaudeCodeRuntime superseded invocations (one live query() per task)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    (observeGsdState as unknown as Mock).mockResolvedValue({
      phase: "05",
      status: "executing",
      category: "execution",
      role: "Engineering",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // A stream that yields init, then rejects once its own abort signal fires.
  // interrupt() is a no-op, so graceful stop always times out and the
  // hard-abort path runs.
  function abortableQuery(signal: AbortSignal, initMsg: unknown, onAbort: () => unknown[] = () => []) {
    const state = { done: false };
    async function* gen() {
      try {
        yield initMsg;
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
        const tail = onAbort();
        if (tail.length === 0) throw new Error("aborted");
        for (const message of tail) yield message;
      } finally {
        state.done = true;
      }
    }
    const iter = gen() as AsyncGenerator<unknown, void> & { interrupt: Mock };
    iter.interrupt = vi.fn(async () => undefined);
    return { iter, signal, isLive: () => !signal.aborted && !state.done };
  }

  // A stream that yields init, then ends cleanly as soon as interrupt() is
  // called — graceful stop succeeds without any abort.
  function drainingQuery(signal: AbortSignal, initMsg: unknown) {
    const state = { done: false };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    async function* gen() {
      try {
        yield initMsg;
        await gate;
      } finally {
        state.done = true;
      }
    }
    const iter = gen() as AsyncGenerator<unknown, void> & { interrupt: Mock };
    iter.interrupt = vi.fn(async () => release());
    return { iter, signal, isLive: () => !signal.aborted && !state.done };
  }

  // Records, at the moment each query() is created, how many previously
  // created streams are still live and which ones were aborted.
  function recordingQuery(make: (signal: AbortSignal, index: number) => ReturnType<typeof abortableQuery>) {
    const streams: ReturnType<typeof abortableQuery>[] = [];
    const liveAtStart: number[] = [];
    const abortedAtStart: boolean[][] = [];
    (query as unknown as Mock).mockImplementation(({ options }: { options: { abortController: AbortController } }) => {
      liveAtStart.push(streams.filter((s) => s.isLive()).length);
      abortedAtStart.push(streams.map((s) => s.signal.aborted));
      const s = make(options.abortController.signal, streams.length);
      streams.push(s);
      return s.iter;
    });
    return { streams, liveAtStart, abortedAtStart };
  }

  it("Test A: three successive runQuery calls against non-graceful streams never overlap two live query() streams", async () => {
    const rec = recordingQuery((signal, i) => abortableQuery(signal, initMessage(`session-${i}`)));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);
    void runtime.sendMessage("task-1", "second");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(0);
    void runtime.sendMessage("task-1", "third");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(rec.streams).toHaveLength(3);
    expect(rec.liveAtStart).toEqual([0, 0, 0]);
    expect(rec.abortedAtStart[2]).toEqual([true, true]);
  });

  it("Test F: two same-tick sendMessage calls against a cleanly draining stream start exactly one new query()", async () => {
    const rec = recordingQuery((signal, i) =>
      i === 0 ? drainingQuery(signal, initMessage("session-0")) : abortableQuery(signal, initMessage(`session-${i}`)),
    );
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);
    void runtime.sendMessage("task-1", "second");
    void runtime.sendMessage("task-1", "third");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(rec.liveAtStart).toEqual(rec.liveAtStart.map(() => 0));
    expect(rec.streams).toHaveLength(2);
    expect(rec.streams.filter((s) => s.isLive())).toHaveLength(1);
    const calls = (query as unknown as Mock).mock.calls;
    expect(calls[calls.length - 1][0].prompt).toBe("third");
  });

  it.each([
    ["pauseTask", "paused"],
    ["cancelTask", "cancelled"],
  ] as const)(
    "Test G: %s landing during a pending sendMessage preemption wins — no new query(), status stays %s",
    async (method, expected) => {
      recordingQuery((signal, i) =>
        i === 0 ? drainingQuery(signal, initMessage("session-0")) : abortableQuery(signal, initMessage(`session-${i}`)),
      );
      const runtime = createClaudeCodeRuntime(runtimeOptions());

      void runtime.startTask(startInput);
      await vi.advanceTimersByTimeAsync(0);
      void runtime.sendMessage("task-1", "second");
      const stop = runtime[method]("task-1");
      await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
      await stop;
      await vi.advanceTimersByTimeAsync(0);

      expect(query).toHaveBeenCalledTimes(1);
      expect(await runtime.getStatus("task-1")).toBe(expected);
      expect(statusesPosted().at(-1)).toBe(expected);
    },
  );

  // Yields init, then one message every 10 s forever (ignores abort) — keeps
  // its own invocation's watchdog reset.
  function chattyQuery(initMsg: unknown) {
    async function* gen() {
      yield initMsg;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        yield { type: "assistant" };
      }
    }
    const iter = gen() as AsyncGenerator<unknown, void> & { interrupt: Mock };
    iter.interrupt = vi.fn(async () => undefined);
    return iter;
  }

  function statusesPosted(): string[] {
    return (postEvent as unknown as Mock).mock.calls
      .filter((call) => call[2].type === "task.status_changed")
      .map((call) => call[2].payload.status);
  }

  // startTask on `first`, then supersede it with sendMessage; returns once the
  // second query() exists.
  async function supersede(runtime: ReturnType<typeof createClaudeCodeRuntime>) {
    void runtime.startTask(startInput);
    await vi.advanceTimersByTimeAsync(0);
    void runtime.sendMessage("task-1", "second");
    await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);
  }

  it("Test B: a superseded invocation's watchdog never interrupts, blocks or emits for its successor", async () => {
    const second = chattyQuery(initMessage("session-1"));
    (query as unknown as Mock)
      .mockImplementationOnce(() => hangingQuery(initMessage("session-0")))
      .mockImplementationOnce(() => second);
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await supersede(runtime);
    await vi.advanceTimersByTimeAsync(DEFAULT_WATCHDOG_TIMEOUT_MS + GRACEFUL_TIMEOUT_MS);

    expect(await runtime.getStatus("task-1")).toBe("running");
    expect(statusesPosted()).not.toContain("blocked");
    expect(second.interrupt).not.toHaveBeenCalled();
  });

  it("Test C: a superseded stream's late result never writes or emits a terminal status", async () => {
    (query as unknown as Mock)
      .mockImplementationOnce(
        ({ options }: { options: { abortController: AbortController } }) =>
          abortableQuery(options.abortController.signal, initMessage("session-0"), () => [resultMessage("error")]).iter,
      )
      .mockImplementationOnce(() => hangingQuery(initMessage("session-1")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await supersede(runtime);
    await vi.advanceTimersByTimeAsync(0);

    expect(statusesPosted()).not.toContain("failed");
    expect(await runtime.getStatus("task-1")).toBe("running");
  });

  it("Test D: a superseded invocation's role poll stops itself at its next tick", async () => {
    (query as unknown as Mock)
      .mockImplementationOnce(() => hangingQuery(initMessage("session-0")))
      .mockImplementationOnce(() => chattyQuery(initMessage("session-1")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await supersede(runtime);
    (observeGsdState as unknown as Mock).mockClear();
    await vi.advanceTimersByTimeAsync(3 * ROLE_POLL_INTERVAL_MS);

    expect((observeGsdState as unknown as Mock).mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("Test E: a superseded invocation's canUseTool and Notification hook never flag review or request CEO approval", async () => {
    (query as unknown as Mock)
      .mockImplementationOnce(() => hangingQuery(initMessage("session-0")))
      .mockImplementationOnce(() => hangingQuery(initMessage("session-1")));
    const runtime = createClaudeCodeRuntime(runtimeOptions());

    await supersede(runtime);
    await vi.advanceTimersByTimeAsync(0);
    (postEvent as unknown as Mock).mockClear();

    const firstOptions = (query as unknown as Mock).mock.calls[0][0].options;
    const decision = await firstOptions.canUseTool("AskUserQuestion", { questions: [] }, {});
    await firstOptions.hooks.Notification[0].hooks[0](
      { hook_event_name: "Notification", message: "waiting for approval", notification_type: "permission_prompt" },
      "tool-use-1",
      { signal: new AbortController().signal },
    );

    expect(decision.behavior).toBe("deny");
    expect(await runtime.getStatus("task-1")).toBe("running");
    const posted = (postEvent as unknown as Mock).mock.calls.map((call) => call[2].type);
    expect(posted.filter((t) => t === "task.status_changed" || t === "ceo.approval_requested")).toHaveLength(0);
  });
});

describe("parked canUseTool (D-01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The decision exactly as the worker broker resolves it: the fields of a
  // WorkerDownlinkSchema-parsed frame, minus the routing fields, so both
  // halves of the tracer are tested against the same wire schema.
  function wireDecision(value: Record<string, unknown>) {
    const parsed = es.WorkerDownlinkSchema.parse({
      type: "decision",
      decisionId: "0b6f7c1e-2a4d-4e8b-9f3a-6c5d4e3b2a10",
      ...value,
    }) as Record<string, unknown>;
    const { type: _type, decisionId: _id, ...decision } = parsed;
    return decision;
  }

  // Starts a task on a pausable stream with awaitDecision injected; the
  // default awaitDecision parks until the test calls decide().
  async function startParked(decisionOverride?: () => Promise<unknown>) {
    const q = pausableQuery(initMessage("session-abc"));
    (query as unknown as Mock).mockReturnValue(q);
    let decide: (d: unknown) => void = () => {};
    const awaitDecision = vi.fn(
      decisionOverride ??
        (() =>
          new Promise((resolve) => {
            decide = resolve;
          })),
    );
    const runtime = createClaudeCodeRuntime({ ...runtimeOptions(), awaitDecision } as Parameters<
      typeof createClaudeCodeRuntime
    >[0]);
    const startPromise = runtime.startTask(startInput);
    await flushMicrotasks();
    const options = (query as unknown as Mock).mock.calls[0][0].options;
    const finish = async () => {
      q.interrupt();
      await startPromise;
    };
    return { runtime, awaitDecision, options, canUseTool: options.canUseTool, decide: (d: unknown) => decide(d), finish };
  }

  function posted() {
    return (postEvent as unknown as Mock).mock.calls.map((call) => call[2]);
  }

  it("approve: posts waiting_for_review then a PRIVATE ceo.approval_requested, returns the SAME input reference, then running + decision_applied", async () => {
    const { runtime, awaitDecision, canUseTool, decide, finish } = await startParked();
    (postEvent as unknown as Mock).mockClear();
    const input = { command: "npm publish" };
    const signal = new AbortController().signal;

    const resultPromise = canUseTool("Bash", input, { signal, toolUseID: "tool-1" });
    await flushMicrotasks();

    expect(awaitDecision).toHaveBeenCalledTimes(1);
    const [decisionId, passedSignal] = awaitDecision.mock.calls[0] as unknown as [string, AbortSignal];
    expect(decisionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(passedSignal).toBe(signal);
    expect(await runtime.getStatus("task-1")).toBe("waiting_for_review");

    const before = posted();
    expect(before.map((e) => e.type)).toEqual(["task.status_changed", "ceo.approval_requested"]);
    expect(before[0].payload).toEqual({ taskId: "task-1", status: "waiting_for_review" });
    expect(before[1].visibility).toBe("PRIVATE");
    expect(before[1].sourceAgentId).toBe("test-agent-1");
    expect(before[1].payload).toEqual({
      taskId: "task-1",
      reason: "Bash command matched a CEO-gated pattern: publish/deploy",
      decisionId,
      threadId: decisionId,
      kind: "ceo_gated_tool",
      toolName: "Bash",
      toolInput: JSON.stringify(input),
    });

    decide(wireDecision({ action: "approve" }));
    const result = await resultPromise;

    expect(result.behavior).toBe("allow");
    expect(result.updatedInput).toBe(input);
    expect(await runtime.getStatus("task-1")).toBe("running");
    const after = posted().slice(2);
    expect(after.map((e) => e.type)).toEqual(["task.status_changed", "ceo.decision_applied"]);
    expect(after[0].payload).toEqual({ taskId: "task-1", status: "running" });
    expect(after[1].visibility).toBe("PRIVATE");
    expect(after[1].payload).toEqual({ decisionId, taskId: "task-1", action: "approve", outcome: "allowed" });
    await finish();
  });

  it("approve: a decision carrying extra updatedInput / input fields changes nothing", async () => {
    const { canUseTool, decide, finish } = await startParked();
    const input = { command: "npm publish" };
    const resultPromise = canUseTool("Bash", input, { signal: new AbortController().signal, toolUseID: "tool-1" });
    await flushMicrotasks();
    decide({ action: "approve", updatedInput: { command: "rm -rf /" }, input: { command: "rm -rf /" } });
    const result = await resultPromise;
    expect(result).toEqual({ behavior: "allow", updatedInput: { command: "npm publish" } });
    expect(result.updatedInput).toBe(input);
    await finish();
  });

  it("reject: returns { behavior: 'deny', message: '[CEO:REJECT]' } and decision_applied outcome denied", async () => {
    const { canUseTool, decide, finish } = await startParked();
    const resultPromise = canUseTool(
      "Bash",
      { command: "npm publish" },
      { signal: new AbortController().signal, toolUseID: "t" },
    );
    await flushMicrotasks();
    decide(wireDecision({ action: "reject" }));
    expect(await resultPromise).toEqual({ behavior: "deny", message: "[CEO:REJECT]" });
    const applied = posted().filter((e) => e.type === "ceo.decision_applied");
    expect(applied).toHaveLength(1);
    expect(applied[0].visibility).toBe("PRIVATE");
    expect(applied[0].payload.action).toBe("reject");
    expect(applied[0].payload.outcome).toBe("denied");
    await finish();
  });

  it("a tool input over 16000 characters is denied without calling awaitDecision", async () => {
    const { awaitDecision, canUseTool, finish } = await startParked();
    (postEvent as unknown as Mock).mockClear();
    const result = await canUseTool(
      "Bash",
      { command: `npm publish ${"x".repeat(16_000)}` },
      { signal: new AbortController().signal, toolUseID: "t" },
    );
    expect(result).toEqual({
      behavior: "deny",
      message:
        "Tool input is too large to show the CEO in full (over 16000 characters); split the operation into smaller steps.",
    });
    expect(awaitDecision).not.toHaveBeenCalled();
    expect(posted().filter((e) => e.type === "ceo.approval_requested")).toHaveLength(0);
    await finish();
  });

  it("an awaitDecision that throws returns the no-decision deny", async () => {
    const { canUseTool, finish } = await startParked(() => Promise.reject(new Error("aborted")));
    const result = await canUseTool(
      "Bash",
      { command: "npm publish" },
      { signal: new AbortController().signal, toolUseID: "t" },
    );
    expect(result).toEqual({ behavior: "deny", message: "No CEO decision was received; the tool call was not run." });
    await finish();
  });

  it("AskUserQuestion: copies the parked questions into the PRIVATE request payload", async () => {
    const { canUseTool, decide, finish } = await startParked();
    const questions = [
      { question: "Which?", header: "Pick", multiSelect: false, options: [{ label: "A", description: "a" }] },
    ];
    const resultPromise = canUseTool(
      "AskUserQuestion",
      { questions },
      { signal: new AbortController().signal, toolUseID: "t" },
    );
    await flushMicrotasks();
    const request = posted().find((e) => e.type === "ceo.approval_requested");
    expect(request.payload.kind).toBe("clarifying_question");
    expect(request.payload.questions).toEqual(questions);
    decide(wireDecision({ action: "discuss", note: "why?" }));
    expect((await resultPromise).behavior).toBe("deny");
    await finish();
  });

  it("the package index exports toPermissionResult and CEO_PREFIX", () => {
    expect(typeof claudeAdapter.toPermissionResult).toBe("function");
    expect(claudeAdapter.CEO_PREFIX.reject).toBe("[CEO:REJECT]");
  });
});

describe("CEO protocol system prompt (D-05/D-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("with awaitDecision, query() gets the claude_code preset with CEO_PROTOCOL_APPEND appended", async () => {
    (query as unknown as Mock).mockReturnValue(fakeQuery([initMessage("s"), resultMessage("success")]));
    const runtime = createClaudeCodeRuntime({
      ...runtimeOptions(),
      awaitDecision: vi.fn(),
    } as Parameters<typeof createClaudeCodeRuntime>[0]);
    await runtime.startTask(startInput);
    expect((query as unknown as Mock).mock.calls[0][0].options.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
      append: decisionMapping.CEO_PROTOCOL_APPEND,
    });
    expect(typeof decisionMapping.CEO_PROTOCOL_APPEND).toBe("string");
  });

  it("without awaitDecision, no systemPrompt is set (Phase 4 unchanged)", async () => {
    (query as unknown as Mock).mockReturnValue(fakeQuery([initMessage("s"), resultMessage("success")]));
    const runtime = createClaudeCodeRuntime(runtimeOptions());
    await runtime.startTask(startInput);
    const options = (query as unknown as Mock).mock.calls[0][0].options;
    expect(options.systemPrompt).toBeUndefined();
    expect("systemPrompt" in options).toBe(false);
  });
});
