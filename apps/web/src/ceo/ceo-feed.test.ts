import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectCeoFeed, type FeedStatus } from "./ceo-feed";

class MockWebSocket {
  url: string;
  closed = false;
  listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: unknown = {}): void {
    for (const handler of this.listeners[type] ?? []) handler(event);
  }
}

let sockets: MockWebSocket[];
const last = () => sockets[sockets.length - 1]!;

function handlers() {
  return { onSnapshot: vi.fn(), onEvent: vi.fn(), onStatus: vi.fn<(s: FeedStatus) => void>() };
}

const requested = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  version: 1,
  occurredAt: "2026-09-24T00:00:00.000Z",
  companyId: "company-1",
  visibility: "PRIVATE",
  sourceAgentId: "agent-1",
  type: "ceo.approval_requested",
  payload: { taskId: "task-1", reason: "Deploy?", decisionId: "11111111-1111-4111-8111-111111111111" },
};

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("location", { protocol: "https:", host: "ceo.example.test" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("connectCeoFeed", () => {
  it("opens the same-origin /ceo/ws with no query string (T-06-14-03)", () => {
    connectCeoFeed(handlers());
    expect(last().url).toBe("wss://ceo.example.test/ceo/ws");
  });

  it("uses ws: on an http: page", () => {
    vi.stubGlobal("location", { protocol: "http:", host: "127.0.0.1:5198" });
    connectCeoFeed(handlers());
    expect(last().url).toBe("ws://127.0.0.1:5198/ceo/ws");
  });

  it("hands a snapshot frame's state to onSnapshot", () => {
    const h = handlers();
    connectCeoFeed(h);
    const state = { records: {}, order: [], resumeRequestedAt: {} };
    last().emit("message", { data: JSON.stringify({ type: "snapshot", state }) });
    expect(h.onSnapshot).toHaveBeenCalledWith(state);
  });

  it("re-validates events: a valid one reaches onEvent, a malformed one is dropped (T-06-14-04)", () => {
    const h = handlers();
    connectCeoFeed(h);
    last().emit("message", { data: JSON.stringify({ type: "event", event: requested }) });
    last().emit("message", { data: JSON.stringify({ type: "event", event: { ...requested, id: "nope" } }) });
    last().emit("message", { data: "not json" });
    expect(h.onEvent).toHaveBeenCalledTimes(1);
    expect(h.onEvent.mock.calls[0]![0]).toMatchObject({ type: "ceo.approval_requested" });
  });

  it("reports Live, Reconnecting, then Offline after 30 s without reconnecting", () => {
    const h = handlers();
    connectCeoFeed(h);
    last().emit("open");
    last().emit("close");
    expect(h.onStatus.mock.calls.map((c) => c[0])).toEqual(["Live", "Reconnecting"]);

    // Every retry fails; the status stays Reconnecting until 30 s have passed.
    let failed = 1;
    for (let t = 0; t < 29_000; t += 1000) {
      vi.advanceTimersByTime(1000);
      while (sockets.length > failed) sockets[failed++]!.emit("close");
    }
    expect(h.onStatus.mock.calls.map((c) => c[0])).toEqual(["Live", "Reconnecting"]);
    vi.advanceTimersByTime(1000);
    expect(h.onStatus.mock.calls.map((c) => c[0])).toEqual(["Live", "Reconnecting", "Offline"]);
  });

  it("reconnects with 1 s doubling backoff capped at 30 s, and goes Live again on reopen", () => {
    const h = handlers();
    connectCeoFeed(h);
    const opened: number[] = [];
    let elapsed = 0;
    for (let i = 0; i < 8; i++) {
      const before = sockets.length;
      last().emit("close");
      while (sockets.length === before && elapsed < 60_000) {
        vi.advanceTimersByTime(100);
        elapsed += 100;
      }
      opened.push(elapsed);
      elapsed = 0;
    }
    expect(opened).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]);

    last().emit("open");
    expect(h.onStatus).toHaveBeenLastCalledWith("Live");
    // The backoff resets after a successful open.
    const before = sockets.length;
    last().emit("close");
    vi.advanceTimersByTime(1000);
    expect(sockets.length).toBe(before + 1);
  });

  it("close() stops reconnecting and closes the socket", () => {
    const h = handlers();
    const feed = connectCeoFeed(h);
    const socket = last();
    feed.close();
    expect(socket.closed).toBe(true);
    socket.emit("close");
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(1);
    expect(h.onStatus).not.toHaveBeenCalled();
  });
});
