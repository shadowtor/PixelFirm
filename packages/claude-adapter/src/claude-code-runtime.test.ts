import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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

// Yields a fixed array of fake SDKMessage-shaped objects — mirrors
// apps/worker/src/poll-loop.test.ts's mocking convention, adapted for the
// SDK's async-generator query() shape (Query extends AsyncGenerator<SDKMessage, void>).
async function* fakeQuery(messages: unknown[]) {
  for (const message of messages) {
    yield message;
  }
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
