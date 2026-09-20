// RUNTIME-04 / D-03: worker connection status is a live-derived projection
// over (a) the most recent heartbeat event's server-receipt time per
// workerId and (b) whether that worker's WS socket is currently open on
// this API process — never a separately persisted column (RESEARCH.md
// Pattern 5). Single-process, in-memory Map: no Redis, no new DB table.
export type ConnectionStatus = "online" | "stale" | "offline";

interface RegistryEntry {
  lastHeartbeatAt: Date | null;
  socketOpen: boolean;
}

const registry = new Map<string, RegistryEntry>();

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS;
export const OFFLINE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 3;

function getOrCreate(workerId: string): RegistryEntry {
  let entry = registry.get(workerId);
  if (!entry) {
    entry = { lastHeartbeatAt: null, socketOpen: false };
    registry.set(workerId, entry);
  }
  return entry;
}

export function markSocketOpen(workerId: string): void {
  getOrCreate(workerId).socketOpen = true;
}

export function markSocketClosed(workerId: string): void {
  getOrCreate(workerId).socketOpen = false;
}

export function recordHeartbeat(workerId: string, receivedAt: Date = new Date()): void {
  getOrCreate(workerId).lastHeartbeatAt = receivedAt;
}

// D-03 thresholds, exact: no entry, socket not open, or no heartbeat ever
// received all resolve to "offline" — absence of signal must never be
// interpreted as presence (this plan's flagged prohibition).
export function getConnectionStatus(workerId: string, now: Date = new Date()): ConnectionStatus {
  const entry = registry.get(workerId);
  if (!entry || !entry.socketOpen || entry.lastHeartbeatAt === null) {
    return "offline";
  }
  const silenceMs = now.getTime() - entry.lastHeartbeatAt.getTime();
  if (silenceMs <= STALE_AFTER_MS) return "online";
  if (silenceMs <= OFFLINE_AFTER_MS) return "stale";
  return "offline";
}

export function _resetRegistryForTests(): void {
  registry.clear();
}
