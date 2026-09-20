import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWatchdog } from "./watchdog.js";

describe("createWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: reset() before every 1000ms window elapses prevents onTimeout from ever firing", () => {
    const onTimeout = vi.fn();
    const watchdog = createWatchdog(1000, onTimeout);

    watchdog.reset();
    vi.advanceTimersByTime(999);
    watchdog.reset();
    vi.advanceTimersByTime(999);
    watchdog.reset();
    vi.advanceTimersByTime(999);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("Test 2: with no further reset() calls, onTimeout fires exactly once at the 1000ms boundary — not before 999ms, not again by 2000ms", () => {
    const onTimeout = vi.fn();
    const watchdog = createWatchdog(1000, onTimeout);

    watchdog.reset();
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("Test 3: clear() before the timeout elapses prevents onTimeout from ever firing, even far past timeoutMs afterward", () => {
    const onTimeout = vi.fn();
    const watchdog = createWatchdog(1000, onTimeout);

    watchdog.reset();
    vi.advanceTimersByTime(500);
    watchdog.clear();
    vi.advanceTimersByTime(10_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
