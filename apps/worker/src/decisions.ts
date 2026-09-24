import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { type DecisionAction, type WorkerDownlink, WorkerDownlinkSchema, type WorkerUplink } from "event-schema";

export type ResumeMessage = Extract<WorkerDownlink, { type: "task.resume" }>;

// Structurally claude-adapter's CeoDecision; typed from event-schema because
// apps/worker does not depend on claude-adapter until 06-04.
export interface BrokerDecision {
  action: DecisionAction;
  note?: string;
  answers?: Record<string, string>;
}

/**
 * Worker pending-decision broker (D-01). The runtime parks a classified tool
 * call on awaitDecision; a decision frame on the worker's WebSocket, validated
 * by the shared WorkerDownlinkSchema, resolves it exactly once. The decision
 * is built from the parsed fields only, so no wire field can reach what runs.
 * 06-04 wires handleDownlink to the ws-client message handler and task.resume.
 */
export function createDecisionBroker() {
  const pending = new Map<string, { resolve: (d: BrokerDecision) => void; reject: (err: Error) => void }>();
  let resumeHandler: ((msg: ResumeMessage) => void) | undefined;

  const bootId = randomUUID();

  return {
    bootId,

    // Sent on every (re)connect so the control plane can tell a restart
    // (new bootId: expire) from a reconnect (same bootId: redeliver).
    helloMessage(): WorkerUplink {
      return { type: "hello", bootId };
    },

    awaitDecision(decisionId: string, signal: AbortSignal): Promise<BrokerDecision> {
      if (signal.aborted) return Promise.reject(new Error(`Decision ${decisionId} aborted before it was parked`));
      return new Promise<BrokerDecision>((resolve, reject) => {
        const onAbort = () => {
          pending.delete(decisionId);
          reject(new Error(`Decision ${decisionId} aborted`));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        pending.set(decisionId, {
          resolve: (d) => {
            signal.removeEventListener("abort", onAbort);
            resolve(d);
          },
          reject,
        });
      });
    },

    onResume(handler: (msg: ResumeMessage) => void): void {
      resumeHandler = handler;
    },

    // Takes the raw WebSocket string. Anything that is not a valid decision
    // frame for a parked call is ignored silently.
    handleDownlink(raw: string): void {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return;
      }
      const parsed = WorkerDownlinkSchema.safeParse(json);
      if (!parsed.success) return;
      if (parsed.data.type === "task.resume") {
        resumeHandler?.(parsed.data);
        return;
      }
      const { decisionId, action, note, answers } = parsed.data;
      const entry = pending.get(decisionId);
      if (!entry) return;
      pending.delete(decisionId);
      entry.resolve({ action, ...(note !== undefined ? { note } : {}), ...(answers !== undefined ? { answers } : {}) });
    },

    pendingCount(): number {
      return pending.size;
    },
  };
}

// git prints worktree paths with forward slashes on Windows; the control plane
// echoes whatever the runtime stored. Compare resolved paths, case-folded on
// win32 where drive letters and paths are case-insensitive.
function normalisePath(p: string): string {
  const resolved = resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export interface ResumeDeps {
  repoPath: string;
  listWorktrees: (repoPath: string) => Promise<Array<{ path: string }>>;
  runtime: {
    restoreTask(input: { taskId: string; sessionId: string; worktreePath: string; agentId: string }): void;
    resumeTask(taskId: string): Promise<void>;
  };
  log: (message: string) => void;
}

/**
 * T-06-04-02: task.resume's worktreePath is untrusted until it matches a
 * worktree attached to this worker's own repo. Returns whether it resumed.
 */
export async function handleResume(msg: ResumeMessage, deps: ResumeDeps): Promise<boolean> {
  const { taskId, sessionId, worktreePath, agentId } = msg;
  let attached: Array<{ path: string }>;
  try {
    attached = await deps.listWorktrees(deps.repoPath);
  } catch (err) {
    deps.log(`Resume of ${taskId} refused: cannot list worktrees (${err instanceof Error ? err.message : String(err)})`);
    return false;
  }
  const wanted = normalisePath(worktreePath);
  if (!attached.some((w) => normalisePath(w.path) === wanted)) {
    deps.log(`Resume of ${taskId} refused: worktree is not attached to this worker's repo`);
    return false;
  }
  try {
    deps.runtime.restoreTask({ taskId, sessionId, worktreePath, agentId });
  } catch (err) {
    deps.log(`Resume of ${taskId} refused: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  void deps.runtime
    .resumeTask(taskId)
    .catch((err: unknown) => deps.log(`Resumed task ${taskId} failed: ${err instanceof Error ? err.message : String(err)}`));
  return true;
}
