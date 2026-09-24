import { randomUUID } from "node:crypto";
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
  // 06-04 (SEC-03): the only way a task starts is the local operator's env,
  // never argv (T-03-10) and never the network.
  WORKER_TASK_PROMPT: z.string().min(1).optional(),
  WORKER_AGENT_ID: z.string().min(1).optional(),
  WORKER_TASK_ID: z.string().min(1).optional(),
  WORKER_TASK_TITLE: z.string().min(1).optional(),
});

export interface WorkerTask {
  taskId: string;
  prompt: string;
  agentId: string;
  title?: string;
}

export interface WorkerEnv {
  controlPlaneUrl: string;
  token: string;
  companyId: string;
  repoPath: string;
  task?: WorkerTask;
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
  if (parsed.WORKER_TASK_PROMPT && !parsed.WORKER_AGENT_ID) {
    throw new Error("WORKER_TASK_PROMPT requires WORKER_AGENT_ID (the agent that owns the task)");
  }
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
    ...(parsed.WORKER_TASK_PROMPT && parsed.WORKER_AGENT_ID
      ? {
          task: {
            taskId: parsed.WORKER_TASK_ID ?? randomUUID(),
            prompt: parsed.WORKER_TASK_PROMPT,
            agentId: parsed.WORKER_AGENT_ID,
            ...(parsed.WORKER_TASK_TITLE ? { title: parsed.WORKER_TASK_TITLE } : {}),
          },
        }
      : {}),
  };
}
