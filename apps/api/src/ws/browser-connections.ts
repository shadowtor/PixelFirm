// Phase 5: browser-facing Broadcast Hub registry — a simple in-memory
// Set<WebSocket> of currently-open browser sockets. Same simple-module-state
// style as connection-status.ts. No heartbeat/staleness tracking needed for
// browser clients this phase (unlike worker connections, which drive
// online/stale/offline derivation for admin visibility).
import type { WebSocket } from "ws";

const browserSockets = new Set<WebSocket>();

export function registerBrowserSocket(socket: WebSocket): void {
  browserSockets.add(socket);
}

export function unregisterBrowserSocket(socket: WebSocket): void {
  browserSockets.delete(socket);
}

/** JSON.stringify's once, sends to every socket currently OPEN — skips any not open. */
export function broadcastToBrowsers(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const socket of browserSockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function _resetBrowserSocketsForTests(): void {
  browserSockets.clear();
}
