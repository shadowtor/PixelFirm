import { randomUUID } from "node:crypto";

export type Visibility = "PRIVATE" | "INTERNAL" | "STREAM_SAFE" | "PUBLIC";

/**
 * Local copy of apps/worker/src/event-emitter.ts's buildEnvelope/postEvent pair.
 * Deliberately duplicated (~20 lines) rather than importing the app — packages
 * must never depend on an app (that would be the first reverse-direction import
 * in this monorepo). taskId is a required 4th param here, unlike apps/worker's
 * optional one, since every event this package emits always has a real taskId.
 */
export function buildEnvelope(
  companyId: string,
  type: string,
  payload: unknown,
  taskId: string,
  visibility: Visibility = "INTERNAL",
  // Phase 5 addition (HANDOFF-01): the owning agent for this event, when
  // known. Omitted from the returned envelope entirely (never `undefined`)
  // when not provided — callers without a known agentId yet must not emit a
  // fabricated placeholder.
  sourceAgentId?: string,
) {
  return {
    id: randomUUID(),
    version: 1,
    occurredAt: new Date().toISOString(),
    companyId,
    taskId,
    visibility,
    type,
    payload,
    ...(sourceAgentId !== undefined ? { sourceAgentId } : {}),
  };
}

/**
 * POSTs an event to the control plane's /events ingestion path. Logs, never
 * throws, on any failure — a single failed emit must not crash ClaudeCodeRuntime's
 * startTask loop.
 */
export async function postEvent(controlPlaneUrl: string, token: string, event: unknown): Promise<void> {
  try {
    const response = await fetch(`${controlPlaneUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
      // WR-02: a hung control plane (accepts the TCP connection but never
      // responds) must degrade to a logged failure, not a permanent hang —
      // this fetch has no relationship to ClaudeCodeRuntime's own
      // AbortController, so without its own bound, cancelTask's abort can
      // never unstick it.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`postEvent: control plane responded ${response.status}`);
    }
  } catch (err) {
    console.error("postEvent: failed to reach control plane", err);
  }
}
