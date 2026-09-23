import { describe, it, expect } from "vitest";
import { CompanyEventSchema } from "./index.js";

function baseEnvelope() {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-19T00:00:00.000Z",
    companyId: "company-1",
    visibility: "INTERNAL" as const,
  };
}

describe("Phase 3 payloads — worker.heartbeat, git.worktree_observed, gsd.phase_observed", () => {
  it("accepts a minimal valid worker.heartbeat event", () => {
    const event = {
      ...baseEnvelope(),
      type: "worker.heartbeat",
      payload: {},
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts a valid git.worktree_observed event", () => {
    const event = {
      ...baseEnvelope(),
      type: "git.worktree_observed",
      payload: {
        repoPath: "F:/Sidegigs/syncsmith",
        branch: "main",
        worktreePath: "F:/Sidegigs/syncsmith",
        headSha: "c41f51af54bbf1f9c78c501dac37511169926760",
        sessionId: "session-1",
      },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a git.worktree_observed event missing a required payload field", () => {
    const event = {
      ...baseEnvelope(),
      type: "git.worktree_observed",
      payload: {
        repoPath: "F:/Sidegigs/syncsmith",
        branch: "main",
        worktreePath: "F:/Sidegigs/syncsmith",
        // headSha and sessionId omitted
      },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(false);
  });

  it("accepts a valid gsd.phase_observed event", () => {
    const event = {
      ...baseEnvelope(),
      type: "gsd.phase_observed",
      payload: {
        phase: "03",
        status: "executing",
        category: "execution",
        role: "Engineering",
        active: true,
      },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts a gsd.phase_observed event with category 'unknown' (gsd-adapter's kept-prohibition fallback, T-03-07)", () => {
    const event = {
      ...baseEnvelope(),
      type: "gsd.phase_observed",
      payload: {
        status: "unknown",
        category: "unknown",
        role: "unknown",
        active: false,
      },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a gsd.phase_observed event missing a required payload field", () => {
    const event = {
      ...baseEnvelope(),
      type: "gsd.phase_observed",
      payload: {
        phase: "03",
        status: "executing",
        category: "execution",
        // role and active omitted
      },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("Phase 5 payload — agent.handoff_completed", () => {
  it("accepts a well-formed agent.handoff_completed event (17th union member round-trips)", () => {
    const event = {
      ...baseEnvelope(),
      type: "agent.handoff_completed",
      payload: { taskId: "task-1", toAgentId: "agent-2" },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects an agent.handoff_completed event missing toAgentId", () => {
    const event = {
      ...baseEnvelope(),
      type: "agent.handoff_completed",
      payload: { taskId: "task-1" },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(false);
  });
});
