import { execa } from "execa";
import { gitExecOptions } from "./git-env.js";

export interface DiffSummary {
  files: { path: string; added: number; removed: number }[];
  unified: string;
  truncated: boolean;
  totalAdded: number;
  totalRemoved: number;
  // Never set by readDiff: a caller marks a diff it could not read, so the
  // dashboard does not show that as "no changes" (06-REVIEW WR-06).
  unavailable?: boolean;
}

// Pitfall 10: diff.external and .gitattributes textconv drivers run arbitrary
// repo-configured programs. Every diff call starts from these flags.
const BASE_ARGS = ["--no-ext-diff", "--no-textconv", "--no-color"];
// CR-02: a core.fsmonitor hook would also run on every worktree diff. Clean
// filters cannot be switched off by a flag; gitExecOptions keeps secrets from them.
const SAFE_CONFIG = ["-c", "core.fsmonitor=false"];

/**
 * Read-only, capped diff of a worktree for a CEO decision request (D-09).
 *
 * Base is the merge-base with `@{upstream}` when the branch tracks one (what a
 * push would send, plus uncommitted changes), else with `origin/HEAD` (a fresh
 * branch's local commits), else HEAD (uncommitted changes only). Untracked
 * files are not part of `git diff`: they are listed in `files` by path with
 * 0 / 0 counts, so the CEO sees they exist, but their content is not shown.
 *
 * `unified` is cut at `maxLines` lines, then at `maxBytes` bytes, always on a
 * line boundary so no UTF-8 sequence is split; `truncated` says whether
 * anything was cut. `totalAdded` / `totalRemoved` sum every file's numstat,
 * even past `maxFiles`, which only caps the `files` array. Binary files count
 * as 0 / 0.
 */
export async function readDiff(
  worktreePath: string,
  caps = { maxLines: 400, maxBytes: 65_536, maxFiles: 500 },
): Promise<DiffSummary> {
  const base = await diffBase(worktreePath);

  const numstat = await execa(
    "git",
    [...SAFE_CONFIG, "diff", ...BASE_ARGS, "--numstat", base, "--"],
    gitExecOptions(worktreePath),
  );
  const allFiles = numstat.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [added, removed, ...path] = line.split("\t");
      return { path: path.join("\t"), added: toCount(added), removed: toCount(removed) };
    });
  const untracked = await execa(
    "git",
    [...SAFE_CONFIG, "ls-files", "--others", "--exclude-standard", "-z"],
    gitExecOptions(worktreePath),
  );
  for (const path of untracked.stdout.split("\0")) {
    if (path.length > 0) allFiles.push({ path, added: 0, removed: 0 });
  }

  const full = await execa("git", [...SAFE_CONFIG, "diff", ...BASE_ARGS, base, "--"], {
    ...gitExecOptions(worktreePath),
    maxBuffer: 8 * 1024 * 1024,
  });
  const lines = full.stdout.length === 0 ? [] : full.stdout.split("\n");
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines.slice(0, caps.maxLines)) {
    const lineBytes = Buffer.byteLength(line) + (kept.length > 0 ? 1 : 0);
    if (bytes + lineBytes > caps.maxBytes) break;
    kept.push(line);
    bytes += lineBytes;
  }

  return {
    files: allFiles.slice(0, caps.maxFiles),
    unified: kept.join("\n"),
    truncated: kept.length < lines.length,
    totalAdded: allFiles.reduce((sum, f) => sum + f.added, 0),
    totalRemoved: allFiles.reduce((sum, f) => sum + f.removed, 0),
  };
}

async function diffBase(worktreePath: string): Promise<string> {
  // 06-REVIEW WR-06: without an upstream, a push of this branch sends every
  // commit since it left the default branch, so diff from there.
  for (const ref of ["@{upstream}", "origin/HEAD"]) {
    try {
      const { stdout } = await execa("git", ["merge-base", "HEAD", ref], gitExecOptions(worktreePath));
      return stdout.trim();
    } catch {
      // No such ref (or no common history): try the next base.
    }
  }
  return "HEAD";
}

/** numstat reports "-" for binary files. */
function toCount(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
