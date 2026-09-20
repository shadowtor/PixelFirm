import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

// Matches apps/api/src/ws/connection-status.ts's HEARTBEAT_INTERVAL_MS (10s) —
// the two must stay numerically consistent (D-03).
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * D-03's exponential-backoff algorithm: 1s initial, doubling, capped at 30s,
 * 20-50% jitter. rand() is injectable so tests can make the bounds exact
 * without depending on real randomness.
 */
export function computeBackoffDelay(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(1000 * 2 ** attempt, 30_000);
  const jitterFactor = 0.2 + rand() * 0.3;
  return Math.round(base * (1 + jitterFactor));
}

export function deriveWsUrl(controlPlaneUrl: string): string {
  const url = new URL(controlPlaneUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
  return url.toString();
}

/**
 * Mirrors apps/api/src/routes/ws-auth.test.ts:37-39's real client construction
 * pattern — same {workerId}.{secret} Bearer scheme apps/api already validates,
 * no new auth mechanism.
 */
export function connectWorker(controlPlaneUrl: string, token: string): WebSocket {
  return new WebSocket(deriveWsUrl(controlPlaneUrl), { headers: { Authorization: `Bearer ${token}` } });
}

// Task 1 only: a minimal local envelope builder duplicated here because
// event-emitter.ts doesn't exist yet. Task 2 refactors this to call
// event-emitter.ts's shared buildEnvelope/postEvent instead.
function buildHeartbeatEnvelope(companyId: string) {
  return {
    id: randomUUID(),
    version: 1,
    occurredAt: new Date().toISOString(),
    companyId,
    visibility: "INTERNAL" as const,
    type: "worker.heartbeat" as const,
    payload: {},
  };
}

async function sendHeartbeat(controlPlaneUrl: string, token: string, companyId: string): Promise<void> {
  try {
    const response = await fetch(`${controlPlaneUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildHeartbeatEnvelope(companyId)),
    });
    if (!response.ok) {
      console.error(`worker heartbeat: control plane responded ${response.status}`);
    }
  } catch (err) {
    // A single failed emit must never crash the poll/heartbeat loop.
    console.error("worker heartbeat: failed to reach control plane", err);
  }
}

/**
 * companyId is required here (not in the plan's literal signature) because a
 * worker.heartbeat envelope's companyId field is mandatory on
 * event-schema's BaseEnvelope — omitting it would build an envelope that
 * fails CompanyEventSchema.safeParse server-side (Rule 3 fix: blocking issue).
 */
export function startHeartbeat(controlPlaneUrl: string, token: string, companyId: string): { stop(): void } {
  void sendHeartbeat(controlPlaneUrl, token, companyId);
  const handle = setInterval(() => {
    void sendHeartbeat(controlPlaneUrl, token, companyId);
  }, HEARTBEAT_INTERVAL_MS);
  return { stop: () => clearInterval(handle) };
}

export function startReconnectingConnection(
  controlPlaneUrl: string,
  token: string,
  onOpen?: (ws: WebSocket) => void,
  onClose?: () => void,
): { stop(): void } {
  let attempt = 0;
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (stopped) return;
    ws = connectWorker(controlPlaneUrl, token);
    ws.on("open", () => {
      attempt = 0;
      onOpen?.(ws as WebSocket);
    });
    ws.on("close", scheduleReconnect);
    ws.on("error", scheduleReconnect);
  }

  function scheduleReconnect(): void {
    onClose?.();
    if (stopped) return;
    const delay = computeBackoffDelay(attempt++);
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return {
    stop(): void {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.removeAllListeners();
      ws?.close();
    },
  };
}
