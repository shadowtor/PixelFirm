import { execa } from "execa";

export interface DiffSummary {
  files: { path: string; added: number; removed: number }[];
  unified: string;
  truncated: boolean;
  totalAdded: number;
  totalRemoved: number;
}

// Pitfall 10: diff.external and .gitattributes textconv drivers run arbitrary
// repo-configured programs. Every diff call starts from these flags.
const BASE_ARGS = ["--no-ext-diff", "--no-textconv", "--no-color"];

/**
 * Read-only, capped diff of a worktree for a CEO decision request (D-09).
 *
 * Base is the merge-base with `@{upstream}` when the branch tracks one (what a
 * push would send, plus uncommitted changes), otherwise HEAD (uncommitted
 * changes only). Untracked files are not part of `git diff` and never appear.
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

  const numstat = await execa("git", ["diff", ...BASE_ARGS, "--numstat", base, "--"], { cwd: worktreePath });
  const allFiles = numstat.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [added, removed, ...path] = line.split("\t");
      return { path: path.join("\t"), added: toCount(added), removed: toCount(removed) };
    });

  const full = await execa("git", ["diff", ...BASE_ARGS, base, "--"], {
    cwd: worktreePath,
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
  try {
    await execa("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd: worktreePath });
  } catch {
    return "HEAD";
  }
  const { stdout } = await execa("git", ["merge-base", "HEAD", "@{upstream}"], { cwd: worktreePath });
  return stdout.trim();
}

/** numstat reports "-" for binary files. */
function toCount(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
