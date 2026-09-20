---
phase: 03-worker-git-adapter-gsd-adapter
fixed_at: 2026-09-20T12:53:00Z
review_path: F:/Sidegigs/PixelFirm/.planning/phases/03-worker-git-adapter-gsd-adapter/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-20T12:53:00Z
**Source review:** .planning/phases/03-worker-git-adapter-gsd-adapter/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (2 Critical, 3 Warning — `fix_scope: critical_warning`, IN-01 excluded)
- Fixed: 5
- Skipped: 0

**Verification:** ran in the main checkout (no worktree — `workflow.use_worktrees` is `false` in `.planning/config.json`, so per the documented opt-out this agent edited/committed directly on `main`, no isolation worktree was created). Numbers below are reproducible directly from this tree.

## Fixed Issues

### CR-01: Reconnect logic double-schedules on simultaneous `error`+`close`, corrupting backoff and creating duplicate connections

**Files modified:** `apps/worker/src/ws-client.ts`, `apps/worker/src/ws-client.test.ts`
**Commit:** `4c1f527`
**Applied fix:** `connect()` now only schedules a reconnect from the `"close"` listener; `"error"` is swallowed (comment explains `"close"` always follows `"error"` for `ws` on a connection failure, so only one path should drive `scheduleReconnect`). Added a regression test (`does not double-schedule a reconnect when a connection failure emits both error and close`) that destroys a raw TCP socket mid-handshake to force a real `error`+`close` pair, and asserts the connection-attempt count over a timing window that discriminates the fixed behavior (2 attempts) from the buggy leaked-timer behavior (3 attempts). Verified: `npx vitest run apps/worker/src/ws-client.test.ts` — 12/12 passed.

### CR-02: `phaseId` never derived from `STATE.md`'s already-parsed `current_phase`, permanently dead-lettering GSD-01 category/role observation

**Files modified:** `packages/gsd-adapter/src/index.ts`, `apps/worker/src/index.ts`
**Commit:** `b33d9fd`
**Applied fix:** `observeGsdState`'s second parameter is now `phaseIdOverride`; when it is `undefined`, the function derives `phaseId` from the already-fetched `stateResult.currentPhase` (zero-padded to the `NN` format `scanPhaseDir` expects). Because `observeGsdState` calls `readStateMd` internally on every invocation and `poll-loop.ts` already calls `observeGsdState` once per tick, this re-derives the phase fresh each tick without any change needed to `poll-loop.ts`'s options plumbing — `apps/worker/src/index.ts` still passes `phaseId: undefined`, and its stale comment (implying the entire category/role signal was deferred) was corrected to reflect that gsd-adapter now derives it. Verified: `npx vitest run packages/gsd-adapter apps/worker/src/index.integration.test.ts apps/worker/src/poll-loop.test.ts` — 24/24 passed.

### WR-01: `phaseId` interpolated unescaped into `new RegExp(...)`

**Files modified:** `packages/gsd-adapter/src/phase-files.ts`
**Commit:** `d40e458`
**Applied fix:** Added an `escapeRegExp` helper and applied it to `phaseId` before splicing it into both `planRegex` and `summaryRegex` sources — now safe against regex metacharacters once CR-02 makes `phaseId` come from real `STATE.md` data. Verified: `npx vitest run packages/gsd-adapter` — 19/19 passed.

### WR-02: `git.worktree_observed` events never carry `taskId`, so the reducer's handler is unreachable in production

**Files modified:** `apps/worker/src/poll-loop.ts`, `packages/company-core/src/reducer.ts`
**Commit:** `a8f3eee`
**Applied fix:** No session-to-task correlation mechanism exists yet in this phase (confirmed — `buildEnvelope` has no `taskId` parameter and no caller has one to supply), so per the review's documented fallback option, added explicit comments at both the `poll-loop.ts` emit call site and the `reducer.ts` handler stating this is a deliberately deferred, currently-unreachable path in production, exercised only by `reducer.test.ts`'s hand-built fixtures. Verified: `npx vitest run apps/worker/src/poll-loop.test.ts packages/company-core/src/reducer.test.ts` — 23/23 passed.

### WR-03: `/events` accepts any `CompanyEventSchema` event type from any authenticated worker credential

**Files modified:** `apps/api/src/routes/events.ts`, `apps/api/src/routes/events.test.ts`
**Commit:** `b2da076`
**Applied fix:** Added a `WORKER_ALLOWED_EVENT_TYPES` allow-list (`worker.heartbeat`, `git.worktree_observed`, `gsd.phase_observed`) checked before `CompanyEventSchema.safeParse`, returning 403 for any other type. This conflicted with a pre-existing test (`durably persists a valid synthetic event and dedupes a repeated event.id`) that posted a `company.started` event through the same worker-authenticated route to exercise persistence/dedup — adapted it to use `worker.heartbeat` instead (preserving its actual intent) and added a new regression test asserting a worker credential posting `company.started` is rejected with 403 and never persisted. Verified against a live Postgres instance (`apps/api/docker-compose.test.yml` spun up via `npm run db:test:up`, torn down after): `npx vitest run apps/api` — 29/29 passed (7 files), including the new regression test.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-09-20T12:53:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
