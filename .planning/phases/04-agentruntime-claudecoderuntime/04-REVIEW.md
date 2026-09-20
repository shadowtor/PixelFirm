---
phase: 04-agentruntime-claudecoderuntime
reviewed: 2026-09-21T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - packages/claude-adapter/package.json
  - packages/claude-adapter/src/claude-code-runtime.integration.test.ts
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/claude-adapter/src/event-emitter.ts
  - packages/claude-adapter/src/index.ts
  - packages/claude-adapter/src/signal-detection.test.ts
  - packages/claude-adapter/src/signal-detection.ts
  - packages/claude-adapter/src/watchdog.test.ts
  - packages/claude-adapter/src/watchdog.ts
  - packages/claude-adapter/tsconfig.json
  - packages/company-core/src/reducer.test.ts
  - packages/company-core/src/reducer.ts
  - packages/event-schema/src/payloads/index.ts
  - packages/orchestration-adapter/package.json
  - packages/orchestration-adapter/src/index.ts
  - packages/orchestration-adapter/src/types.ts
  - packages/orchestration-adapter/tsconfig.json
findings:
  critical: 3
  warning: 2
  info: 2
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the AgentRuntime interface (`orchestration-adapter`, correctly zero-dependency and free of any Claude-Code-specific vocabulary) and its first implementation, `ClaudeCodeRuntime` (`claude-adapter`), plus the accompanying `company-core` reducer and `event-schema` payload additions. The interface package and event-schema/reducer additions are solid — well-tested, deterministic, consistent with existing patterns.

`claude-code-runtime.ts` has three BLOCKER-level defects. Most important given this phase's stated hard security requirement: the `query()` call never overrides the subprocess `env`, so the SDK's documented default behavior — "when omitted, the subprocess inherits `process.env`" — means a stray `ANTHROPIC_API_KEY` in the host process's environment is silently forwarded to and used by the CLI subprocess, defeating the "CLI subscription login only" guarantee this phase claims to enforce. There is no code path anywhere in this package that strips or asserts the absence of that variable. Two further BLOCKERs concern task-state integrity: `pauseTask`/`cancelTask`'s guard only checks that a controller object exists (which it does forever, even after a task terminates), and `runQuery` has no reentrancy guard, so calling `resumeTask`/`sendMessage` while a prior invocation is still in flight silently starts a second concurrent `query()` call and orphans the first one's watchdog/interval/controller.

## Critical Issues

### CR-01: No env isolation — a stray ANTHROPIC_API_KEY in the host process is silently forwarded to and used by the subprocess

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:99-142`
**Issue:** The `query()` call's `options` object never sets `env`. Per the installed SDK's own `sdk.d.ts` (`@anthropic-ai/claude-agent-sdk`, `QueryOptions.env`, lines 1572-1590):

> "When set, this value REPLACES the subprocess environment entirely — it is not merged with `process.env`... When omitted, the subprocess inherits `process.env`."

and `ApiKeySource` (line 131) explicitly lists `'ANTHROPIC_API_KEY'` (env var) as a normal, silently-preferred credential source the CLI resolves on its own. Because this factory never passes `env`, the Claude Code CLI subprocess spawned by `query()` inherits the *entire* environment of whatever process calls `createClaudeCodeRuntime` (the orchestrator/worker). If that process — or anything it was launched from (shell profile, CI secret injection, a `.env` loaded by an unrelated package in the same monorepo) — happens to have `ANTHROPIC_API_KEY` set, the subprocess will use API-key billing/auth instead of the intended CLI subscription OAuth login, with no warning, no log line, and no way for this package to detect or prevent it. This is exactly the "silently accept or forward an API key" failure mode this phase's docstring (lines 38-41) claims is never possible.
**Fix:** Explicitly build the subprocess env, stripping the key (or fail loudly if it is present), rather than relying on the SDK default:
```typescript
const stream = query({
  prompt,
  options: {
    cwd: record.worktreePath,
    permissionMode: "default",
    resume: resumeSessionId,
    abortController: controller,
    // Never let a stray ANTHROPIC_API_KEY in this process's own environment
    // leak into the subprocess and silently override CLI subscription auth.
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ANTHROPIC_API_KEY")),
    ...
```

### CR-02: pauseTask/cancelTask's precondition never clears — either can silently corrupt an already-terminal task's status

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:262-274` (pauseTask), `284-296` (cancelTask)
**Issue:** Both guards are:
```typescript
if (!record || !record.controller) {
  throw new Error(/* ... not running ... */);
}
```
`record.controller` is set once, unconditionally, at the top of `runQuery` (line 97) and is **never reset to `undefined`** after the task reaches a terminal status (`completed`/`failed`/`blocked`/`cancelled`). So after any task finishes normally, `record.controller` and `record.runPromise` still reference the last (already-settled) invocation. A subsequent call to `cancelTask` (e.g. a duplicate/late cancel request racing a fast-completing task, or a UI double-click) passes this guard, calls `attemptGracefulStop(record)` — which immediately resolves `exitedCleanly = true` because `record.runPromise` is already settled — then unconditionally does `record.status = "cancelled"; await emitStatus(taskId, "cancelled")`. A task that legitimately **completed** is silently flipped to `cancelled` and a false `task.status_changed` event is posted to the control plane, corrupting the `company-core` projection (`reducer.ts`'s `task.status_changed` handler will happily upsert `status: "cancelled"` over the real `"completed"` value). The same applies to `pauseTask`.
**Fix:** Gate on the task's actual current status, not merely on the presence of a stale controller:
```typescript
const CANCELLABLE_STATUSES: AgentTaskStatus[] = ["starting", "running", "paused", "waiting_for_review"];
async pauseTask(taskId: string): Promise<void> {
  const record = tasks.get(taskId);
  if (!record || !record.controller || !CANCELLABLE_STATUSES.includes(record.status)) {
    throw new Error("ClaudeCodeRuntime.pauseTask: task is not running");
  }
  ...
```
(apply the equivalent check to `cancelTask`).

### CR-03: No reentrancy guard on runQuery — resumeTask/sendMessage on a mid-stream task silently starts a second concurrent query() and orphans the first

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:92-97, 276-282, 298-306`
**Issue:** `resumeTask` and `sendMessage` only check `record.sessionId` is set (captured on the very first `init` message and never cleared) before calling `runQuery(taskId, ...)` again. `runQuery` itself has no check for "is a previous invocation for this taskId still in flight" — it unconditionally creates a new `AbortController`, overwrites `record.controller` and `record.handle` (line 96-97, 143), and starts a brand-new watchdog + role-poll `setInterval`. `claude-code-runtime.test.ts`'s own "Test 3: sendMessage on a running task..." (lines 204-220) demonstrates exactly this: it calls `sendMessage` while the original `startTask`'s `runQuery` invocation is still blocked mid-stream (the pausable gate is never released), and the test never awaits or tracks that original `startTask` promise at all. In production this means: a second real `@anthropic-ai/claude-agent-sdk` subprocess call is spawned for the same `taskId` while the first is still running against the same worktree; the first invocation's watchdog and role-poll `setInterval` are never cleared (they keep firing against a task whose `record.controller`/`record.handle` have since been overwritten by the second invocation, so `attemptGracefulStop` calls from a later `pauseTask`/`cancelTask` only ever act on the *second* stream); and `pauseTask`/`cancelTask` lose all ability to control or terminate the first, now-orphaned stream.
**Fix:** Guard `runQuery` (or `resumeTask`/`sendMessage`) against re-entry while a task is still active, e.g.:
```typescript
async function runQuery(taskId: string, prompt: string, resumeSessionId?: string): Promise<void> {
  const record = tasks.get(taskId);
  if (!record) throw new Error(`ClaudeCodeRuntime.runQuery: unknown taskId ${taskId}`);
  if (record.runPromise && ACTIVE_STATUSES.includes(record.status)) {
    throw new Error(`ClaudeCodeRuntime.runQuery: task ${taskId} already has an in-flight invocation`);
  }
  ...
```
and have `sendMessage`/`resumeTask` require the task be in a non-active (e.g. `paused`, or turn-complete) status before starting a new turn.

## Warnings

### WR-01: CEO-gated Bash "force-push" pattern false-positives on any `-f` flag

**File:** `packages/claude-adapter/src/signal-detection.ts:21`
**Issue:** `{ name: "force-push", pattern: /\bforce\b.*push|push.*--force|-f\b/i }` — the third alternation, `-f\b`, is not grouped with `push`, so it matches *any* Bash command containing a bare `-f` flag anywhere, regardless of `push`/`force` context. Ordinary, harmless commands the agent runs constantly — `curl -fsSL ...`, `rm -f tmp.txt`, `docker build -f Dockerfile.prod .`, `sort -f`, `grep -f patterns.txt` — all get classified as `ceo_gated_tool` with the misleading reason "Bash command matched a CEO-gated pattern: force-push", denying the tool call and unnecessarily escalating to CEO review far more often than intended. (This is distinct from the module's documented incompleteness disclaimer at the top of the file, which is about missing coverage/false negatives, not this kind of over-broad false-positive.)
**Fix:** Scope the third alternative to the push context, e.g. `/\bforce\b.*\bpush\b|\bpush\b.*(--force|-f\b)/i`, or drop the bare `-f\b` branch entirely and rely on `--force`/`force...push` only.

### WR-02: postEvent's fetch has no timeout — a hung control plane wedges the task's runPromise past its own watchdog/cancel recovery

**File:** `packages/claude-adapter/src/event-emitter.ts:36-49`
**Issue:** `postEvent` catches errors so a *rejected* fetch never crashes the caller, but the `fetch()` call itself has no `AbortSignal`/timeout, so if the control plane accepts the TCP connection but never responds (or the network black-holes it), the promise simply never settles. `emitStatus` is `await`ed inline inside `runQuery`'s for-await loop on every "result" message (`claude-code-runtime.ts:205`) and inside `requestReview`/`requestHandoff`. A hang there means `record.runPromise` never resolves. Crucially, this hang is *not* recoverable by the watchdog or `cancelTask`'s hard-abort: `attemptGracefulStop` aborts the SDK's own `AbortController` (line 153/268/293), which has no relationship to the unrelated, signal-less `fetch()` call inside `postEvent` — so `controller.abort()` does nothing to unstick it, and the task is permanently wedged (its `runPromise` never settles, so any later `pauseTask`/`cancelTask`'s `Promise.race` grace period always loses the race and falls through to "not exited cleanly" forever).
**Fix:** Give the fetch a bounded timeout so a hung control plane degrades to a logged failure instead of a permanent hang:
```typescript
const response = await fetch(`${controlPlaneUrl}/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(event),
  signal: AbortSignal.timeout(10_000),
});
```

## Info

### IN-01: StartTaskInput.repoPath is never read by ClaudeCodeRuntime

**File:** `packages/orchestration-adapter/src/types.ts:19-24`, `packages/claude-adapter/src/claude-code-runtime.ts:247-252`
**Issue:** `StartTaskInput.repoPath` is a required field, but `startTask` only reads `input.taskId`, `input.worktreePath`, and `input.prompt` — `repoPath` is stored nowhere and used nowhere in this implementation. Either it's dead weight on the interface for this implementation, or it was intended to be threaded through (e.g. for logging/evidence) and was dropped.
**Fix:** If no current implementation needs it, drop it from `StartTaskInput` until a real consumer exists; if it's meant to be used, wire it through (e.g. attach to the task record for diagnostics).

### IN-02: git-adapter is listed as a runtime dependency but is only ever imported by a test file

**File:** `packages/claude-adapter/package.json:12-23`
**Issue:** `git-adapter` is listed under `"dependencies"`, but the only import of it anywhere in `packages/claude-adapter/src` is `claude-code-runtime.integration.test.ts:8`. `execa` and `ws`, used by the same test file, are correctly placed under `"devDependencies"`. `git-adapter` should be there too.
**Fix:** Move `git-adapter` from `dependencies` to `devDependencies`.

---

_Reviewed: 2026-09-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
