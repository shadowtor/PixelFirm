import { execa } from "execa";

/**
 * Resolves the current HEAD commit sha for a repo. Runs real `git` plumbing,
 * never a shell string — execa's array-args form is the command-injection
 * mitigation (RESEARCH.md Security Domain, T-03-05).
 */
export async function readHead(repoPath: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "HEAD"], { cwd: repoPath });
  return stdout.trim();
}

/**
 * Resolves the current branch name for a repo (e.g. "main").
 */
export async function readBranch(repoPath: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
  return stdout.trim();
}

/**
 * Validates that repoPath is a real git worktree. Never throws — D-04 requires
 * validating a user-supplied path before trusting it, and a validator that
 * throws defeats that purpose. Resolves false on any error (nonexistent path,
 * not a git repo, etc.).
 */
export async function isGitWorktree(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execa("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}
