import { beforeEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import {
  _resetBrowserSocketsForTests,
  broadcastToBrowsers,
  flushBrowserSocket,
  registerBrowserSocket,
  unregisterBrowserSocket,
} from "./browser-connections.js";

// Minimal WebSocket stand-in — only the three members the registry actually
// touches (readyState, the OPEN constant, send). Matches
// connection-status.test.ts's module-state style: no server, no real socket.
function fakeSocket(readyState = 1) {
  const sent: string[] = [];
  const socket = {
    readyState,
    OPEN: 1,
    send: (payload: string) => {
      sent.push(payload);
    },
  };
  return { socket: socket as unknown as WebSocket, sent };
}

beforeEach(() => {
  _resetBrowserSocketsForTests();
});

describe("browser socket buffering (CR-03)", () => {
  it("Test 1: a registered but not-yet-flushed socket receives nothing at the moment of the broadcast", () => {
    const { socket, sent } = fakeSocket();
    registerBrowserSocket(socket);

    broadcastToBrowsers({ type: "event", event: { id: "e1" } });

    expect(sent).toEqual([]);
  });

  it("Test 2 (CR-03 regression): an event broadcast during the snapshot window is delivered after the snapshot, in order", () => {
    const { socket, sent } = fakeSocket();

    registerBrowserSocket(socket); // before the snapshot SELECT
    broadcastToBrowsers({ type: "event", event: { id: "e1" } }); // commits mid-SELECT
    socket.send(JSON.stringify({ type: "snapshot", state: {} })); // snapshot sent first
    flushBrowserSocket(socket);

    expect(sent.map((raw) => JSON.parse(raw))).toEqual([
      { type: "snapshot", state: {} },
      { type: "event", event: { id: "e1" } },
    ]);
  });

  it("Test 3: after the flush, a further broadcast reaches the socket immediately with no second flush", () => {
    const { socket, sent } = fakeSocket();
    registerBrowserSocket(socket);
    flushBrowserSocket(socket);

    broadcastToBrowsers({ type: "event", event: { id: "e2" } });

    expect(sent.map((raw) => JSON.parse(raw))).toEqual([{ type: "event", event: { id: "e2" } }]);
  });

  it("Test 4: an unregistered socket receives nothing, buffered or flushed", () => {
    const { socket, sent } = fakeSocket();
    registerBrowserSocket(socket);
    broadcastToBrowsers({ type: "event", event: { id: "e3" } });
    unregisterBrowserSocket(socket);

    flushBrowserSocket(socket); // the queue went with the entry
    broadcastToBrowsers({ type: "event", event: { id: "e4" } });

    expect(sent).toEqual([]);
  });

  it("Test 5: a socket that is not OPEN at flush time neither throws nor leaves a buffer behind", () => {
    const { socket, sent } = fakeSocket(3 /* CLOSED */);
    registerBrowserSocket(socket);
    broadcastToBrowsers({ type: "event", event: { id: "e5" } });

    expect(() => flushBrowserSocket(socket)).not.toThrow();
    expect(sent).toEqual([]);

    // Promoted despite the closed state — a later broadcast takes the direct
    // path (and is still skipped by the readyState guard), never re-queues.
    broadcastToBrowsers({ type: "event", event: { id: "e6" } });
    expect(sent).toEqual([]);
  });
});
