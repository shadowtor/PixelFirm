import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const startTask = vi.fn(async () => {});
let stateDir = "";

vi.mock("claude-adapter", () => ({ createClaudeCodeRuntime: () => ({ startTask }) }));
vi.mock("./ws-client.js", () => ({
  startReconnectingConnection: () => ({ stop() {} }),
  startHeartbeat: () => ({ stop() {} }),
}));
vi.mock("./poll-loop.js", () => ({ startPollLoop: () => ({ stop() {} }) }));
vi.mock("./env.js", () => ({
  loadEnv: async () => ({
    controlPlaneUrl: "http://127.0.0.1:1",
    token: "worker-1.secret",
    companyId: "company-1",
    repoPath: "/repo",
    stateDir,
    task: { taskId: "task-7", prompt: "fix the bug", agentId: "agent-1" },
  }),
}));

const { startWorker } = await import("./index.js");

// 06-REVIEW WR-11 (iteration 2): a restart must not start the env task again
// alongside a CEO resume of it in the same worktree.
describe("startWorker env task", () => {
  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "worker-index-state-"));
    startTask.mockClear();
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  it("starts the env task on the first boot only", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    (await startWorker()).stop();
    (await startWorker()).stop();
    expect(startTask).toHaveBeenCalledTimes(1);
    expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-7" }));
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("task-7 was started by an earlier run"));
    errors.mockRestore();
  });
});
