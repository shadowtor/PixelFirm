// Phase 5: browser-facing Broadcast Hub registry. Same simple-module-state
// style as connection-status.ts. No heartbeat/staleness tracking needed for
// browser clients this phase (unlike worker connections, which drive
// online/stale/offline derivation for admin visibility).
//
// CR-03: the map value is the socket's delivery state — a string[] means it
// is still buffering (registered, snapshot not yet sent), null means it has
// been promoted to direct delivery. Buffering exists so /ws/browser can
// register BEFORE it awaits its snapshot SELECT (closing the window where a
// committed event reached neither the snapshot nor the relay) without
// breaking the "first message is always the snapshot" guarantee.
import type { WebSocket } from "ws";

const browserSockets = new Map<WebSocket, string[] | null>();

export function registerBrowserSocket(socket: WebSocket): void {
  browserSockets.set(socket, []);
}

/**
 * Promotes a socket from buffering to direct delivery, sending anything
 * queued since registration in order. Call immediately after the snapshot
 * send — never before, or the client receives live events with no baseline.
 */
export function flushBrowserSocket(socket: WebSocket): void {
  const queued = browserSockets.get(socket);
  if (queued === undefined) return; // never registered, or already unregistered
  browserSockets.set(socket, null);
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
 */
export function broadcastToBrowsers(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const [socket, queued] of browserSockets) {
    if (queued) {
      queued.push(payload);
    } else if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function _resetBrowserSocketsForTests(): void {
  browserSockets.clear();
}
