import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectOfficeSocket } from "./ws-client";

class MockWebSocket {
  url: string;
  listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    lastInstance = this;
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }

  removeEventListener(): void {}

  emit(type: string, event: unknown): void {
    for (const handler of this.listeners[type] ?? []) handler(event);
  }
}

let lastInstance: MockWebSocket;

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("connectOfficeSocket", () => {
  it("builds the URL with the token as a query param (browser WebSocket cannot set headers)", () => {
    connectOfficeSocket("ws://localhost:3000", "secret-token", { onSnapshot: vi.fn(), onEvent: vi.fn() });
    expect(lastInstance.url).toBe("ws://localhost:3000/ws/browser?token=secret-token");
  });

  it("dispatches a snapshot message to onSnapshot", () => {
    const onSnapshot = vi.fn();
    connectOfficeSocket("ws://localhost:3000", "t", { onSnapshot, onEvent: vi.fn() });

    const state = { agents: {}, tasks: {} };
    lastInstance.emit("message", { data: JSON.stringify({ type: "snapshot", state }) });

    expect(onSnapshot).toHaveBeenCalledWith(state);
  });

  it("re-validates and dispatches a valid relayed event to onEvent", () => {
    const onEvent = vi.fn();
    connectOfficeSocket("ws://localhost:3000", "t", { onSnapshot: vi.fn(), onEvent });

    const event = {
      id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      version: 1,
      occurredAt: "2026-09-21T00:00:00.000Z",
      companyId: "company-1",
      visibility: "INTERNAL",
      type: "worker.heartbeat",
      payload: {},
    };
    lastInstance.emit("message", { data: JSON.stringify({ type: "event", event }) });

    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it("does NOT call onEvent when the relayed event fails re-validation", () => {
    const onEvent = vi.fn();
    connectOfficeSocket("ws://localhost:3000", "t", { onSnapshot: vi.fn(), onEvent });

    const malformed = { id: "not-a-uuid", type: "worker.heartbeat" };
    lastInstance.emit("message", { data: JSON.stringify({ type: "event", event: malformed }) });

    expect(onEvent).not.toHaveBeenCalled();
  });
});
