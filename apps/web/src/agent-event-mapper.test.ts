import { describe, expect, it } from "vitest";
import { AgentStatus } from "event-schema";
import { deriveCharacterUpsertFromStatusEvent } from "./agent-event-mapper";

const BASE = {
  id: "11111111-1111-1111-1111-111111111111",
  version: 1,
  occurredAt: new Date().toISOString(),
  companyId: "company-1",
  visibility: "INTERNAL" as const,
};

describe("deriveCharacterUpsertFromStatusEvent", () => {
  // Test B (WR-02): missing sourceAgentId -> null
  it("returns null for an agent.online event with no sourceAgentId", () => {
    const event = {
      ...BASE,
      type: "agent.online" as const,
      payload: { name: "Ada", teamId: "team-1" },
    };
    expect(deriveCharacterUpsertFromStatusEvent(event)).toBeNull();
  });

  it("returns null for a session.started event with no sourceAgentId", () => {
    const event = {
      ...BASE,
      type: "session.started" as const,
      payload: { worktreeId: "wt-1" },
    };
    expect(deriveCharacterUpsertFromStatusEvent(event)).toBeNull();
  });

  // Test C (WR-02): well-formed events map correctly
  it("returns an IDLE upsert with name for a well-formed agent.online event", () => {
    const event = {
      ...BASE,
      type: "agent.online" as const,
      sourceAgentId: "agent-1",
      payload: { name: "Ada", teamId: "team-1" },
    };
    expect(deriveCharacterUpsertFromStatusEvent(event)).toEqual({
      agentId: "agent-1",
      status: AgentStatus.IDLE,
      name: "Ada",
    });
  });

  it("returns a CODING upsert with undefined name for a well-formed session.started event", () => {
    const event = {
      ...BASE,
      type: "session.started" as const,
      sourceAgentId: "agent-2",
      payload: { worktreeId: "wt-1" },
    };
    expect(deriveCharacterUpsertFromStatusEvent(event)).toEqual({
      agentId: "agent-2",
      status: AgentStatus.CODING,
      name: undefined,
    });
  });

  // Test D: unrelated event type -> null
  it("returns null for an unrelated event type", () => {
    const event = {
      ...BASE,
      type: "worker.heartbeat" as const,
      payload: {},
    };
    expect(deriveCharacterUpsertFromStatusEvent(event)).toBeNull();
  });
});
