import { beforeEach, describe, expect, it } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  OFFLINE_AFTER_MS,
  STALE_AFTER_MS,
  _resetRegistryForTests,
  getConnectionStatus,
  markSocketClosed,
  markSocketOpen,
  recordHeartbeat,
} from "./connection-status.js";

beforeEach(() => {
  _resetRegistryForTests();
});

describe("getConnectionStatus", () => {
  it("returns 'offline' for an unknown workerId (never fabricates presence)", () => {
    expect(getConnectionStatus("no-such-worker")).toBe("offline");
  });

  it("returns 'offline' for a socket-open entry that has never received a heartbeat", () => {
    markSocketOpen("worker-1");
    expect(getConnectionStatus("worker-1")).toBe("offline");
  });

  it("returns 'online' immediately after recordHeartbeat + markSocketOpen", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    markSocketOpen("worker-1");
    recordHeartbeat("worker-1", now);
    expect(getConnectionStatus("worker-1", now)).toBe("online");
  });

  it("returns 'stale' once silence exceeds STALE_AFTER_MS but not OFFLINE_AFTER_MS", () => {
    const heartbeatAt = new Date("2026-09-20T00:00:00.000Z");
    markSocketOpen("worker-1");
    recordHeartbeat("worker-1", heartbeatAt);

    const laterWithinOffline = new Date(heartbeatAt.getTime() + STALE_AFTER_MS + 1);
    expect(getConnectionStatus("worker-1", laterWithinOffline)).toBe("stale");

    const edgeOfOffline = new Date(heartbeatAt.getTime() + OFFLINE_AFTER_MS);
    expect(getConnectionStatus("worker-1", edgeOfOffline)).toBe("stale");
  });

  it("returns 'offline' once silence exceeds OFFLINE_AFTER_MS", () => {
    const heartbeatAt = new Date("2026-09-20T00:00:00.000Z");
    markSocketOpen("worker-1");
    recordHeartbeat("worker-1", heartbeatAt);

    const beyondOffline = new Date(heartbeatAt.getTime() + OFFLINE_AFTER_MS + 1);
    expect(getConnectionStatus("worker-1", beyondOffline)).toBe("offline");
  });

  it("returns 'offline' immediately after markSocketClosed, regardless of recent heartbeat history", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    markSocketOpen("worker-1");
    recordHeartbeat("worker-1", now);
    expect(getConnectionStatus("worker-1", now)).toBe("online");

    markSocketClosed("worker-1");
    expect(getConnectionStatus("worker-1", now)).toBe("offline");
  });

  it("sanity: thresholds match D-03 (stale = 1x interval, offline = 3x interval)", () => {
    expect(STALE_AFTER_MS).toBe(HEARTBEAT_INTERVAL_MS);
    expect(OFFLINE_AFTER_MS).toBe(HEARTBEAT_INTERVAL_MS * 3);
  });
});
