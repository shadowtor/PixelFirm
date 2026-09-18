import { pgTable, uuid, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Column set mirrors packages/event-schema's BaseEnvelope exactly — do not
// add or rename a column beyond what BaseEnvelope carries (BaseEnvelope is
// the single source of truth for the event shape).
export const events = pgTable("events", {
  id: uuid("id").primaryKey(), // matches CompanyEvent.id (z.string().uuid())
  type: text("type").notNull(),
  version: integer("version").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  companyId: text("company_id").notNull(),
  floorId: text("floor_id"),
  projectId: text("project_id"),
  taskId: text("task_id"),
  sourceAgentId: text("source_agent_id"),
  destinationAgentId: text("destination_agent_id"),
  visibility: text("visibility").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

// Per-worker credentials (D-03). Only a hash of the secret is ever
// persisted — never the secret itself, never reversibly encoded.
export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  secretHash: text("secret_hash").notNull(), // hex-encoded HMAC-SHA256 digest
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
