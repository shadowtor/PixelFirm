import { describe, it, expect } from "vitest";
import { AgentStatus } from "./agent-status";

// RESEARCH.md Pitfall 1: the phase's target state count is 15, not the 14
// CONTEXT.md's D-01 inherited. This test is the structural guard against
// that miscount ever silently reappearing.
describe("AgentStatus", () => {
  it("has exactly 15 members", () => {
    expect(Object.keys(AgentStatus).length).toBe(15);
  });

  it("matches the verbatim canonical list from PROJECT.md / REQUIREMENTS.md", () => {
    expect(Object.values(AgentStatus)).toEqual([
      "offline",
      "idle",
      "planning",
      "researching",
      "coding",
      "reading",
      "testing",
      "reviewing",
      "discussing",
      "deploying",
      "blocked",
      "waiting_for_agent",
      "waiting_for_ceo",
      "failed",
      "completed",
    ]);
  });
});
