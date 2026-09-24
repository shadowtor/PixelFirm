import { describe, it, expect } from "vitest";
import { CompanyEventSchema } from "./index.js";
// Phase 6: namespace import so a not-yet-existing export fails inside the test
// body (an assertion-level RED), not as an ESM link failure.
import * as downlink from "../downlink.js";

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


const DECISION_ID = "0b6f7c1e-2a4d-4e8b-9f3a-6c5d4e3b2a10";

describe("Phase 6 payloads — ceo.approval_requested (additive) and the four new ceo.* members", () => {
  it("still parses a stored Phase 4 ceo.approval_requested row { taskId, reason }", () => {
    const event = { ...baseEnvelope(), type: "ceo.approval_requested", payload: { taskId: "task-1", reason: "r" } };
    expect(CompanyEventSchema.safeParse(event).success).toBe(true);
  });

  it("parses an enriched ceo.approval_requested payload", () => {
    const payload = {
      taskId: "task-1",
      reason: "Bash command matched a CEO-gated pattern: publish/deploy",
      decisionId: DECISION_ID,
      threadId: DECISION_ID,
      kind: "ceo_gated_tool",
      toolName: "Bash",
      toolInput: JSON.stringify({ command: "npm publish" }),
      questions: [
        {
          question: "Which?",
          header: "Pick",
          multiSelect: false,
          options: [{ label: "A", description: "a" }, { label: "B", description: "b", preview: "p" }],
        },
      ],
      title: "Publish",
      context: "ctx",
      recommendation: "rec",
      links: ["https://example.com"],
      diff: {
        files: [{ path: "a.ts", added: 1, removed: 2 }],
        unified: "@@",
        truncated: false,
        totalAdded: 1,
        totalRemoved: 2,
      },
      sessionId: "session-1",
      worktreePath: "F:/wt",
      workerBootId: DECISION_ID,
      workerId: "worker-1",
      taskTitle: "Ship it",
    };
    const parsed = CompanyEventSchema.safeParse({ ...baseEnvelope(), type: "ceo.approval_requested", payload });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.payload).toEqual(payload);
  });

  it("rejects a toolInput over 16000 characters", () => {
    const event = {
      ...baseEnvelope(),
      type: "ceo.approval_requested",
      payload: { taskId: "task-1", reason: "r", toolInput: "x".repeat(16_001) },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(false);
  });

  const newMembers: [string, Record<string, unknown>][] = [
    [
      "ceo.decision_made",
      { decisionId: DECISION_ID, taskId: "task-1", action: "request_changes", note: "n", answers: { q: "a" }, decidedBy: "ceo@example.com" },
    ],
    ["ceo.decision_applied", { decisionId: DECISION_ID, taskId: "task-1", action: "approve", outcome: "allowed" }],
    ["ceo.approval_expired", { decisionId: DECISION_ID, taskId: "task-1", reason: "worker_restarted" }],
    ["ceo.task_resume_requested", { taskId: "task-1", decidedBy: "ceo@example.com" }],
  ];

  it.each(newMembers)("parses %s with its required fields", (type, payload) => {
    expect(CompanyEventSchema.safeParse({ ...baseEnvelope(), type, payload }).success).toBe(true);
  });

  it.each(newMembers.filter(([, p]) => "decidedBy" in p))("rejects %s with a non-email decidedBy", (type, payload) => {
    const event = { ...baseEnvelope(), type, payload: { ...payload, decidedBy: "not-an-email" } };
    expect(CompanyEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects ceo.decision_applied with an unknown outcome", () => {
    const event = {
      ...baseEnvelope(),
      type: "ceo.decision_applied",
      payload: { decisionId: DECISION_ID, taskId: "task-1", action: "approve", outcome: "maybe" },
    };
    expect(CompanyEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("Phase 6 wire contract — WorkerDownlinkSchema / WorkerUplinkSchema", () => {
  it("accepts a decision frame", () => {
    const frame = { type: "decision", decisionId: DECISION_ID, action: "approve" };
    expect(downlink.WorkerDownlinkSchema.parse(frame)).toEqual(frame);
  });

  it("accepts a task.resume frame", () => {
    const frame = { type: "task.resume", taskId: "task-1", sessionId: "s", worktreePath: "F:/wt", agentId: "agent-1" };
    expect(downlink.WorkerDownlinkSchema.parse(frame)).toEqual(frame);
  });

  it("rejects any other message type (no prompt/command message exists, SEC-03)", () => {
    expect(downlink.WorkerDownlinkSchema.safeParse({ type: "task.start", prompt: "rm -rf /" }).success).toBe(false);
  });

  it("rejects an unknown action", () => {
    const frame = { type: "decision", decisionId: DECISION_ID, action: "auto_approve" };
    expect(downlink.WorkerDownlinkSchema.safeParse(frame).success).toBe(false);
  });

  it("strips an updatedInput field from a decision frame", () => {
    const parsed = downlink.WorkerDownlinkSchema.parse({
      type: "decision",
      decisionId: DECISION_ID,
      action: "approve",
      updatedInput: { command: "rm -rf /" },
    });
    expect(parsed).toEqual({ type: "decision", decisionId: DECISION_ID, action: "approve" });
  });

  it("accepts a hello uplink with a uuid bootId", () => {
    expect(downlink.WorkerUplinkSchema.safeParse({ type: "hello", bootId: DECISION_ID }).success).toBe(true);
    expect(downlink.WorkerUplinkSchema.safeParse({ type: "hello", bootId: "nope" }).success).toBe(false);
  });

  it("DecisionActionSchema lists exactly the five CEO actions", () => {
    expect(downlink.DecisionActionSchema.options).toEqual(["approve", "reject", "request_changes", "more_research", "discuss"]);
  });
});
