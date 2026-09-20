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
});
