import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execa } from "execa";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "./env.js";

async function makeTempGitRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "worker-env-test-"));
  await execa("git", ["init"], { cwd: dir });
  return dir;
}

// Not listed in PLAN.md Task 1's <files>, but the plan's own
// acceptance_criteria explicitly require "a direct unit test of the
// precedence logic" and a worktree-rejection test — Rule 2 (missing critical
// test coverage) addition.
const TASK_KEYS = ["WORKER_TASK_PROMPT", "WORKER_AGENT_ID", "WORKER_TASK_ID", "WORKER_TASK_TITLE"] as const;

describe("loadEnv", () => {
  const originalArgv = [...process.argv];
  let repoPath: string;
  let nonRepoPath: string;

  beforeEach(async () => {
    repoPath = await makeTempGitRepo();
    nonRepoPath = await mkdtemp(join(tmpdir(), "worker-env-not-a-repo-"));
    process.env.CONTROL_PLANE_URL = "http://localhost:3000";
    process.env.WORKER_TOKEN = "worker-1.secret";
    process.env.WORKER_COMPANY_ID = "company-1";
    delete process.env.WORKER_REPO_PATH;
    process.argv = [...originalArgv.slice(0, 2)];
  });

  afterEach(async () => {
    delete process.env.WORKER_REPO_PATH;
    for (const key of TASK_KEYS) delete process.env[key];
    process.argv = [...originalArgv];
    await rm(repoPath, { recursive: true, force: true });
    await rm(nonRepoPath, { recursive: true, force: true });
  });

  it("resolves repoPath from WORKER_REPO_PATH when --repo is absent", async () => {
    process.env.WORKER_REPO_PATH = repoPath;
    const env = await loadEnv();
    expect(env.repoPath).toBe(repoPath);
  });

  it("prefers --repo over WORKER_REPO_PATH when both are supplied (D-04 precedence)", async () => {
    process.env.WORKER_REPO_PATH = nonRepoPath;
    process.argv = [...originalArgv.slice(0, 2), `--repo=${repoPath}`];
    const env = await loadEnv();
    expect(env.repoPath).toBe(repoPath);
  });

  it("rejects when the resolved repo path is not a real git worktree, naming the path", async () => {
    process.env.WORKER_REPO_PATH = nonRepoPath;
    await expect(loadEnv()).rejects.toThrow(nonRepoPath);
  });

  it("rejects synchronously-thrown when no repo path is supplied at all", async () => {
    await expect(loadEnv()).rejects.toThrow(/WORKER_REPO_PATH/);
  });

  describe("env-launched task (06-04, SEC-03: env only, never argv)", () => {
    beforeEach(() => {
      process.env.WORKER_REPO_PATH = repoPath;
    });

    it("returns no task when WORKER_TASK_PROMPT is absent", async () => {
      process.env.WORKER_AGENT_ID = "agent-1";
      const env = await loadEnv();
      expect(env.task).toBeUndefined();
    });

    it("throws naming WORKER_AGENT_ID when only the prompt is set", async () => {
      process.env.WORKER_TASK_PROMPT = "fix the bug";
      await expect(loadEnv()).rejects.toThrow("WORKER_AGENT_ID");
    });

    it("returns the task with a generated uuid taskId when WORKER_TASK_ID is absent", async () => {
      process.env.WORKER_TASK_PROMPT = "fix the bug";
      process.env.WORKER_AGENT_ID = "agent-1";
      const env = await loadEnv();
      expect(env.task).toEqual({ taskId: expect.stringMatching(/^[0-9a-f-]{36}$/), prompt: "fix the bug", agentId: "agent-1" });
    });

    it("uses WORKER_TASK_ID and WORKER_TASK_TITLE when set", async () => {
      process.env.WORKER_TASK_PROMPT = "fix the bug";
      process.env.WORKER_AGENT_ID = "agent-1";
      process.env.WORKER_TASK_ID = "task-7";
      process.env.WORKER_TASK_TITLE = "Fix the bug";
      const env = await loadEnv();
      expect(env.task).toEqual({ taskId: "task-7", prompt: "fix the bug", agentId: "agent-1", title: "Fix the bug" });
    });
  });
});
