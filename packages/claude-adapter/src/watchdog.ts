// D-04 bounded-silence watchdog: no dependency on @anthropic-ai/claude-agent-sdk
// (a generic timer utility) — resets on every activity signal of any kind,
// fires onTimeout only when the timer expires with zero resets since the
// last reset. Factory function, not a class, matching this codebase's
// function-first style (no classes in git-adapter/gsd-adapter/poll-loop.ts).

// 100 seconds — within 04-RESEARCH.md's recommended 90-120s range for the
// slowest single tool call a real GSD phase might run (a full test suite, a
// large npm install). A tunable constant, not derived from external config.
export const DEFAULT_WATCHDOG_TIMEOUT_MS = 100_000;

export function createWatchdog(timeoutMs: number, onTimeout: () => void): { reset(): void; clear(): void } {
  let handle: NodeJS.Timeout | undefined;

  return {
    reset(): void {
      if (handle) clearTimeout(handle);
      handle = setTimeout(onTimeout, timeoutMs);
    },
    clear(): void {
      if (handle) clearTimeout(handle);
      handle = undefined;
    },
  };
}
