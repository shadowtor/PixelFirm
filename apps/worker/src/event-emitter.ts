import { randomUUID } from "node:crypto";

export type Visibility = "PRIVATE" | "INTERNAL" | "STREAM_SAFE" | "PUBLIC";

/**
 * Constructs a CompanyEventSchema-shaped envelope. INTERNAL is the default
 * visibility for this phase's structural git/GSD metadata — never
 * PRIVATE-only-implied secrets, never PUBLIC without Phase 7's stream-safety
 * filtering existing yet.
 */
export function buildEnvelope(
  companyId: string,
  type: string,
  payload: unknown,
  visibility: Visibility = "INTERNAL",
) {
  return {
    id: randomUUID(),
    version: 1,
    occurredAt: new Date().toISOString(),
    companyId,
    visibility,
    type,
    payload,
  };
}

/**
 * POSTs an event to the control plane's already-tested /events ingestion
 * path (apps/api/src/routes/events.ts). Logs, never throws, on any failure —
 * a single failed emit must not crash the poll loop or heartbeat sender.
 */
export async function postEvent(controlPlaneUrl: string, token: string, event: unknown): Promise<void> {
  try {
    const response = await fetch(`${controlPlaneUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      console.error(`postEvent: control plane responded ${response.status}`);
    }
  } catch (err) {
    console.error("postEvent: failed to reach control plane", err);
  }
}
