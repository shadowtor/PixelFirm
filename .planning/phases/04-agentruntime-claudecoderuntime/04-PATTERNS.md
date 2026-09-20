# Phase 4: AgentRuntime & ClaudeCodeRuntime - Pattern Map

**Mapped:** 2026-09-20
**Files analyzed:** 9
**Analogs found:** 8 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/orchestration-adapter/package.json` | config | — | `packages/git-adapter/package.json` | exact (naming/scripts convention) |
| `packages/orchestration-adapter/src/types.ts` | model | request-response (interface contract) | `packages/event-schema/src/envelope.ts` (contract-only, zero-I/O package) | role-match |
| `packages/orchestration-adapter/src/index.ts` | utility (barrel export) | — | `packages/gsd-adapter/src/index.ts` (barrel + composed export) | exact |
| `packages/claude-adapter/package.json` | config | — | `packages/gsd-adapter/package.json` | exact |
| `packages/claude-adapter/src/claude-code-runtime.ts` | service | event-driven + streaming | `apps/worker/src/poll-loop.ts` (stream/tick → diff → emit event pattern) | role-match |
| `packages/claude-adapter/src/watchdog.ts` | utility | event-driven (timer) | `apps/worker/src/poll-loop.ts` (closure-scoped state + `stop()` handle pattern) | role-match |
| `packages/claude-adapter/src/signal-detection.ts` | utility | event-driven | `packages/gsd-adapter/src/role-mapping.ts` (pure classification function, no I/O) | role-match |
| `packages/claude-adapter/src/*.test.ts` | test | — | `packages/git-adapter/src/worktree.test.ts`, `packages/gsd-adapter/src/role-mapping.test.ts` | exact |
| `apps/worker/src/event-emitter.ts` (extend `buildEnvelope` with `taskId`) | utility | event-driven | itself (existing file, modify in place) | exact |
| `packages/event-schema/src/payloads/index.ts` (add `task.status_changed` member) | model | event-driven | itself (existing file, additive-only pattern already established) | exact |

## Pattern Assignments

### `packages/orchestration-adapter/src/types.ts` + `index.ts` (model + barrel, zero SDK deps)

**Analog:** `packages/event-schema/src/envelope.ts` + `packages/gsd-adapter/src/index.ts`

**Contract-only pattern** — a package with zero I/O, just types/schema (envelope.ts lines 1-19):
```typescript
import { z } from "zod";

export const VisibilitySchema = z.enum(["PRIVATE", "INTERNAL", "STREAM_SAFE", "PUBLIC"]);

export const BaseEnvelope = z.object({
  id: z.string().uuid(),
  ...
});
```
`orchestration-adapter` follows this same shape but with plain TS interfaces (no zod needed — it's an interface contract, not a wire schema). Critical constraint from RESEARCH.md: **zero import of `@anthropic-ai/claude-agent-sdk`, ever**, mirroring how `event-schema` has zero dependency on any adapter package.

**Barrel export pattern** (gsd-adapter/src/index.ts lines 1-17):
```typescript
export { readStateMd, STATUS_EXACT_TOKENS } from "./state-md.js";
export type { StateMdResult } from "./state-md.js";
export { scanPhaseDir } from "./phase-files.js";
export type { PhaseFilesResult } from "./phase-files.js";
```
Use the same "re-export named symbols + separately re-export their types" convention (`export type { ... }` split from `export { ... }`) — not `export *`.

---

### `packages/claude-adapter/package.json`

**Analog:** `packages/gsd-adapter/package.json` (lines 1-14)

```json
{
  "name": "claude-adapter",
  "private": true,
  "type": "module",
  "version": "0.0.0",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.3",
    "orchestration-adapter": "workspace:*",
    "gsd-adapter": "workspace:*",
    "event-schema": "workspace:*"
  }
}
```
Matches exact convention: flat unscoped name = directory basename, `main: "src/index.ts"`, `workspace:*` for internal deps, no build step (tsx/vitest run against TS source directly, same as git-adapter/gsd-adapter/worker).

---

### `packages/claude-adapter/src/claude-code-runtime.ts` (service, event-driven/streaming)

**Analog:** `apps/worker/src/poll-loop.ts`

**Closure-scoped state + stop() handle pattern** (poll-loop.ts lines 38-59, 156-166):
```typescript
export function startPollLoop(options: StartPollLoopOptions): { stop(): void } {
  const { repoPath, planningDir, ... } = options;
  const worktrees = new Map<string, WorktreeSnapshot>();
  let gsd: GsdSnapshot | null = null;
  let stopped = false; // checked before every side-effecting call, so stop() is real

  async function tick(): Promise<void> { /* ... */ }

  void tick();
  const handle = setInterval(() => { void tick(); }, intervalMs);
  return { stop(): void { stopped = true; clearInterval(handle); } };
}
```
`ClaudeCodeRuntime` should follow the same shape: a `startTask`/`resumeTask` call kicks off a `for await (const message of query(...))` loop (RESEARCH.md Pattern 1), resetting a watchdog timer per message (RESEARCH.md Pitfall 2), with a `stopped`-style guard so `cancelTask`'s hard-kill path doesn't race a still-draining async generator into emitting a stale event.

**Diff-then-emit pattern** (poll-loop.ts lines 125-145): only emit `CompanyEvent`s on genuine state transitions, never on every tick/message — reuse this exact "compute `next`, compare against last-seen, only `postEvent` if `changed`" shape for `getStatus()`'s status transitions.

**Error handling: never let a transient failure crash the loop** (poll-loop.ts lines 92-96, 146-148):
```typescript
} catch (err) {
  console.error("poll-loop: listWorktrees failed, skipping this tick's git observation", err);
}
```
Apply the same "log and continue" discipline to `query()` stream errors that aren't the terminal `result` message.

**Event emission** (event-emitter.ts lines 11-46) — reuse directly, don't reimplement:
```typescript
export function buildEnvelope(companyId, type, payload, visibility = "INTERNAL") {
  return { id: randomUUID(), version: 1, occurredAt: new Date().toISOString(), companyId, visibility, type, payload };
}
export async function postEvent(controlPlaneUrl, token, event) {
  try {
    const response = await fetch(`${controlPlaneUrl}/events`, { method: "POST", headers: {...}, body: JSON.stringify(event) });
    if (!response.ok) console.error(...);
  } catch (err) { console.error("postEvent: failed to reach control plane", err); }
}
```
Note RESEARCH.md's flagged gap: `buildEnvelope` has no `taskId` param yet (WR-02, poll-loop.ts lines 81-88 comment) — this phase must extend `buildEnvelope`'s signature to accept an optional `taskId` (it already exists on `BaseEnvelope`, envelope.ts line 15) rather than constructing envelopes ad hoc in `claude-adapter`.

---

### `packages/claude-adapter/src/watchdog.ts` (utility, event-driven timer)

**Analog:** `apps/worker/src/poll-loop.ts`'s interval/closure pattern (same file, different angle)

Reuse the "reset on activity, fire on silence" shape already implicit in poll-loop's `setInterval`/`stop()` combo, but inverted: reset a single timer on every yielded SDK message of any type, and fire a callback (→ `blocked`/`failed` status transition) only if the timer expires with zero resets. Keep it a small pure module exporting a factory function (`createWatchdog(timeoutMs, onTimeout)`) rather than a class, matching this codebase's function-first style (no classes found in git-adapter/gsd-adapter/poll-loop.ts).

---

### `packages/claude-adapter/src/signal-detection.ts` (utility, event-driven classification)

**Analog:** `packages/gsd-adapter/src/role-mapping.ts` (pure function, no I/O, input → classification output)

Follow the same "pure classification function with a typed input/result interface, no side effects" shape gsd-adapter's `mapToGsdCategory` uses (see `GsdObservation`/`RoleMappingInput`/`RoleMappingResult` types in `packages/gsd-adapter/src/index.ts` lines 6, 12-17). `signal-detection.ts` should export a pure function like `classifySignal(toolName, input): ReviewSignal | null` that `canUseTool`/`Notification` hook callbacks call into, keeping the actual SDK callback wiring thin in `claude-code-runtime.ts` and the classification logic independently unit-testable without mocking the SDK.

---

### `packages/claude-adapter/src/*.test.ts` (test)

**Analog:** `packages/gsd-adapter/src/role-mapping.test.ts` (pure-function unit test, no fixtures) for `signal-detection.test.ts`/`watchdog.test.ts`; `packages/git-adapter/src/worktree.test.ts` (lines 1-40) for any test needing a real fixture:
```typescript
import { execa } from "execa";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("worktree.ts", () => {
  let repoDir: string;
  beforeAll(async () => { repoDir = await mkdtemp(join(tmpdir(), "git-adapter-worktree-fixture-")); /* ... */ });
  afterAll(async () => { await rm(repoDir, { recursive: true, force: true }); });
  it("...", async () => { /* ... */ });
});
```
For `claude-code-runtime.test.ts`, mock `query()` as a fake async generator (RESEARCH.md Wave 0 gap) rather than hitting a real Claude Code session — no existing analog for mocking an async generator in this repo; write it fresh following vitest's standard `vi.fn()`/module-mock conventions. The real-auth integration test is a separate `test:integration` script, env-gated (`CLAUDE_CODE_INTEGRATION_TEST=1`), not part of the default `pnpm test` run — no existing gated-test analog in this repo; this is new territory, keep it a single thin script.

---

## Shared Patterns

### Event emission (buildEnvelope/postEvent)
**Source:** `apps/worker/src/event-emitter.ts` (full file, 46 lines)
**Apply to:** `claude-code-runtime.ts` for every task-lifecycle transition (`task.status_changed`, `ceo.approval_requested`, `agent.handoff_requested`)
**Required modification:** extend `buildEnvelope`'s signature to accept an optional `taskId` so it lands in `BaseEnvelope.taskId` (already `z.string().optional()` in `envelope.ts` line 15) — do not construct envelopes by hand in `claude-adapter`.

### Additive event-schema extension (never `.extend()` chaining)
**Source:** `packages/event-schema/src/payloads/index.ts` lines 53-58 (comment) and lines 72-76 (Phase 3's own additive pattern)
**Apply to:** adding `task.status_changed` as new discriminated-union member #16, appended after the existing 15, reusing existing `ceo.approval_requested`/`agent.handoff_requested` members as-is (payloads already match exactly — `{taskId, reason}` and `{taskId, toAgentId}`) rather than inventing new event types for review/handoff.
```typescript
const TaskStatusChangedPayload = z.object({
  taskId: z.string(),
  status: z.enum(["starting","running","paused","blocked","waiting_for_review","waiting_for_handoff","completed","failed","cancelled"]),
});
// appended as member 16:
z.object({ ...BaseEnvelope.shape, type: z.literal("task.status_changed"), payload: TaskStatusChangedPayload }),
```

### Never crash the host loop on a transient error
**Source:** `apps/worker/src/poll-loop.ts` lines 92-96, 146-148 — `try/catch` + `console.error` + continue, never rethrow/crash.
**Apply to:** all of `claude-code-runtime.ts`'s stream-consumption and hook-callback code paths.

### Package/module boundary discipline (Anti-Pattern 3 enforcement)
**Source:** `packages/event-schema/package.json` (zero deps but `zod`) and `packages/company-core/package.json` (only depends on `event-schema`) — the existing "thin contract package with minimal deps" precedent.
**Apply to:** `orchestration-adapter` must have zero dependency on `@anthropic-ai/claude-agent-sdk`; only `claude-adapter` imports the SDK.

### Reuse, don't reimplement gsd-adapter's file-based observation
**Source:** `packages/gsd-adapter/src/index.ts` (`observeGsdState`, lines 25-44), already imported by `apps/worker/src/poll-loop.ts` line 4.
**Apply to:** `claude-code-runtime.ts`'s `requestReview`/`requestHandoff` D-08 source (1) — import and call `observeGsdState` directly; do not write a second `.planning/` parser in `claude-adapter`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/claude-adapter/src/claude-code-runtime.test.ts` (mocked async-generator `query()` fixture) | test | streaming | No existing test in this codebase mocks a streaming async generator — poll-loop.test.ts mocks simple async functions (`listWorktrees`, `observeGsdState`), not a generator; write fresh using vitest's standard async-generator mock pattern (`async function* fakeQuery() { yield ...; }`). |

## Metadata

**Analog search scope:** `packages/git-adapter/`, `packages/gsd-adapter/`, `packages/event-schema/`, `packages/company-core/`, `apps/worker/src/`
**Files scanned:** `git-adapter/src/index.ts`, `git-adapter/package.json`, `git-adapter/src/worktree.test.ts`, `gsd-adapter/src/index.ts`, `gsd-adapter/package.json`, `event-schema/src/payloads/index.ts`, `event-schema/src/envelope.ts`, `apps/worker/src/event-emitter.ts`, `apps/worker/src/poll-loop.ts`, `apps/worker/package.json`
**Pattern extraction date:** 2026-09-20
