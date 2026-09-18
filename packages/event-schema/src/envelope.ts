import { z } from "zod";

export const VisibilitySchema = z.enum(["PRIVATE", "INTERNAL", "STREAM_SAFE", "PUBLIC"]);

// Shared envelope fields every event carries. `visibility` is required and never
// `.optional()`/`.default()` — Phase 7's stream-safety filtering (SAFE-01/SAFE-02)
// depends on every event carrying a real, explicit value here (EVENT-01 prohibition).
export const BaseEnvelope = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(), // D-04: schema version, starts at 1, no upcast machinery yet
  occurredAt: z.string().datetime(),
  companyId: z.string(),
  floorId: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  sourceAgentId: z.string().optional(),
  destinationAgentId: z.string().optional(),
  visibility: VisibilitySchema,
});
