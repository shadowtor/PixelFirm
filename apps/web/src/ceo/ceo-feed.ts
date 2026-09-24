import type { CompanyEvent } from "event-schema";
import type { DecisionsState } from "company-core";

export type FeedStatus = "Live" | "Reconnecting" | "Offline";

export interface CeoFeedHandlers {
  onSnapshot(state: DecisionsState): void;
  onEvent(event: CompanyEvent): void;
  onStatus(status: FeedStatus): void;
}

// RED stub: 06-14 Task 1 implements this.
export function connectCeoFeed(_handlers: CeoFeedHandlers): { close(): void } {
  new WebSocket("ws://unimplemented");
  return { close() {} };
}
