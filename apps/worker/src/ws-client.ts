import { WebSocket } from "ws";
import { buildEnvelope, postEvent } from "./event-emitter.js";

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

function sendHeartbeat(controlPlaneUrl: string, token: string, companyId: string, isStopped: () => boolean): void {
  if (isStopped()) return;
  void postEvent(controlPlaneUrl, token, buildEnvelope(companyId, "worker.heartbeat", {}));
}

/**
 * companyId is required here (not in the plan's literal signature) because a
 * worker.heartbeat envelope's companyId field is mandatory on
 * event-schema's BaseEnvelope — omitting it would build an envelope that
 * fails CompanyEventSchema.safeParse server-side (Rule 3 fix: blocking issue).
 */
export function startHeartbeat(controlPlaneUrl: string, token: string, companyId: string): { stop(): void } {
  let stopped = false;
  const isStopped = () => stopped;
  sendHeartbeat(controlPlaneUrl, token, companyId, isStopped);
  const handle = setInterval(() => sendHeartbeat(controlPlaneUrl, token, companyId, isStopped), HEARTBEAT_INTERVAL_MS);
  return {
    stop(): void {
      stopped = true;
      clearInterval(handle);
    },
  };
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
    // "error" is always followed by "close" for `ws` on a connection
    // failure — listening on both would double-schedule a reconnect (and
    // double-increment the backoff attempt counter) for a single failure.
    // Only "close" drives the reconnect; "error" is swallowed here.
    ws.on("close", scheduleReconnect);
    ws.on("error", () => {
      /* swallow: "close" will still fire and drive the reconnect */
    });
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
