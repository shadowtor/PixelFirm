import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isGitWorktree, readBranch, readHead } from "./commit.js";

describe("commit.ts", () => {
  let repoDir: string;
  let nonGitDir: string;

  beforeAll(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "git-adapter-fixture-"));
    await execa("git", ["init"], { cwd: repoDir });
    // Throwaway identity — git commit requires it and CI/dev machines may not
    // have global user.email/user.name configured.
    await execa("git", ["config", "user.email", "fixture@example.com"], { cwd: repoDir });
    await execa("git", ["config", "user.name", "Fixture"], { cwd: repoDir });
    await writeFile(join(repoDir, "file.txt"), "content\n");
    await execa("git", ["add", "-A"], { cwd: repoDir });
    await execa("git", ["commit", "-m", "test"], { cwd: repoDir });

    nonGitDir = await mkdtemp(join(tmpdir(), "git-adapter-nongit-"));
  });

  afterAll(async () => {
    await rm(repoDir, { recursive: true, force: true });
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it("readHead resolves a real 40-character hex sha", async () => {
    const sha = await readHead(repoDir);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("readBranch resolves a non-empty branch name", async () => {
    const branch = await readBranch(repoDir);
    expect(branch.length).toBeGreaterThan(0);
  });

  it("isGitWorktree resolves true for a real git repo", async () => {
    await expect(isGitWorktree(repoDir)).resolves.toBe(true);
  });

  it("isGitWorktree resolves false (never throws) for a non-git directory", async () => {
    await expect(isGitWorktree(nonGitDir)).resolves.toBe(false);
  });
});
