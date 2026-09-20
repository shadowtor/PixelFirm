// RUNTIME-01: AgentRuntime is the generic coding-agent orchestration contract.
// This file must never import `@anthropic-ai/claude-agent-sdk` or reference any
// Claude-Code-specific concept (session_id, permissionMode, tool names) — that is
// this package's structural enforcement of Anti-Pattern 3 (ARCHITECTURE.md).
// ClaudeCodeRuntime (packages/claude-adapter) is the first implementation, not a
// folded-in shared type.

export type AgentTaskStatus =
  | "starting"
  | "running"
  | "paused"
  | "blocked"
  | "waiting_for_review"
  | "waiting_for_handoff"
  | "completed"
  | "failed"
  | "cancelled";

export interface StartTaskInput {
  taskId: string;
  repoPath: string;
  worktreePath: string;
  prompt: string;
}

export interface AgentRuntime {
  startTask(input: StartTaskInput): Promise<void>;
  pauseTask(taskId: string): Promise<void>;
  resumeTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
  getStatus(taskId: string): Promise<AgentTaskStatus>;
  sendMessage(taskId: string, message: string): Promise<void>;
  requestReview(taskId: string, reason: string): Promise<void>;
  requestHandoff(taskId: string, toAgentId: string): Promise<void>;
}
