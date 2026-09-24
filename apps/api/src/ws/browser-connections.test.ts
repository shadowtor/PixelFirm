import { beforeEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import {
  _resetBrowserSocketsForTests,
  acceptsCeo,
  acceptsOffice,
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

describe("per-socket event filter (Pitfall 2, T-06-06-01)", () => {
  const internal = { type: "event", event: { id: "i1", type: "task.status_changed", visibility: "INTERNAL" } };
  const privateCeo = { type: "event", event: { id: "p1", type: "ceo.approval_requested", visibility: "PRIVATE" } };

  function promoted(accepts?: typeof acceptsOffice) {
    const fake = fakeSocket();
    registerBrowserSocket(fake.socket, accepts);
    flushBrowserSocket(fake.socket);
    return fake;
  }

  it("an acceptsOffice socket gets the INTERNAL event and not the PRIVATE one", () => {
    const { sent } = promoted(acceptsOffice);
    broadcastToBrowsers(privateCeo);
    broadcastToBrowsers(internal);
    expect(sent.map((raw) => JSON.parse(raw))).toEqual([internal]);
  });

  it("registerBrowserSocket defaults to the office filter", () => {
    const { sent } = promoted();
    broadcastToBrowsers(privateCeo);
    expect(sent).toEqual([]);
  });

  it("an acceptsCeo socket gets ceo.* events only", () => {
    const { sent } = promoted(acceptsCeo);
    broadcastToBrowsers(internal);
    broadcastToBrowsers(privateCeo);
    expect(sent.map((raw) => JSON.parse(raw))).toEqual([privateCeo]);
  });

  it("a non-event message goes to both kinds of socket", () => {
    const office = promoted(acceptsOffice);
    const ceo = promoted(acceptsCeo);
    broadcastToBrowsers({ type: "control" });
    expect([office.sent.length, ceo.sent.length]).toEqual([1, 1]);
  });

  it("a buffering socket queues only what its filter accepts, still after the snapshot (CR-03)", () => {
    const { socket, sent } = fakeSocket();
    registerBrowserSocket(socket, acceptsOffice);
    broadcastToBrowsers(privateCeo);
    broadcastToBrowsers(internal);
    socket.send(JSON.stringify({ type: "snapshot", state: {} }));
    flushBrowserSocket(socket);
    expect(sent.map((raw) => JSON.parse(raw))).toEqual([{ type: "snapshot", state: {} }, internal]);
  });
});
