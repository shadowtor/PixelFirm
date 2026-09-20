import type { AgentRuntime } from "orchestration-adapter";

// RED-phase stub: not implemented yet. GREEN phase replaces this with the real
// factory wired to @anthropic-ai/claude-agent-sdk's query().
export function createClaudeCodeRuntime(_options: {
  companyId: string;
  controlPlaneUrl: string;
  token: string;
}): AgentRuntime {
  throw new Error("createClaudeCodeRuntime: not implemented yet (RED phase stub)");
}
