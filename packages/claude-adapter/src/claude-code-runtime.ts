import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRuntime, AgentTaskStatus, StartTaskInput } from "orchestration-adapter";
import { buildEnvelope, postEvent } from "./event-emitter.js";

interface TaskRecord {
  sessionId?: string;
  status: AgentTaskStatus;
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

  return {
    async startTask(input: StartTaskInput): Promise<void> {
      tasks.set(input.taskId, { status: "starting" });
      // Fire the "starting" event before the query() loop begins, not after.
      await emitStatus(input.taskId, "starting");

      const stream = query({
        prompt: input.prompt,
        options: { cwd: input.worktreePath, permissionMode: "default" },
      });

      try {
        for await (const message of stream) {
          if (message.type === "system" && message.subtype === "init") {
            const record = tasks.get(input.taskId);
            if (record) record.sessionId = message.session_id;
          } else if (message.type === "result") {
            // startTask must never report success on an error result — only
            // the "success" subtype completes; every other subtype fails.
            const status: AgentTaskStatus = message.subtype === "success" ? "completed" : "failed";
            const record = tasks.get(input.taskId);
            if (record) record.status = status;
            else tasks.set(input.taskId, { status });
            await emitStatus(input.taskId, status);
          }
        }
      } catch (err) {
        // Never crash the caller on a non-terminal stream error — log and
        // continue, matching apps/worker/src/poll-loop.ts's pattern.
        console.error(`ClaudeCodeRuntime.startTask: stream error for task ${input.taskId}`, err);
      }
    },

    async getStatus(taskId: string): Promise<AgentTaskStatus> {
      const record = tasks.get(taskId);
      // Never invent state (Core Value) — an unknown taskId throws rather
      // than returning a fabricated status.
      if (!record) throw new Error("ClaudeCodeRuntime.getStatus: unknown taskId");
      return record.status;
    },

    async pauseTask(_taskId: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02/04-03");
    },
    async resumeTask(_taskId: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02/04-03");
    },
    async cancelTask(_taskId: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02/04-03");
    },
    async sendMessage(_taskId: string, _message: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02/04-03");
    },
    async requestReview(_taskId: string, _reason: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02/04-03");
    },
    async requestHandoff(_taskId: string, _toAgentId: string): Promise<void> {
      throw new Error("not implemented — see Plan 04-02/04-03");
    },
  };
}
