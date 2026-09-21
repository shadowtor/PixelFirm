// Canonical AgentStatus contract — single source of truth for every other
// plan in Phase 5 (05-02 status-mapping fidelity, 05-03 real per-agent
// derivation, 05-04 handoff choreography). 15 values, corrects 05-CONTEXT.md
// D-01's inherited "14" miscount: PROJECT.md's own Agent States list and
// REQUIREMENTS.md OFFICE-01 both enumerate 15 distinct values when counted
// (RESEARCH.md Pitfall 1).
export const AgentStatus = {
  OFFLINE: "offline",
  IDLE: "idle",
  PLANNING: "planning",
  RESEARCHING: "researching",
  CODING: "coding",
  READING: "reading",
  TESTING: "testing",
  REVIEWING: "reviewing",
  DISCUSSING: "discussing",
  DEPLOYING: "deploying",
  BLOCKED: "blocked",
  WAITING_FOR_AGENT: "waiting_for_agent",
  WAITING_FOR_CEO: "waiting_for_ceo",
  FAILED: "failed",
  COMPLETED: "completed",
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];
