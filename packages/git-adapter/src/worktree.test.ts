import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listWorktrees } from "./worktree.js";

describe("worktree.ts", () => {
  let repoDir: string;

  beforeAll(async () => {
    // Duplicated fixture-creation pattern from commit.test.ts — no shared
    // test-utils package exists yet, acceptable at this scale (PLAN.md action).
    repoDir = await mkdtemp(join(tmpdir(), "git-adapter-worktree-fixture-"));
    await execa("git", ["init"], { cwd: repoDir });
    await execa("git", ["config", "user.email", "fixture@example.com"], { cwd: repoDir });
    await execa("git", ["config", "user.name", "Fixture"], { cwd: repoDir });
    await writeFile(join(repoDir, "file.txt"), "content\n");
    await execa("git", ["add", "-A"], { cwd: repoDir });
    await execa("git", ["commit", "-m", "test"], { cwd: repoDir });
  });

  afterAll(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("returns exactly one WorktreeRecord for a single-worktree fixture", async () => {
    const records = await listWorktrees(repoDir);
    expect(records).toHaveLength(1);
  });

  it("record has a 40-char headSha and a branch with no refs/heads/ prefix", async () => {
    const [record] = await listWorktrees(repoDir);
    expect(record.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(record.branch).toBeDefined();
    expect(record.branch).not.toMatch(/^refs\/heads\//);
  });

  it("record's path matches the repo path", async () => {
    const [record] = await listWorktrees(repoDir);
    // git normalizes path separators/casing on Windows — compare resolved paths.
    expect(record.path.replace(/\\/g, "/").toLowerCase()).toBe(repoDir.replace(/\\/g, "/").toLowerCase());
  });
});
