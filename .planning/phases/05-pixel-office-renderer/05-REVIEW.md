---
phase: 05-pixel-office-renderer
reviewed: 2026-09-21T00:00:00Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - apps/api/src/auth/browser-auth.ts
  - apps/api/src/db/event-row.ts
  - apps/api/src/env.ts
  - apps/api/src/routes/events.ts
  - apps/api/src/routes/ws-browser.ts
  - apps/api/src/server.ts
  - apps/api/src/ws/browser-connections.ts
  - apps/web/src/App.tsx
  - apps/web/src/ws-client.ts
  - packages/claude-adapter/src/claude-code-runtime.integration.test.ts
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/claude-adapter/src/event-emitter.ts
  - packages/company-core/package.json
  - packages/company-core/src/agent-status-derivation.test.ts
  - packages/company-core/src/agent-status-derivation.ts
  - packages/company-core/src/fixtures/stub-events.ts
  - packages/company-core/src/projections.ts
  - packages/company-core/src/reducer.test.ts
  - packages/company-core/src/reducer.ts
  - packages/event-schema/src/agent-status.ts
  - packages/event-schema/src/envelope.test.ts
  - packages/event-schema/src/payloads/index.test.ts
  - packages/event-schema/src/payloads/index.ts
  - packages/orchestration-adapter/src/types.ts
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/handoff/dialogue-templates.test.ts
  - packages/pixel-office/src/handoff/dialogue-templates.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.test.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/sprites/badge-deploying.json
  - packages/pixel-office/src/sprites/badge-discussing.json
  - packages/pixel-office/src/sprites/badge-planning.json
  - packages/pixel-office/src/sprites/badge-researching.json
  - packages/pixel-office/src/sprites/badge-reviewing.json
  - packages/pixel-office/src/sprites/badge-testing.json
  - packages/pixel-office/src/sprites/bubble-blocked.json
  - packages/pixel-office/src/sprites/bubble-completed.json
  - packages/pixel-office/src/sprites/bubble-failed.json
  - packages/pixel-office/src/status/status-mapping.test.ts
  - packages/pixel-office/src/status/status-mapping.ts
  - packages/pixel-office/src/types.ts
  - references/ASSET-LICENSES.md
findings:
  critical: 2
  warning: 3
  info: 0
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 45
**Status:** issues_found

## Summary

Reviewed the browser-facing Broadcast Hub (`apps/api/src/routes/ws-browser.ts`, `browser-auth.ts`, `browser-connections.ts`), the `apps/web` renderer wiring, the `company-core` reducer/agent-status-derivation additions, the `event-schema` payload additions, and the `pixel-office` engine/handoff/status packages. Unit-test coverage for the pure logic (reducer, agent-status-derivation, status-mapping, dialogue-templates, handoff-choreography) is thorough and the individual functions read correctly in isolation.

Tracing the real end-to-end wire path (claude-adapter → apps/api `/events` → company-core reducer → browser WS → pixel-office) surfaced two BLOCKER-level defects that only show up at integration boundaries the unit suites don't exercise: the real `/events` route's worker-credential allow-list was never updated for the event types Phase 4/5's `ClaudeCodeRuntime` actually emits, and a completed handoff never re-points the task's owning agent, so every subsequent status update after a handoff is misattributed. Both are silent failures in production (no crash, no test failure) because `postEvent` only logs on a non-2xx response and the reducer has no way to know an event never arrived.

## Critical Issues

### CR-01: `/events`' worker allow-list rejects every event type ClaudeCodeRuntime actually emits (task.status_changed, ceo.approval_requested, agent.handoff_requested, agent.handoff_completed)

**File:** `apps/api/src/routes/events.ts:14` (enforced at lines 24-27)
**Issue:** `WORKER_ALLOWED_EVENT_TYPES` is `new Set(["worker.heartbeat", "git.worktree_observed", "gsd.phase_observed"])`. There is exactly one credential type in this system (`authenticateWorker`, `apps/api/src/auth/worker-auth.ts`, keyed by `workerId.secret` in the `workers` table) and exactly one event-ingestion route (`POST /events`). `packages/claude-adapter/src/claude-code-runtime.ts`'s `emitStatus`, `requestReview`, `requestHandoff`, and `completeHandoff` all call `postEvent(options.controlPlaneUrl, options.token, ...)`, which POSTs straight to `${controlPlaneUrl}/events` — the same route, authenticated the same way — emitting `task.status_changed`, `ceo.approval_requested`, `agent.handoff_requested`, and `agent.handoff_completed`. None of those four types are in the allow-list, so the real route (`apps/api/src/routes/events.ts:24-27`) returns `403 { error: "event type not permitted for this credential" }` for every one of them against a real deployment. `postEvent` (`packages/claude-adapter/src/event-emitter.ts:55-57`) only does `console.error` on a non-ok response and never surfaces the failure to the caller, so `ClaudeCodeRuntime.startTask`/`pauseTask`/`resumeTask`/`cancelTask`/`requestHandoff` all appear to succeed while every status/handoff event they emit is silently dropped before it ever reaches `company-core`'s reducer or the browser-facing floor. `events.test.ts`'s own regression test (`"rejects an event type not on the worker's allow-list"`) proves this exact rejection path works — it's just never been exercised with the newer types. `claude-code-runtime.integration.test.ts` doesn't catch this either, because it runs against a local stub HTTP server that accepts any type, never the real `apps/api` route.
**Fix:** Extend the allow-list (or split ingestion by credential kind, if a "worker" and an "agent runtime" are meant to be different principals):
```typescript
const WORKER_ALLOWED_EVENT_TYPES = new Set([
  "worker.heartbeat",
  "git.worktree_observed",
  "gsd.phase_observed",
  "task.status_changed",
  "ceo.approval_requested",
  "agent.handoff_requested",
  "agent.handoff_completed",
]);
```

### CR-02: A completed handoff never updates the task's owning agentId — every later status event stays misattributed to the original (fromAgent) agent, and the receiving agent's character freezes at CODING forever

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:66-73` (emitStatus), `96-108` (requestHandoff), `117-123` (completeHandoff), `313-318` (startTask)
**Issue:** `TaskRecord.agentId` is set exactly once, in `startTask` (`tasks.set(input.taskId, { ..., agentId: input.agentId })`), and is read by every subsequent `emitStatus` call as the event's `sourceAgentId` (`const sourceAgentId = tasks.get(taskId)?.agentId;`). The role-change poll's `requestHandoff(taskId, toAgentId)` / `completeHandoff(taskId, toAgentId)` pair (fired when `observeGsdState` detects a role change) posts `agent.handoff_requested`/`agent.handoff_completed` events describing the ownership transfer, but neither function ever writes `toAgentId` back onto `record.agentId`. So:
1. `company-core`'s reducer applies `agent.handoff_completed` and sets the receiving agent's `AgentState.status` to `AgentStatus.CODING` directly (`reducer.ts:266-279`) — a one-time snapshot that never populates `rawTaskStatus`/`currentTaskId` for that agent.
2. Every subsequent `for await` loop iteration in the SAME `runQuery` invocation (e.g. the eventual `"result"` message that sets `status: "completed"` or `"failed"`) still calls `emitStatus(taskId, status)`, which still reads the STALE `agentId` from step 0 — i.e. the original sender, not the agent the task was handed off to.
3. The reducer's `task.status_changed` handler (`reducer.ts:235-260`) therefore updates the ORIGINAL sending agent's status to `COMPLETED`/`FAILED` (an agent who, per the handoff, is no longer working on this task), while the actual receiving agent — set to `CODING` once by step 1 — never receives another `task.status_changed` event for this task and stays visually frozen at "coding" indefinitely, even after the task is done.

This directly undermines HANDOFF-01's stated purpose (accurately visualizing who owns a task) and is not covered by any existing test — `claude-code-runtime.test.ts`'s role-change poll tests only assert that `requestHandoff`/`completeHandoff` fire, never that a subsequent `task.status_changed` event attributes correctly to the new owner.
**Fix:** Reassign task ownership when a handoff completes, before any further `emitStatus` call can fire:
```typescript
async function completeHandoff(taskId: string, toAgentId: string): Promise<void> {
  const record = tasks.get(taskId);
  if (record) record.agentId = toAgentId; // re-point future task.status_changed/emitStatus calls
  await postEvent(
    options.controlPlaneUrl,
    options.token,
    buildEnvelope(options.companyId, "agent.handoff_completed", { taskId, toAgentId }, taskId),
  );
}
```

## Warnings

### WR-01: Browser socket is registered before the connect-time snapshot is built — a live event can reach the client before its snapshot, silently dropping that handoff's animation

**File:** `apps/api/src/routes/ws-browser.ts:22-33`
**Issue:** `registerBrowserSocket(socket)` runs first, then `await db.select().from(events)...` and `fold(...)` build the snapshot, and only then does `socket.send(JSON.stringify({ type: "snapshot", state }))` fire. Because the socket is already registered in `browserSockets` (`apps/api/src/ws/browser-connections.ts`) during that `await` window, any event `POST /events` inserts and broadcasts while the snapshot query/fold is still in flight is sent to this socket immediately — arriving at the client (`apps/web/src/ws-client.ts`) BEFORE the `"snapshot"` message, since WebSocket delivery preserves send order. `apps/web/src/App.tsx`'s `onEvent` handler processes `agent.handoff_requested`/`agent.handoff_completed` unconditionally via `handleHandoffEvent`, which calls `getCharacter(fromAgentId)`/`getCharacter(toAgentId)` (`packages/pixel-office/src/handoff/handoff-choreography.ts:43-48`) — both are `undefined` for a client that hasn't processed its snapshot yet (no characters have been created), so the handoff silently no-ops per its own documented "never fabricate a walk sequence for an unknown character" guard. That handoff's walk/icon/return animation is then permanently lost for this client — it is never replayed once the (now-stale) snapshot does arrive.
**Fix:** Build the snapshot first, then register the socket for live broadcast immediately before/after sending it, so no event can be relayed to a socket before its own baseline state:
```typescript
async (socket) => {
  const rows = await db.select().from(events).orderBy(events.occurredAt);
  const state = fold(rows.map(rowToCompanyEvent));
  registerBrowserSocket(socket);
  socket.send(JSON.stringify({ type: "snapshot", state }));
  ...
```

### WR-02: `event.sourceAgentId!` asserts non-null on a field the schema declares optional — a schema-valid event without it silently creates a bogus "undefined" character

**File:** `apps/web/src/App.tsx:42-48`
**Issue:** `BaseEnvelope.sourceAgentId` is `z.string().optional()` (`packages/event-schema/src/envelope.ts:16`), so `CompanyEventSchema.safeParse` (re-validated client-side in `ws-client.ts:36`) accepts an `"agent.online"`/`"session.started"` event with no `sourceAgentId`. `App.tsx` then does `upsertCharacterFromAgent(event.sourceAgentId!, ...)` — the `!` is purely a compile-time assertion; at runtime this passes `undefined` straight through as `agentId`, and `pixel-office`'s `upsertCharacterFromAgent` (`packages/pixel-office/src/index.ts:83-110`) will happily create/mutate a `characters` map entry keyed by the string `"undefined"` rather than rejecting or logging the malformed event.
**Fix:** Guard the same way `task.created` is already guarded three lines below (`event.taskId &&`):
```typescript
if ((event.type === "agent.online" || event.type === "session.started") && event.sourceAgentId) {
  upsertCharacterFromAgent(
    event.sourceAgentId,
    event.type === "agent.online" ? AgentStatus.IDLE : AgentStatus.CODING,
    event.type === "agent.online" ? event.payload.name : undefined,
  );
}
```

### WR-03: `resumeTask`/`sendMessage` lack the terminal-status guard `pauseTask`/`cancelTask` have — either can silently reactivate a completed/failed/cancelled task

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:347-353` (resumeTask), `372-380` (sendMessage)
**Issue:** `pauseTask`/`cancelTask` both check `TERMINAL_STATUSES.includes(record.status)` before acting (the fix for Phase 4's CR-02). `resumeTask` and `sendMessage` only check `!record.sessionId` — but `sessionId` is captured once on the first `"init"` message and is never cleared, including after the task reaches `completed`/`failed`/`cancelled`/`blocked`. So calling `resumeTask("task-1")` or `sendMessage("task-1", "...")` against an already-terminal task passes this guard, calls `runQuery` again, and silently starts a brand-new `query()` invocation that flips `record.status` away from its terminal value — with no equivalent protection to the one just added for the pause/cancel path.
**Fix:** Reuse the same `TERMINAL_STATUSES` guard:
```typescript
async resumeTask(taskId: string): Promise<void> {
  const record = tasks.get(taskId);
  if (!record || !record.sessionId || TERMINAL_STATUSES.includes(record.status)) {
    throw new Error("ClaudeCodeRuntime.resumeTask: no captured session to resume, or task already terminal");
  }
  await runQuery(taskId, "Continue the task from where you left off", record.sessionId);
},
```
(apply the equivalent check to `sendMessage`).

---

_Reviewed: 2026-09-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
