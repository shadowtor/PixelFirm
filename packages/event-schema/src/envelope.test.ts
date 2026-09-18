import { describe, it, expect } from "vitest";
import { CompanyEventSchema } from "./index";

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
