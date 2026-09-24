import { CompanyEventSchema, type CompanyEvent } from "event-schema";
import type { DecisionsState } from "company-core";

export type FeedStatus = "Live" | "Reconnecting" | "Offline";

export interface CeoFeedHandlers {
  onSnapshot(state: DecisionsState): void;
  onEvent(event: CompanyEvent): void;
  onStatus(status: FeedStatus): void;
}

const MIN_DELAY = 1000;
const MAX_DELAY = 30_000;
const OFFLINE_AFTER = 30_000;

/**
 * The private decisions feed (06-06). Same origin, no query string: Cloudflare Access's
 * cookie rides the handshake, so no token ever lands in a URL or a log (T-06-14-03).
 * Every live event is re-validated with CompanyEventSchema before it reaches the UI.
 */
export function connectCeoFeed(handlers: CeoFeedHandlers): { close(): void } {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ceo/ws`;
  let socket: WebSocket;
  let status: FeedStatus | undefined;
  let delay = MIN_DELAY;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let offlineTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const report = (next: FeedStatus) => {
    if (next === status) return;
    status = next;
    handlers.onStatus(next);
  };

  const open = () => {
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      if (closed) return;
      delay = MIN_DELAY;
      clearTimeout(offlineTimer);
      offlineTimer = undefined;
      report("Live");
    });

    socket.addEventListener("message", (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null) return;
      const typed = msg as { type?: unknown; state?: unknown; event?: unknown };
      if (typed.type === "snapshot") {
        handlers.onSnapshot(typed.state as DecisionsState);
      } else if (typed.type === "event") {
        const parsed = CompanyEventSchema.safeParse(typed.event);
        if (parsed.success) handlers.onEvent(parsed.data);
      }
    });

    socket.addEventListener("close", () => {
      if (closed) return;
      if (status !== "Offline") {
        report("Reconnecting");
        offlineTimer ??= setTimeout(() => report("Offline"), OFFLINE_AFTER);
      }
      retryTimer = setTimeout(open, delay);
      delay = Math.min(delay * 2, MAX_DELAY);
    });
  };

  open();

  return {
    close() {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(offlineTimer);
      socket.close();
    },
  };
}
