import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import { computeBackoffDelay, connectWorker, deriveWsUrl, startReconnectingConnection } from "./ws-client.js";

describe("computeBackoffDelay", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "attempt %i: returns >= base (1000*2^attempt, capped at 30000) and < 1.5x base for a fixed rand()",
    (attempt) => {
      const base = Math.min(1000 * 2 ** attempt, 30_000);
      const delay = computeBackoffDelay(attempt, () => 0);
      expect(delay).toBeGreaterThanOrEqual(base);
      expect(delay).toBeLessThan(base * 1.5);
    },
  );

  it("never exceeds the 30s base's 1.5x cap even at a high attempt count", () => {
    const delay = computeBackoffDelay(10, () => 0.999);
    expect(delay).toBeLessThan(30_000 * 1.5);
  });

  it("is monotonically non-decreasing in its base term across increasing attempts (fixed rand)", () => {
    let previous = -Infinity;
    for (let attempt = 0; attempt <= 6; attempt++) {
      const delay = computeBackoffDelay(attempt, () => 0);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });
});

describe("connectWorker", () => {
  let wss: WebSocketServer;
  let port: number;
  let receivedAuth: string | undefined;

  beforeAll(async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", resolve));
    const address = wss.address();
    port = typeof address === "object" && address ? address.port : 0;
    wss.on("connection", (_socket, req) => {
      receivedAuth = req.headers.authorization;
    });
  });

  afterAll(() => {
    wss.close();
  });

  it("connects to the derived ws:// URL with a Bearer Authorization header", async () => {
    const ws = connectWorker(`http://127.0.0.1:${port}`, "worker-1.secret");
    expect(ws.url).toBe(`ws://127.0.0.1:${port}/ws`);

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    expect(receivedAuth).toBe("Bearer worker-1.secret");
    ws.close();
  });

  it("swaps https: to wss: when deriving the WS URL (no real connection attempted)", () => {
    expect(deriveWsUrl("https://control-plane.example.com")).toBe("wss://control-plane.example.com/ws");
    expect(deriveWsUrl("http://127.0.0.1:3000")).toBe("ws://127.0.0.1:3000/ws");
  });
});

// Backstop must_have: "The worker's WS client reconnects after a forced
// socket close, using an increasing (never-decreasing) delay across
// consecutive failed attempts, capped at 30 seconds."
describe("startReconnectingConnection", () => {
  let wss: WebSocketServer;
  let port: number;
  let openCount: number;

  beforeAll(async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", resolve));
    const address = wss.address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  afterAll(() => {
    wss.close();
  });

  afterEach(() => {
    wss.removeAllListeners("connection");
  });

  it(
    "reconnects after a server-forced socket close",
    async () => {
      openCount = 0;
      wss.on("connection", (socket: WsSocket) => {
        openCount++;
        if (openCount === 1) {
          // Force-close the first connection almost immediately.
          socket.close();
        }
      });

      let opens = 0;
      const connection = startReconnectingConnection(`http://127.0.0.1:${port}`, "worker-1.secret", () => {
        opens++;
      });

      // attempt 0's backoff delay is ~1.2-1.5s (base 1000ms); give it
      // comfortable margin within the test's own timeout.
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));

      expect(opens).toBeGreaterThanOrEqual(2);
      connection.stop();
    },
    10_000,
  );

  // CR-01 regression: a real connection failure (refused/reset handshake)
  // emits both "error" and "close" for `ws` — both must not independently
  // schedule a reconnect timer, or the attempt counter and connection count
  // both double per failure.
  it(
    "does not double-schedule a reconnect when a connection failure emits both error and close",
    async () => {
      const net = await import("node:net");
      let connectionAttempts = 0;
      // Destroying the raw TCP socket mid-handshake forces `ws` to emit
      // "error" (socket hang up / ECONNRESET) followed by "close" for the
      // same failed attempt — the double-fire scenario CR-01 covers.
      const server = net.createServer((socket) => {
        connectionAttempts++;
        socket.destroy();
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      const failPort = typeof address === "object" && address ? address.port : 0;

      const connection = startReconnectingConnection(`http://127.0.0.1:${failPort}`, "worker-1.secret");

      // Backoff delays are attempt0: ~1.2-1.5s, attempt1: ~2.4-3.0s. A
      // double-scheduled reconnect leaks a second, overlapping timer at
      // attempt1's delay on the FIRST failure already, so by ~3.3s a buggy
      // implementation has made 3 connection attempts (initial + the
      // legitimate reconnect + the leaked one); the fixed implementation's
      // legitimate 3rd attempt cannot fire before ~3.6s, so it still shows
      // only 2.
      await new Promise<void>((resolve) => setTimeout(resolve, 3300));

      expect(connectionAttempts).toBe(2);

      connection.stop();
      server.close();
    },
    10_000,
  );
});
