import { execa } from "execa";

export interface WorktreeRecord {
  path: string;
  headSha?: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

const REFS_HEADS_PREFIX = "refs/heads/";

/**
 * Lists every worktree attached to repoPath by parsing real
 * `git worktree list --porcelain` output (verified format — RESEARCH.md
 * Pattern 3). Records are blank-line-separated blocks; each block's lines are
 * split on the FIRST space only so a value containing spaces (e.g. a branch
 * name) is never truncated.
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeRecord[]> {
  const { stdout } = await execa("git", ["worktree", "list", "--porcelain"], { cwd: repoPath });

  const blocks = stdout.split("\n\n").map((block) => block.trim()).filter((block) => block.length > 0);

  return blocks.map((block) => {
    const record: WorktreeRecord = { path: "" };

    for (const line of block.split("\n")) {
      const spaceIndex = line.indexOf(" ");
      const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
      const value = spaceIndex === -1 ? "" : line.slice(spaceIndex + 1);

      switch (key) {
        case "worktree":
          record.path = value;
          break;
        case "HEAD":
          record.headSha = value;
          break;
        case "branch":
          record.branch = value.startsWith(REFS_HEADS_PREFIX) ? value.slice(REFS_HEADS_PREFIX.length) : value;
          break;
        case "bare":
          record.bare = true;
          break;
        case "detached":
          record.detached = true;
          break;
        default:
          break;
      }
    }

    return record;
  });
}
