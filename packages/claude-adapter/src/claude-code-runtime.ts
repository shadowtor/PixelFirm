import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRuntime, AgentTaskStatus, StartTaskInput } from "orchestration-adapter";
import { buildEnvelope, postEvent } from "./event-emitter.js";

interface TaskRecord {
  sessionId?: string;
  status: AgentTaskStatus;
  worktreePath?: string;
  controller?: AbortController;
  runPromise?: Promise<void>;
  handle?: Query;
}

// D-03's grace period for cancelTask/pauseTask's "did the process exit after
// we asked nicely" wait — distinct from and much shorter than the watchdog's
// hang-detection window (that answers "has anything happened at all").
const GRACEFUL_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Factory function (not a class — matches this codebase's function-first
 * style, mirroring git-adapter/gsd-adapter/poll-loop.ts) returning an
 * AgentRuntime backed by one real @anthropic-ai/claude-agent-sdk query() call
 * per task, authenticated purely via the existing `claude` CLI subscription
 * login (RUNTIME-02) — never reads/logs/forwards ANTHROPIC_API_KEY or any
 * `~/.claude/` OAuth credential; the SDK's own default credential resolution
 * handles auth.
 */
export function createClaudeCodeRuntime(options: {
  companyId: string;
  controlPlaneUrl: string;
  token: string;
}): AgentRuntime {
  const tasks = new Map<string, TaskRecord>();

  async function emitStatus(taskId: string, status: AgentTaskStatus): Promise<void> {
    await postEvent(
      options.controlPlaneUrl,
      options.token,
      buildEnvelope(options.companyId, "task.status_changed", { taskId, status }, taskId),
    );
  }

  // Shared for-await message loop — startTask (prompt = input.prompt, no
  // resume), resumeTask, and sendMessage all call this instead of each
  // duplicating the stream-handling logic. Each invocation creates its own
  // AbortController and stores the running Query handle on the task's map
  // entry so pauseTask/cancelTask can act on the currently in-flight call.
  async function runQuery(taskId: string, prompt: string, resumeSessionId?: string): Promise<void> {
    const record = tasks.get(taskId);
    if (!record) throw new Error(`ClaudeCodeRuntime.runQuery: unknown taskId ${taskId}`);

    const controller = new AbortController();
    record.controller = controller;

    const stream = query({
      prompt,
      options: {
        cwd: record.worktreePath,
        permissionMode: "default",
        resume: resumeSessionId,
        abortController: controller,
      },
    });
    record.handle = stream;

    const runPromise = (async () => {
      try {
        for await (const message of stream) {
          if (message.type === "system" && message.subtype === "init") {
            record.sessionId = message.session_id;
            // A captured session_id and no result yet means the turn is
            // actively in-flight (pauseTask/sendMessage's "mid-stream"
            // precondition) — an in-memory transition only, no event.
            record.status = "running";
          } else if (message.type === "result") {
            // startTask/resumeTask/sendMessage must never report success on
            // an error result — only the "success" subtype completes; every
            // other subtype fails.
            const status: AgentTaskStatus = message.subtype === "success" ? "completed" : "failed";
            record.status = status;
            await emitStatus(taskId, status);
          }
        }
      } catch (err) {
        // Never crash the caller on a non-terminal stream error — log and
        // continue, matching apps/worker/src/poll-loop.ts's pattern.
        console.error(`ClaudeCodeRuntime.runQuery: stream error for task ${taskId}`, err);
      }
    })();
    record.runPromise = runPromise;
    await runPromise;
  }

  // Best-effort graceful stop shared by pauseTask/cancelTask (D-03): calls
  // the SDK's Query.interrupt() control request (per the installed
  // package's sdk.d.ts, this is "only supported when streaming input/output
  // is used" — runQuery's calls use a plain string prompt, so interrupt()
  // may reject or no-op here; that's fine, the grace-period race below is
  // the actual termination guarantee, not the interrupt call itself), then
  // waits up to GRACEFUL_TIMEOUT_MS for the in-flight runPromise to settle.
  // Returns true if it exited cleanly within the window, false if the
  // caller must hard-abort.
  async function attemptGracefulStop(record: TaskRecord): Promise<boolean> {
    try {
      await record.handle?.interrupt();
    } catch {
      // interrupt() is documented as streaming-input-only; a rejection here
      // just means "no clean interrupt available for this call shape" — the
      // grace-period + hard-abort fallback below still applies.
    }
    if (!record.runPromise) return true;
    return Promise.race([record.runPromise.then(() => true), sleep(GRACEFUL_TIMEOUT_MS).then(() => false)]);
  }

  return {
    async startTask(input: StartTaskInput): Promise<void> {
      tasks.set(input.taskId, { status: "starting", worktreePath: input.worktreePath });
      // Fire the "starting" event before the query() loop begins, not after.
      await emitStatus(input.taskId, "starting");
      await runQuery(input.taskId, input.prompt);
    },

    async getStatus(taskId: string): Promise<AgentTaskStatus> {
      const record = tasks.get(taskId);
      // Never invent state (Core Value) — an unknown taskId throws rather
      // than returning a fabricated status.
      if (!record) throw new Error("ClaudeCodeRuntime.getStatus: unknown taskId");
      return record.status;
    },

    async pauseTask(taskId: string): Promise<void> {
      const record = tasks.get(taskId);
      if (!record || !record.controller) {
        throw new Error("ClaudeCodeRuntime.pauseTask: task is not running");
      }
      const exitedCleanly = await attemptGracefulStop(record);
      if (!exitedCleanly) record.controller.abort();
      // The session_id used for a later resume is whatever was captured
      // during runQuery's init message handling, available before pause is
      // even possible (04-RESEARCH.md Pattern 2).
      record.status = "paused";
      await emitStatus(taskId, "paused");
    },

    async resumeTask(taskId: string): Promise<void> {
      const record = tasks.get(taskId);
      if (!record || !record.sessionId) {
        throw new Error("ClaudeCodeRuntime.resumeTask: no captured session to resume");
      }
      await runQuery(taskId, "Continue the task from where you left off", record.sessionId);
    },

    async cancelTask(_taskId: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02 Task 2");
    },

    async sendMessage(taskId: string, message: string): Promise<void> {
      const record = tasks.get(taskId);
      if (!record || !record.sessionId) {
        throw new Error("ClaudeCodeRuntime.sendMessage: no captured session to send a message to");
      }
      // The caller-supplied message becomes the new turn's prompt —
      // documented interpretation, see Plan 04-02's Task 1 Behavior Test 3.
      await runQuery(taskId, message, record.sessionId);
    },

    async requestReview(_taskId: string, _reason: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-03");
    },
    async requestHandoff(_taskId: string, _toAgentId: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-03");
    },
  };
}
