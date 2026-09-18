import { z } from "zod";
import { BaseEnvelope } from "../envelope";

const CompanyStartedPayload = z.object({ name: z.string() });

// D-01: seeded with exactly ONE discriminated-union member for this tracer task —
// composed via spread, never chained `.extend()` (Pitfall 2: quadratic typecheck
// cost as the union grows toward ~40 members in later phases).
export const CompanyEventSchema = z.discriminatedUnion("type", [
  z.object({ ...BaseEnvelope.shape, type: z.literal("company.started"), payload: CompanyStartedPayload }),
]);

export type CompanyEvent = z.infer<typeof CompanyEventSchema>;
