import { CompanyEventSchema, type CompanyEvent } from "event-schema";
import type { ProjectionState } from "company-core";

export interface OfficeSocketHandlers {
  onSnapshot(state: ProjectionState): void;
  onEvent(event: CompanyEvent): void;
}

/**
 * Opens the browser-facing WS connection to apps/api's /ws/browser Broadcast
 * Hub route. A native browser WebSocket cannot set an Authorization header
 * before the handshake, so the shared token travels as a query param.
 */
export function connectOfficeSocket(url: string, token: string, handlers: OfficeSocketHandlers): WebSocket {
  const socket = new WebSocket(`${url}/ws/browser?token=${encodeURIComponent(token)}`);

  socket.addEventListener("message", (event) => {
    let msg: unknown;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null || !("type" in msg)) return;

    const typed = msg as { type: unknown };
    if (typed.type === "snapshot") {
      const state = (msg as { state?: unknown }).state;
      handlers.onSnapshot(state as ProjectionState);
      return;
    }
    if (typed.type === "event") {
      // Defense in depth (T-05-02): never trust a relayed event's shape off
      // the wire without re-validating it client-side too, even though the
      // server already validated it before broadcasting.
      const parsed = CompanyEventSchema.safeParse((msg as { event?: unknown }).event);
      if (parsed.success) {
        handlers.onEvent(parsed.data);
      }
      return;
    }
  });

  return socket;
}
