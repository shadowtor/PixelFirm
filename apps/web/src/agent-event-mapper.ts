import { AgentStatus, type CompanyEvent } from "event-schema";

// WR-02 (05-REVIEW.md): a pure, guarded event-to-upsert mapper. Guards
// against a schema-valid-but-identity-less agent.online/session.started
// event (sourceAgentId is z.string().optional() on BaseEnvelope) silently
// creating or mutating a bogus "undefined"-keyed Character — replaces
// App.tsx's prior `event.sourceAgentId!` non-null assertion.
export function deriveCharacterUpsertFromStatusEvent(
  event: CompanyEvent,
): { agentId: string; status: AgentStatus; name?: string } | null {
  if (event.type !== "agent.online" && event.type !== "session.started") return null;
  if (!event.sourceAgentId) return null;

  return {
    agentId: event.sourceAgentId,
    status: event.type === "agent.online" ? AgentStatus.IDLE : AgentStatus.CODING,
    name: event.type === "agent.online" ? event.payload.name : undefined,
  };
}
