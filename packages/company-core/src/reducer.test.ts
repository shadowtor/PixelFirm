import { describe, it, expect } from "vitest";
import type { CompanyEvent } from "event-schema";
import { fold, reduce, emptyState } from "./reducer";
import { stubEventSequence } from "./fixtures/stub-events";

function companyStartedEvent(): CompanyEvent {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    version: 1,
    occurredAt: "2026-09-18T00:00:00.000Z",
    companyId: "company-1",
    visibility: "INTERNAL",
    type: "company.started",
    payload: { name: "PixelFirm" },
  } as CompanyEvent;
}

describe("fold — empty and single-event application", () => {
  it("fold([]) returns emptyState() untouched", () => {
    expect(fold([])).toEqual(emptyState());
  });

  it("fold([oneCompanyStartedEvent]) applies exactly the company.started handler", () => {
    const result = fold([companyStartedEvent()]);
    expect(result.companies["company-1"]).toBeDefined();
  });
});

describe("reduce — unknown event types", () => {
  it("returns the input state unchanged for an unrecognized type, never throws", () => {
    const state = emptyState();
    const unknownEvent = { ...companyStartedEvent(), type: "not.a.real.type" } as unknown as CompanyEvent;
    expect(() => reduce(state, unknownEvent)).not.toThrow();
    expect(reduce(state, unknownEvent)).toEqual(state);
  });
});

describe("replay determinism", () => {
  it("folding the same event twice from a fresh state produces deep-equal results", () => {
    const first = fold([companyStartedEvent()]);
    const second = fold([companyStartedEvent()]);
    expect(second).toEqual(first);
  });
});

describe("fold — full 12-event fixture (EVENT-03)", () => {
  it("populates every entity kind touched by the fixture", () => {
    const result = fold(stubEventSequence);

    expect(result.companies["company-1"]).toBeDefined();
    expect(result.floors["floor-1"]).toBeDefined();
    expect(result.projects["project-1"]).toBeDefined();
    expect(result.agents["agent-1"]).toBeDefined();
    expect(result.agents["agent-2"]).toBeDefined();
    expect(result.teams["team-eng"]).toBeDefined();
    expect(result.tasks["task-1"]).toBeDefined();
  });

  it("threads task status through handoff/review/approval/commit/deployment", () => {
    const result = fold(stubEventSequence);

    expect(result.tasks["task-1"].status).toBe("committed");
    expect(result.projects["project-1"].status).toBe("deploying");
    expect(result.agents["agent-1"].status).toBe("working");
    expect(result.agents["agent-2"].status).toBe("assigned");
  });
});

describe("replay determinism — full catalog scale (EVENT-04)", () => {
  it("folding the identical 12-event fixture array twice, each from a fresh empty state, produces deep-equal results", () => {
    const first = fold(stubEventSequence, emptyState());
    const second = fold(stubEventSequence, emptyState());
    expect(second).toEqual(first);
  });
});
