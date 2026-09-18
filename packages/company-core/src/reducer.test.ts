import { describe, it, expect } from "vitest";
import type { CompanyEvent } from "event-schema";
import { fold, reduce, emptyState } from "./reducer";

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
