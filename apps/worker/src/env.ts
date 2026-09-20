import { z } from "zod";
import { isGitWorktree } from "git-adapter";

// Fail fast on any missing/empty required value, matching apps/api/src/env.ts's
// pattern. Unlike apps/api's eager top-level `.parse(process.env)`, this is
// wrapped in an async loadEnv() (below) because D-04's repo-path validation is
// itself async (git-adapter's isGitWorktree) — Zod can't express that inline.
const EnvSchema = z.object({
  CONTROL_PLANE_URL: z.string().url(),
  // WORKER_TOKEN is read only from process.env, never accepted as a CLI arg —
  // T-03-10 Information Disclosure mitigation: a running process's argv is
  // visible to any other process via OS process listing (verified this
  // session on Windows via Get-CimInstance Win32_Process), but its env is not.
  WORKER_TOKEN: z.string().min(1),
  WORKER_COMPANY_ID: z.string().min(1),
});

export interface WorkerEnv {
  controlPlaneUrl: string;
  token: string;
  companyId: string;
  repoPath: string;
}

const REPO_ARG_PREFIX = "--repo=";

// D-04 (Claude's Discretion): --repo takes precedence over WORKER_REPO_PATH
// when both are supplied. Throws synchronously (before any async work) when
// neither is supplied — there's nothing to validate yet.
function resolveRepoPathArg(): string {
  const argMatch = process.argv.find((arg) => arg.startsWith(REPO_ARG_PREFIX));
  const repoPath = argMatch ? argMatch.slice(REPO_ARG_PREFIX.length) : process.env.WORKER_REPO_PATH;
  if (!repoPath) {
    throw new Error("Worker requires a repo path: pass --repo=<path> or set WORKER_REPO_PATH (D-04)");
  }
  return repoPath;
}

/**
 * Validates and loads the worker's full runtime config. index.ts awaits this
 * before starting anything else, so an invalid config (missing env var, or a
 * repo path that isn't a real git worktree — T-03-09 Tampering mitigation)
 * still fails fast, just not synchronously at import time like apps/api's
 * env.ts.
 */
export async function loadEnv(): Promise<WorkerEnv> {
  const parsed = EnvSchema.parse(process.env);
  const repoPath = resolveRepoPathArg();

  const isWorktree = await isGitWorktree(repoPath);
  if (!isWorktree) {
    throw new Error(`Worker repo path is not a valid git worktree: ${repoPath}`);
  }

  return {
    controlPlaneUrl: parsed.CONTROL_PLANE_URL,
    token: parsed.WORKER_TOKEN,
    companyId: parsed.WORKER_COMPANY_ID,
    repoPath,
  };
}
