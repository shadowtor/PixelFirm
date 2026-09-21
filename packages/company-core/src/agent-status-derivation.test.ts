import { describe, it, expect } from "vitest";
import { AgentStatus } from "event-schema";
import type { AgentTaskStatus } from "orchestration-adapter";
import { deriveAgentStatus } from "./agent-status-derivation";

describe("deriveAgentStatus — no active task", () => {
  it("returns IDLE when taskStatus is undefined", () => {
    expect(deriveAgentStatus({ taskStatus: undefined })).toBe(AgentStatus.IDLE);
  });
});

describe("deriveAgentStatus — terminal task statuses", () => {
  it("returns FAILED for taskStatus 'failed'", () => {
    expect(deriveAgentStatus({ taskStatus: "failed" })).toBe(AgentStatus.FAILED);
  });

  it("returns COMPLETED for taskStatus 'completed'", () => {
    expect(deriveAgentStatus({ taskStatus: "completed" })).toBe(AgentStatus.COMPLETED);
  });

  it("returns COMPLETED for taskStatus 'cancelled' (task is over, not a fabricated 'went wrong' signal)", () => {
    expect(deriveAgentStatus({ taskStatus: "cancelled" })).toBe(AgentStatus.COMPLETED);
  });
});

describe("deriveAgentStatus — not-actively-working statuses", () => {
  it("returns BLOCKED for taskStatus 'blocked'", () => {
    expect(deriveAgentStatus({ taskStatus: "blocked" })).toBe(AgentStatus.BLOCKED);
  });

  it("returns BLOCKED for taskStatus 'paused'", () => {
    expect(deriveAgentStatus({ taskStatus: "paused" })).toBe(AgentStatus.BLOCKED);
  });

  it("returns WAITING_FOR_CEO for taskStatus 'waiting_for_review' (requestReview always routes to CEO approval, D-08)", () => {
    expect(deriveAgentStatus({ taskStatus: "waiting_for_review" })).toBe(AgentStatus.WAITING_FOR_CEO);
  });

  it("returns WAITING_FOR_AGENT for taskStatus 'waiting_for_handoff'", () => {
    expect(deriveAgentStatus({ taskStatus: "waiting_for_handoff" })).toBe(AgentStatus.WAITING_FOR_AGENT);
  });
});

describe("deriveAgentStatus — active statuses, refined by gsdCategory", () => {
  it("defaults to CODING for taskStatus 'starting' with gsdCategory undefined", () => {
    expect(deriveAgentStatus({ taskStatus: "starting", gsdCategory: undefined })).toBe(AgentStatus.CODING);
  });

  it("defaults to CODING for taskStatus 'running' with gsdCategory 'unknown'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "unknown" })).toBe(AgentStatus.CODING);
  });

  it("returns RESEARCHING for gsdCategory 'research'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "research" })).toBe(AgentStatus.RESEARCHING);
  });

  it("returns PLANNING for gsdCategory 'planning'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "planning" })).toBe(AgentStatus.PLANNING);
  });

  it("returns PLANNING for gsdCategory 'requirements'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "requirements" })).toBe(AgentStatus.PLANNING);
  });

  it("returns PLANNING for gsdCategory 'new_project'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "new_project" })).toBe(AgentStatus.PLANNING);
  });

  it("returns CODING for gsdCategory 'execution'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "execution" })).toBe(AgentStatus.CODING);
  });

  it("returns TESTING for gsdCategory 'verification'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "verification" })).toBe(AgentStatus.TESTING);
  });

  it("returns REVIEWING for gsdCategory 'review'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "review" })).toBe(AgentStatus.REVIEWING);
  });

  it("returns DISCUSSING for gsdCategory 'approval'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "approval" })).toBe(AgentStatus.DISCUSSING);
  });

  it("returns DEPLOYING for gsdCategory 'deployment'", () => {
    expect(deriveAgentStatus({ taskStatus: "running", gsdCategory: "deployment" })).toBe(AgentStatus.DEPLOYING);
  });
});

describe("deriveAgentStatus — OFFLINE and READING are unreachable (documented gap)", () => {
  it("never returns OFFLINE or READING for any input in AgentTaskStatus's full domain", () => {
    const allTaskStatuses: (AgentTaskStatus | undefined)[] = [
      undefined,
      "starting",
      "running",
      "paused",
      "blocked",
      "waiting_for_review",
      "waiting_for_handoff",
      "completed",
      "failed",
      "cancelled",
    ];
    const allCategories: (string | undefined)[] = [
      undefined,
      "unknown",
      "new_project",
      "research",
      "requirements",
      "planning",
      "execution",
      "verification",
      "review",
      "approval",
      "deployment",
    ];

    for (const taskStatus of allTaskStatuses) {
      for (const gsdCategory of allCategories) {
        const result = deriveAgentStatus({ taskStatus, gsdCategory });
        expect(result).not.toBe(AgentStatus.OFFLINE);
        expect(result).not.toBe(AgentStatus.READING);
      }
    }
  });
});
