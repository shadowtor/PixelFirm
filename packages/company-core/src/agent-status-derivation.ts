import { AgentStatus } from "event-schema";
import type { AgentTaskStatus } from "orchestration-adapter";

export interface DeriveAgentStatusInput {
  taskStatus?: AgentTaskStatus;
  gsdCategory?: string;
}

// Phase 5 (OFFICE-01, 05-03): the pure, testable priority-ordered rule table
// replacing the ad hoc "idle"/"working"/"assigned" strings 05-01 left
// behind. Never returns AgentStatus.OFFLINE or AgentStatus.READING — both
// are structurally valid AgentStatus members but intentionally unreachable
// from this function: no live per-agent worker-liveness link and no
// tool-call-granularity signal exist yet (documented gap, not a bug).
export function deriveAgentStatus(input: DeriveAgentStatusInput): AgentStatus {
  const { taskStatus, gsdCategory } = input;

  // No active task.
  if (!taskStatus) return AgentStatus.IDLE;

  // Terminal statuses.
  if (taskStatus === "failed") return AgentStatus.FAILED;
  if (taskStatus === "completed") return AgentStatus.COMPLETED;
  // Task is over, not fabricating a "went wrong" signal for an intentional
  // cancellation.
  if (taskStatus === "cancelled") return AgentStatus.COMPLETED;

  // Not actively working, needs re-activation.
  if (taskStatus === "blocked") return AgentStatus.BLOCKED;
  if (taskStatus === "paused") return AgentStatus.BLOCKED;

  // requestReview always routes to CEO approval (Phase 4 D-08) — no
  // peer-review path exists.
  if (taskStatus === "waiting_for_review") return AgentStatus.WAITING_FOR_CEO;
  if (taskStatus === "waiting_for_handoff") return AgentStatus.WAITING_FOR_AGENT;

  // Only "starting" | "running" remain (AgentTaskStatus's 9 members are
  // exhausted above) — refine by gsdCategory, defaulting to CODING (the
  // default active fallback, most common real case, and also the fallback
  // for gsdCategory undefined/"unknown"/any unrecognized value).
  switch (gsdCategory) {
    case "research":
      return AgentStatus.RESEARCHING;
    case "planning":
    case "requirements":
    case "new_project":
      return AgentStatus.PLANNING;
    case "verification":
      return AgentStatus.TESTING;
    case "review":
      return AgentStatus.REVIEWING;
    case "approval":
      return AgentStatus.DISCUSSING;
    case "deployment":
      return AgentStatus.DEPLOYING;
    case "execution":
    default:
      return AgentStatus.CODING;
  }
}
