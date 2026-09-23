import { describe, it, expect } from "vitest";
import { CompanyEventSchema } from "./index.js";

function validCompanyStartedEvent() {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-18T00:00:00.000Z",
    companyId: "company-1",
    visibility: "INTERNAL" as const,
    type: "company.started" as const,
    payload: { name: "PixelFirm" },
  };
}

describe("CompanyEventSchema — company.started", () => {
  it("accepts a well-formed event with all required envelope fields", () => {
    const result = CompanyEventSchema.safeParse(validCompanyStartedEvent());
    expect(result.success).toBe(true);
  });

  it("rejects the same event with visibility removed", () => {
    const event = validCompanyStartedEvent() as Record<string, unknown>;
    delete event.visibility;
    const result = CompanyEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it("rejects the same event with an unknown type literal", () => {
    const event = { ...validCompanyStartedEvent(), type: "not.a.real.type" };
    const result = CompanyEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

// Shared envelope fields for the remaining 11 seeded event types below.
function baseFields() {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-18T00:00:00.000Z",
    companyId: "company-1",
    visibility: "INTERNAL" as const,
  };
}

function omitPayloadKey(event: Record<string, unknown>, key: string): Record<string, unknown> {
  const payload = { ...(event.payload as Record<string, unknown>) };
  delete payload[key];
  return { ...event, payload };
}

interface EventCase {
  type: string;
  extra: Record<string, unknown>;
  payload: Record<string, unknown>;
  requiredPayloadKey: string;
}

const cases: EventCase[] = [
  {
    type: "floor.created",
    extra: { floorId: "floor-1" },
    payload: { name: "Engineering Floor" },
    requiredPayloadKey: "name",
  },
  {
    type: "project.created",
    extra: { projectId: "project-1" },
    payload: { name: "PixelFirm MVP" },
    requiredPayloadKey: "name",
  },
  {
    type: "task.created",
    extra: { taskId: "task-1", projectId: "project-1" },
    payload: { title: "Build event schema" },
    requiredPayloadKey: "title",
  },
  {
    type: "agent.online",
    extra: { sourceAgentId: "agent-1" },
    payload: { name: "Ada", teamId: "team-eng" },
    requiredPayloadKey: "teamId",
  },
  {
    type: "session.started",
    extra: { sourceAgentId: "agent-1", taskId: "task-1" },
    payload: { worktreeId: "wt-1" },
    requiredPayloadKey: "worktreeId",
  },
  {
    type: "agent.handoff_requested",
    extra: { sourceAgentId: "agent-1" },
    payload: { taskId: "task-1", fromAgentId: "agent-1", toAgentId: "agent-2" },
    requiredPayloadKey: "toAgentId",
  },
  {
    type: "review.started",
    extra: { sourceAgentId: "agent-2" },
    payload: { taskId: "task-1" },
    requiredPayloadKey: "taskId",
  },
  {
    type: "ceo.approval_requested",
    extra: { taskId: "task-1" },
    payload: { taskId: "task-1", reason: "Ready for deployment" },
    requiredPayloadKey: "reason",
  },
  {
    type: "git.commit_created",
    extra: { taskId: "task-1", sourceAgentId: "agent-2" },
    payload: { sha: "abc123", message: "Implement feature" },
    requiredPayloadKey: "sha",
  },
  {
    type: "deployment.started",
    extra: { projectId: "project-1" },
    payload: { environment: "production" },
    requiredPayloadKey: "environment",
  },
  {
    type: "viewer.event",
    extra: {},
    payload: { viewerName: "someViewer" },
    requiredPayloadKey: "viewerName",
  },
];

for (const { type, extra, payload, requiredPayloadKey } of cases) {
  describe(`CompanyEventSchema — ${type}`, () => {
    function validEvent() {
      return { ...baseFields(), ...extra, type, payload };
    }

    it("accepts a well-formed event", () => {
      const result = CompanyEventSchema.safeParse(validEvent());
      expect(result.success).toBe(true);
    });

    it(`rejects a payload missing the required "${requiredPayloadKey}" field`, () => {
      const malformed = omitPayloadKey(validEvent(), requiredPayloadKey);
      const result = CompanyEventSchema.safeParse(malformed);
      expect(result.success).toBe(false);
    });
  });
}

describe("CompanyEventSchema — agent.handoff_requested fromAgentId (Phase 5)", () => {
  it("rejects a payload missing the required \"fromAgentId\" field", () => {
    const event = {
      ...baseFields(),
      sourceAgentId: "agent-1",
      type: "agent.handoff_requested",
      payload: { taskId: "task-1", toAgentId: "agent-2" },
    };
    const result = CompanyEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});
