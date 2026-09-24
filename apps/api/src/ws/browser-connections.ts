// Phase 5: browser-facing Broadcast Hub registry. Same simple-module-state
// style as connection-status.ts. No heartbeat/staleness tracking needed for
// browser clients this phase (unlike worker connections, which drive
// online/stale/offline derivation for admin visibility).
//
// CR-03: the entry's queue is the socket's delivery state — a string[] means it
// is still buffering (registered, snapshot not yet sent), null means it has
// been promoted to direct delivery. Buffering exists so /ws/browser can
// register BEFORE it awaits its snapshot SELECT (closing the window where a
// committed event reached neither the snapshot nor the relay) without
// breaking the "first message is always the snapshot" guarantee.
import type { WebSocket } from "ws";

// Phase 6 (Pitfall 2): each socket carries the filter for which events it may
// see. Office sockets never get PRIVATE (the first step of Phase 7 visibility
// filtering); CEO sockets get ceo.* only.
type EventFilter = (event: { type: string; visibility: string }) => boolean;

export const acceptsOffice: EventFilter = (e) => e.visibility !== "PRIVATE";
export const acceptsCeo: EventFilter = (e) => e.type.startsWith("ceo.");

const browserSockets = new Map<WebSocket, { queue: string[] | null; accepts: EventFilter }>();

export function registerBrowserSocket(socket: WebSocket, accepts: EventFilter = acceptsOffice): void {
  browserSockets.set(socket, { queue: [], accepts });
}

/**
 * Promotes a socket from buffering to direct delivery, sending anything
 * queued since registration in order. Call immediately after the snapshot
 * send — never before, or the client receives live events with no baseline.
 */
export function flushBrowserSocket(socket: WebSocket): void {
  const entry = browserSockets.get(socket);
  if (entry === undefined) return; // never registered, or already unregistered
  const queued = entry.queue;
  entry.queue = null;
  if (!queued || socket.readyState !== socket.OPEN) return;
  for (const payload of queued) {
    socket.send(payload);
  }
}

export function unregisterBrowserSocket(socket: WebSocket): void {
  browserSockets.delete(socket);
}

/**
 * JSON.stringify's once, then per socket either queues (still buffering) or
 * sends (promoted and OPEN). The readyState guard applies to the direct path
 * only — a socket mid-connect must still buffer, which is the whole point.
 * An { type: "event", event } message skips sockets whose filter rejects it,
 * before queueing or sending; any other message reaches every socket.
 */
export function broadcastToBrowsers(message: unknown): void {
  const payload = JSON.stringify(message);
  const m = message as { type?: unknown; event?: { type: string; visibility: string } } | null;
  const event = m?.type === "event" ? m.event : undefined;
  for (const [socket, { queue, accepts }] of browserSockets) {
    if (event && !accepts(event)) continue;
    if (queue) {
      queue.push(payload);
    } else if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function _resetBrowserSocketsForTests(): void {
  browserSockets.clear();
}
