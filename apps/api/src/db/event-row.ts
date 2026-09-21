import { CompanyEventSchema, type CompanyEvent } from "event-schema";
import type { events } from "./schema.js";

type EventRow = typeof events.$inferSelect;

// Converts one Drizzle `events` row into CompanyEvent's wire shape, then
// round-trips it through CompanyEventSchema.safeParse. A stored row failing
// its own schema is real corruption (the row was inserted after already
// passing this exact schema in routes/events.ts) — never silently swallowed,
// always thrown.
export function rowToCompanyEvent(row: EventRow): CompanyEvent {
  const candidate = {
    id: row.id,
    type: row.type,
    version: row.version,
    occurredAt: row.occurredAt.toISOString(),
    companyId: row.companyId,
    floorId: row.floorId ?? undefined,
    projectId: row.projectId ?? undefined,
    taskId: row.taskId ?? undefined,
    sourceAgentId: row.sourceAgentId ?? undefined,
    destinationAgentId: row.destinationAgentId ?? undefined,
    visibility: row.visibility,
    payload: row.payload,
  };

  const parsed = CompanyEventSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `Stored event row ${row.id} (type=${row.type}) failed CompanyEventSchema validation: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
