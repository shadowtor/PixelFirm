// Phase 6: workerId -> open worker socket, so the control plane can send a
// CEO decision down the WebSocket of the worker that owns the request. Same
// simple module-state style as connection-status.ts. Identity is always the
// authenticated request.workerId from routes/ws.ts, never a message field.
import type { WebSocket } from "ws";
import { WorkerDownlinkSchema, type WorkerDownlink } from "event-schema";

const workerSockets = new Map<string, WebSocket>();

/** A reconnect replaces the old socket. */
export function registerWorkerSocket(workerId: string, socket: WebSocket): void {
  workerSockets.set(workerId, socket);
}

/** Removes only if `socket` is still the registered one, so a stale close never drops a newer connection. */
export function unregisterWorkerSocket(workerId: string, socket: WebSocket): void {
  if (workerSockets.get(workerId) === socket) workerSockets.delete(workerId);
}

export function isWorkerConnected(workerId: string): boolean {
  const socket = workerSockets.get(workerId);
  return socket !== undefined && socket.readyState === socket.OPEN;
}

/**
 * SEC-03: every outbound message is parsed with the same closed schema the
 * worker broker safeParses, so nothing outside `decision` / `task.resume`
 * (and no stray key such as updatedInput) ever reaches a worker.
 */
export function sendToWorker(workerId: string, message: WorkerDownlink): boolean {
  const frame = WorkerDownlinkSchema.parse(message);
  if (!isWorkerConnected(workerId)) return false;
  workerSockets.get(workerId)!.send(JSON.stringify(frame));
  return true;
}

export function _resetWorkerSocketsForTests(): void {
  workerSockets.clear();
}
