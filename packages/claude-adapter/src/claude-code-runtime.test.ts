import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }));
vi.mock("./event-emitter.js", () => ({
  buildEnvelope: vi.fn((companyId: string, type: string, payload: unknown, taskId: string) => ({
    companyId,
    type,
    payload,
    taskId,
  })),
  postEvent: vi.fn(async () => {}),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { postEvent } from "./event-emitter.js";
import { createClaudeCodeRuntime } from "./claude-code-runtime.js";
import { DEFAULT_WATCHDOG_TIMEOUT_MS } from "./watchdog.js";

// Mirrors claude-code-runtime.ts's own GRACEFUL_TIMEOUT_MS constant (not
// exported — an internal implementation detail); tests drive fake timers
// past this window to exercise the hard-kill fallback path.
const GRACEFUL_TIMEOUT_MS = 5000;

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
