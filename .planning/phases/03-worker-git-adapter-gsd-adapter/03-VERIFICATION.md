---
phase: 03-worker-git-adapter-gsd-adapter
verified: 2026-09-20T13:10:00Z
status: passed
score: 5/5 must-have truths verified (all 5 requirement IDs satisfied); 1 deferred human-check item outstanding
covered_files:

  - .planning/REQUIREMENTS.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-01-PLAN.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-01-SUMMARY.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-02-PLAN.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-02-SUMMARY.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-03-PLAN.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-03-SUMMARY.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-04-PLAN.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-04-SUMMARY.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-REVIEW-FIX.md
  - .planning/phases/03-worker-git-adapter-gsd-adapter/03-REVIEW.md
  - apps/api/src/auth/worker-auth.ts
  - apps/api/src/routes/admin-workers.ts
  - apps/api/src/routes/connection-lifecycle.test.ts
  - apps/api/src/routes/events.test.ts
  - apps/api/src/routes/events.ts
  - apps/api/src/routes/ws.ts
  - apps/api/src/ws/connection-status.test.ts
  - apps/api/src/ws/connection-status.ts
  - apps/worker/package.json
  - apps/worker/src/env.test.ts
  - apps/worker/src/env.ts
  - apps/worker/src/event-emitter.ts
  - apps/worker/src/index.integration.test.ts
  - apps/worker/src/index.ts
  - apps/worker/src/poll-loop.test.ts
  - apps/worker/src/poll-loop.ts
  - apps/worker/src/ws-client.test.ts
  - apps/worker/src/ws-client.ts
  - packages/company-core/src/projections.ts
  - packages/company-core/src/reducer.test.ts
  - packages/company-core/src/reducer.ts
  - packages/event-schema/src/payloads/index.test.ts
  - packages/event-schema/src/payloads/index.ts
  - packages/git-adapter/src/commit.test.ts
  - packages/git-adapter/src/commit.ts
  - packages/git-adapter/src/index.ts
  - packages/git-adapter/src/no-mutating-git.test.ts
  - packages/git-adapter/src/process-liveness.ts
  - packages/git-adapter/src/worktree.test.ts
  - packages/git-adapter/src/worktree.ts
  - packages/gsd-adapter/src/index.ts
  - packages/gsd-adapter/src/phase-files.ts
  - packages/gsd-adapter/src/role-mapping.test.ts
  - packages/gsd-adapter/src/role-mapping.ts
  - packages/gsd-adapter/src/state-md.test.ts
  - packages/gsd-adapter/src/state-md.ts

covered_digest: "v1:sha256:c9785e2989834f9a3e74b1d77c4f3b6468aab21b0f53fa5ea3cc3804edbf158c"
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Point a real worker (apps/worker, `pnpm --filter worker start -- --repo=F:/Sidegigs/syncsmith`) at the real SyncSmith repository using a freshly-issued WORKER_TOKEN (POST /admin/workers with X-Bootstrap-Secret against a running control plane), then trigger a real `.planning/` change in SyncSmith (e.g. begin `/gsd-plan-phase` there far enough to create a phase directory)."
    expected: "The corresponding git.worktree_observed / gsd.phase_observed event(s) land in PixelFirm's events table, and GET /admin/workers shows the worker as \"online\". A transition from \"no .planning/phases dir\" to \"phase 1 directory appears\" is a valid, sufficient demonstration per 03-RESEARCH.md's Open Question 4."
    why_human: "Requires a live, deployed/local control plane, a freshly-issued worker credential, and a real mutation to a separate sibling project's real GSD planning state — genuine human-in-the-loop territory the executor correctly declined to trigger unilaterally on another project (Plan 04's own <precondition>). Deliberately deferred to end-of-phase UAT per workflow.human_verify_mode=end-of-phase (confirmed set in .planning/config.json)."
---

# Phase 3: Worker, Git Adapter & GSD Adapter Verification Report

**Phase Goal:** Prove the worker + git-adapter + gsd-adapter seam end-to-end — a real Node worker process authenticates over the Phase 2 WS gateway, sends heartbeats, and runs a poll-diff loop combining read-only git observation and GSD workflow-state observation into real, schema-valid CompanyEvents landing through the existing POST /events ingestion path.
**Verified:** 2026-09-20T13:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RUNTIME-04: worker online/offline/stale connection status is derived live (heartbeat + WS lifecycle) and visible via `GET /admin/workers` | ✓ VERIFIED | `apps/api/src/ws/connection-status.ts` implements the 10s/30s thresholds; `apps/api/src/routes/connection-lifecycle.test.ts` proves open→heartbeat→"online"→close→"offline" against a real WS client + real POST /events. Ran fresh against a live Postgres container this session: `apps/api` full suite 29/29 passed (2 separate full runs, one flaky migration-race failure on an isolated `admin-workers.test.ts` re-run reproduced as non-reproducible on both a full-suite run and a targeted re-run — not a phase-3 regression, see Anti-Patterns/notes below). |
| 2 | RUNTIME-03: a real worker process connects outbound-only using the Phase 2 `{workerId}.{secret}` Bearer scheme, and refuses to start against an invalid repo path | ✓ VERIFIED | `apps/worker/src/env.ts`'s `loadEnv()` validates env vars via Zod fail-fast and rejects a non-git-worktree path via `git-adapter`'s `isGitWorktree`; `apps/worker/src/ws-client.ts`'s `connectWorker` derives `ws(s)://.../ws` and sets `Authorization: Bearer {token}` unchanged from Phase 2. `apps/worker/src/env.test.ts` (4/4) and `ws-client.test.ts` (12/12) pass fresh this session. |
| 3 | WORKTREE-01/WORKTREE-02: real git worktree/branch/HEAD state is observed read-only, keyed by worktree path, with a structural guarantee no mutating git subcommand exists in the package | ✓ VERIFIED | `packages/git-adapter/src/worktree.ts`'s `listWorktrees` parses real `git worktree list --porcelain` output; `packages/git-adapter/src/no-mutating-git.test.ts` source-scans for banned mutating tokens. Fresh run this session: `git-adapter` 8/8 passed (commit.test.ts, worktree.test.ts, no-mutating-git.test.ts all green). |
| 4 | GSD-01: real GSD workflow state (STATE.md status + phase-directory file presence) is observed and mapped to a category/role, always falling back to "unknown" rather than fabricating a specific role when ambiguous — and the phase's code-review-identified gap (phaseId permanently `undefined` in production) is actually fixed | ✓ VERIFIED | `packages/gsd-adapter/src/index.ts`'s `observeGsdState` now derives `phaseId` from `readStateMd`'s already-parsed `stateResult.currentPhase` whenever no override is supplied (CR-02 fix, read directly from source — confirmed present, not just claimed). `packages/gsd-adapter/src/phase-files.ts`'s `escapeRegExp` helper is applied to the phaseId-derived `RegExp` sources (WR-01 fix, confirmed present). `role-mapping.ts`'s `mapToGsdCategory` has a single final `unknown`/`unknown` fallback. Fresh run this session: `gsd-adapter` 19/19 passed. |
| 5 | The full pipeline (worker → git-adapter + gsd-adapter → POST /events) produces schema-valid, delta-only `CompanyEvent`s (one emission per genuine change, zero on an unchanged repeat tick), never includes raw file contents/diffs/secrets, and `sessionId` is always the real observed worktree path (never a fabricated agent name) | ✓ VERIFIED | `apps/worker/src/poll-loop.ts` diffs by value keyed by `record.path` (Map, never array index); `apps/worker/src/event-emitter.ts`'s `buildEnvelope`/`postEvent` only ever construct structural payload fields (source-inspected — no file-content/diff/env-var field exists in either poll-loop.ts's or event-emitter.ts's payload object literals); `sessionId: record.path` is the only assignment site (source-inspected). Fresh run this session: `apps/worker` 21/21 passed, including `poll-loop.test.ts`'s "emits exactly one ... zero more while nothing changes ... then a delta after HEAD advances" and `index.integration.test.ts`'s full-pipeline schema-valid-emission + clean-stop test. |

**Score:** 5/5 truths verified. All 5 phase requirement IDs (RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01) have direct, re-run-this-session, passing automated evidence.

One item (the live SyncSmith cross-project demo) is a deliberately deferred human-check — see Human Verification Required below. It does not indicate a code gap; every automated truth needed to prove the pipeline works is independently verified above.

### Code Review Fix Verification (03-REVIEW.md → 03-REVIEW-FIX.md)

The phase's own code review found 2 critical + 3 warning issues after the 4 plans landed. All 5 were claimed fixed in 03-REVIEW-FIX.md. Each fix was independently re-read from the current source (not trusted from the fix report) and re-tested fresh this session:

| ID | Issue | Fix claimed | Verified in source | Verified by fresh test run |
|----|-------|-------------|---------------------|------------------------------|
| CR-01 | Reconnect logic double-schedules on simultaneous `error`+`close`, corrupting backoff | Only `"close"` drives `scheduleReconnect`; `"error"` is swallowed | ✓ Confirmed in `apps/worker/src/ws-client.ts:81-84` | ✓ `ws-client.test.ts`'s "does not double-schedule a reconnect when a connection failure emits both error and close" passes (12/12 total) |
| CR-02 | `phaseId` permanently `undefined` in production, dead-lettering GSD-01's category/role signal | `observeGsdState` derives `phaseId` from `readStateMd`'s `currentPhase` when no override supplied | ✓ Confirmed in `packages/gsd-adapter/src/index.ts:37-39` | ✓ `gsd-adapter` 19/19 pass; `apps/worker` `poll-loop.test.ts`/`index.integration.test.ts` (which exercise the real, unmodified `phaseId: undefined` call site in `apps/worker/src/index.ts`) still pass, confirming the derivation actually engages downstream |
| WR-01 | `phaseId` spliced unescaped into `new RegExp(...)` | `escapeRegExp` helper applied before splicing | ✓ Confirmed in `packages/gsd-adapter/src/phase-files.ts:10-12,49-51` | ✓ `gsd-adapter` 19/19 pass |
| WR-02 | `git.worktree_observed` events never carry `taskId`, reducer handler unreachable in production | Explicit deferred-path comments added at both call site and handler (no correlation mechanism exists yet — documented, not code-fixed, per the review's own accepted fallback option) | ✓ Confirmed comments present in `apps/worker/src/poll-loop.ts:81-88` and `packages/company-core/src/reducer.ts:148-152` | ✓ `company-core` 19/19, `apps/worker` 21/21 pass (no behavior change, comment-only fix — correctly scoped) |
| WR-03 | `/events` accepts any `CompanyEventSchema` event type from any authenticated worker credential | `WORKER_ALLOWED_EVENT_TYPES` allow-list checked before `safeParse`, returns 403 | ✓ Confirmed in `apps/api/src/routes/events.ts:8-13,23-26` | ✓ `apps/api/src/routes/events.test.ts`'s "rejects `company.started` from a worker credential with 403, never persisted" present and passing; full `apps/api` suite 29/29 pass against a live Postgres container spun up fresh this session |

All 5 fixes are real, present in the current source (not just claimed in the fix report), and covered by passing regression tests. No regression introduced — the pre-existing `events.test.ts` case that posted `company.started` through the worker-authenticated route was correctly adapted to `worker.heartbeat` (preserving its original persistence/dedup intent) rather than silently deleted.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/event-schema/src/payloads/index.ts` | 15-member discriminated union incl. `worker.heartbeat`/`git.worktree_observed`/`gsd.phase_observed` | ✓ VERIFIED | Present, tested (`index.test.ts` 6/6, `envelope.test.ts` 25/25) |
| `apps/api/src/ws/connection-status.ts` | Live in-memory online/stale/offline derivation | ✓ VERIFIED | Present, exports match plan spec, tested |
| `packages/company-core/src/projections.ts` / `reducer.ts` | `gsdObservations` slot, extended `TaskState`, 2 new handlers | ✓ VERIFIED | Present, tested (19/19) |
| `packages/git-adapter` (5 exports) | `readHead`/`readBranch`/`isGitWorktree`/`listWorktrees`/`isAnyClaudeProcessAlive` | ✓ VERIFIED | Present, all real-execa-backed, tested (8/8) |
| `packages/gsd-adapter` (4 exports) | `readStateMd`/`scanPhaseDir`/`mapToGsdCategory`/`observeGsdState` | ✓ VERIFIED | Present, tested (19/19), STATUS_EXACT_TOKENS copied verbatim from gsd-core |
| `apps/worker` (full package) | Runnable process, `loadEnv`/`ws-client`/`event-emitter`/`poll-loop` | ✓ VERIFIED | Present, tested (21/21), stub-server integration test proves real end-to-end emission |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/worker/src/poll-loop.ts` | `packages/git-adapter`'s `listWorktrees`/`isAnyClaudeProcessAlive` | direct import | ✓ WIRED | `import { isAnyClaudeProcessAlive, listWorktrees } from "git-adapter"` |
| `apps/worker/src/poll-loop.ts` | `packages/gsd-adapter`'s `observeGsdState` | direct import | ✓ WIRED | `import { observeGsdState } from "gsd-adapter"` |
| `apps/worker/src/event-emitter.ts` | `apps/api/src/routes/events.ts` | real `fetch` POST | ✓ WIRED | `index.integration.test.ts` and `connection-lifecycle.test.ts` prove this against real/stub servers |
| `apps/api/src/routes/ws.ts` | `apps/api/src/ws/connection-status.ts` | `markSocketOpen`/`markSocketClosed` | ✓ WIRED | Confirmed via `connection-lifecycle.test.ts` passing |
| `apps/api/src/routes/events.ts` | `apps/api/src/ws/connection-status.ts` | `recordHeartbeat(request.workerId)` | ✓ WIRED | Keyed by authenticated identity, not payload — confirmed by source read and passing T-03-01 mitigation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `git.worktree_observed` payload | `headSha`/`branch`/`worktreePath` | `execa("git", ["worktree", "list", "--porcelain"])` via `listWorktrees` | Yes — real subprocess, verified against real PixelFirm/SyncSmith repos (03-02 SUMMARY) and a temp fixture (re-verified this session via `git-adapter` test suite) | ✓ FLOWING |
| `gsd.phase_observed` payload | `phase`/`status`/`category`/`role` | `readStateMd` (gray-matter parse of real `STATE.md`) → `scanPhaseDir` (real fs presence checks) → `mapToGsdCategory` | Yes — real file I/O, no static/mocked fallback in production path | ✓ FLOWING |
| `GET /admin/workers`'s `status` field | online/stale/offline | `getConnectionStatus(row.id)` reading the live in-memory registry | Yes — derived live, not a stored column | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-01 regression (no double-schedule on error+close) | `pnpm --filter worker test -- ws-client` (fresh, uncached) | 12/12 pass, including the named regression test | ✓ PASS |
| CR-02 fix engages downstream (phaseId no longer stuck undefined) | `pnpm --filter gsd-adapter test` + `pnpm --filter worker test` (fresh, uncached) | 19/19 and 21/21 pass | ✓ PASS |
| WR-03 fix rejects non-worker event types | `apps/api` full suite against live Postgres (spun up this session via `db:test:up` + `drizzle-kit migrate`) | 29/29 pass, incl. named 403-rejection test | ✓ PASS |
| Full-pipeline schema-valid emission + clean stop() | `pnpm --filter worker test -- integration` (fresh) | 1/1 pass | ✓ PASS |
| No mutating git subcommand present (WORKTREE-02 structural guarantee) | `pnpm --filter git-adapter test -- no-mutating-git` (fresh) | 1/1 pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| RUNTIME-03 | 03-04 | Worker runs wherever Claude Code is authenticated, outbound-only, pointable at any repo | ✓ SATISFIED | `env.ts`, `ws-client.ts`, tests passing |
| RUNTIME-04 | 03-01, 03-04 | Worker online/offline/stale status visible in company state | ✓ SATISFIED | `connection-status.ts`, `connection-lifecycle.test.ts` passing against live DB |
| WORKTREE-01 | 03-02, 03-04 | Each active task records repo/branch/worktree/owning session | ✓ SATISFIED | `git-adapter`'s `listWorktrees`, `poll-loop.ts`'s real `sessionId` assignment |
| WORKTREE-02 | 03-02 | System never automatically merges a worktree's branch | ✓ SATISFIED | `no-mutating-git.test.ts` structural guarantee, passing |
| GSD-01 | 03-03, 03-04 | GSD adapter observes real workflow state, prefers observed over guessed | ✓ SATISFIED | `gsd-adapter`'s `mapToGsdCategory` unknown-fallback, CR-02 fix confirmed live |

No orphaned requirements: REQUIREMENTS.md maps exactly RUNTIME-03, RUNTIME-04, WORKTREE-01, WORKTREE-02, GSD-01 to Phase 3, and all 5 appear in the union of the 4 plans' `requirements` frontmatter with no extras or omissions on either side.

### Anti-Patterns Found

None. Grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented` across all 20 non-test source files this phase created/modified returned zero matches.

**Note on test flakiness observed during verification (not a phase gap):** one isolated re-run of `apps/api/src/routes/admin-workers.test.ts` in a Vitest-parallel context hit `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` during its `beforeAll` migration-idempotency step — a race between concurrently-starting test files' migration clients, not a phase-3 code defect. Immediately re-run (both filtered and full-suite) twice more, both green (29/29 each time). This is pre-existing test-infra fragility in the DB-migration bootstrap shared by all `apps/api` integration tests (unrelated to any file this phase touched), not a regression this phase introduced.

## Human Verification Required

### 1. Live SyncSmith cross-project demo

**Test:** Point a real worker at the real SyncSmith repository (`F:/Sidegigs/syncsmith`) via `--repo`, using a freshly-issued `WORKER_TOKEN` (obtained via `POST /admin/workers` against a running control plane), and trigger a real `.planning/` change in SyncSmith (e.g. begin `/gsd-plan-phase` there far enough to create a phase directory).
**Expected:** The corresponding `git.worktree_observed`/`gsd.phase_observed` event(s) land in PixelFirm's events table, and `GET /admin/workers` shows the worker as `"online"`.
**Why human:** Requires a live/local deployed control plane, a freshly-issued credential, and a real mutation to a separate sibling project's live GSD state — deliberately deferred by Plan 04's own `<precondition>` and this project's `workflow.human_verify_mode: end-of-phase` config (confirmed in `.planning/config.json`). This is expected per the phase's own design, not a gap — every other truth needed to prove the pipeline works end-to-end already has passing automated evidence (see Observable Truths above, especially #5's stub-server full-pipeline integration test, which is functionally the same pipeline minus the live cross-project trigger).

## Gaps Summary

None. All 5 must-have truths (mapping to all 5 phase requirement IDs) are verified with fresh, re-run-this-session automated evidence, all 5 code-review fixes are confirmed present in source (not just claimed) and regression-tested, and no anti-patterns were found. The single outstanding item is a deliberately deferred human-in-the-loop demo against a live sibling project, consistent with this project's own end-of-phase UAT workflow configuration — not a code or verification gap.

---

_Verified: 2026-09-20T13:10:00Z_
_Verifier: Claude (gsd-verifier)_
