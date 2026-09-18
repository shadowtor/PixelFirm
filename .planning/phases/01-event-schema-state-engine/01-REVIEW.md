---
phase: 01-event-schema-state-engine
reviewed: 2026-09-18T18:20:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - packages/company-core/src/reducer.ts
  - packages/company-core/src/reducer.test.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 01: Code Review Report (re-review — CR-01 gap closure)

**Reviewed:** 2026-09-18T18:20:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** clean

## Summary

Scoped re-review of the 01-03 gap-closure diff (commit range `4ff459b..HEAD` on `packages/company-core/src/reducer.ts` and `reducer.test.ts`), verifying resolution of CR-01 from the prior review (non-null-asserting optional envelope correlation ids in `floor.created`, `project.created`, `task.created`, `agent.online`, `session.started`, causing `"undefined"`-keyed projection corruption).

**CR-01 is resolved.** All 5 previously-unguarded handlers now read the optional envelope field (`floorId`/`projectId`/`taskId`/`sourceAgentId`) into a local `const`, guard with `if (!id) return state;` (or the double-guard `if (!agentId || !existing) return state;` for `session.started`, matching the pre-existing `git.commit_created`/`deployment.started` pattern), and no longer contain any `!` non-null assertions. Confirmed via `grep` that no `Id!` assertions remain in the file. The `agent.online` guard correctly short-circuits the entire handler (both `agents` and `teams` writes) when `sourceAgentId` is missing, rather than partially applying — matching the plan's explicit requirement that the "no-op" not leak a spurious `teams` record.

Verified independently (not just by reading the diff):
- Ran `npx vitest run src/reducer.test.ts` in `packages/company-core` — 12/12 tests pass, including the 5 new `EVENT-03 gap closure` regression tests.
- Ran `npx pnpm turbo run test` at the workspace root — both `event-schema` (25 tests) and `company-core` (12 tests) pass.
- Diffed against `4ff459b` to confirm the change is scoped exactly to the 5 flagged handlers plus additive tests; no other handler logic changed.
- Cross-checked `packages/event-schema/src/envelope.ts` — `floorId`/`projectId`/`taskId`/`sourceAgentId` are indeed `z.string().optional()`, confirming the guarded fields really can be `undefined` on a schema-valid event, i.e. the original CR-01 threat model was accurate and the fix addresses the real gap.

No new bugs, security issues, or quality regressions were introduced by this change. The diff is a faithful, minimal implementation of the 01-03-PLAN.md gap-closure plan (guard-and-no-op pattern copied from the already-correct `git.commit_created`/`deployment.started` handlers).

## Info

### IN-01: Empty-string correlation ids are treated identically to missing ones (pre-existing, not introduced by this diff)

**File:** `packages/company-core/src/reducer.ts:24,36,48,63,78`
**Issue:** The guard `if (!floorId) return state;` (and its siblings) uses JS falsy-check, so a schema-valid event with `floorId: ""` (allowed by `z.string().optional()` in `envelope.ts`, which has no `.min(1)`) silently no-ops exactly like a truly-missing id, rather than being distinguished. This is arguably the *correct* behavior (an empty string is not a usable id either), and is consistent with the pre-existing `git.commit_created`/`deployment.started` pattern this fix intentionally mirrors — it is not a regression from this diff. Flagging only because it's adjacent to the CR-01 fix area and worth a conscious call, not an unconscious gap.
**Fix:** No action required unless the team later wants to distinguish "id omitted" from "id present but empty" (e.g. for telemetry on malformed upstream events). If so, add `.min(1)` to the four optional id fields in `packages/event-schema/src/envelope.ts` so empty strings fail schema validation upstream instead of reaching the reducer at all.

---

_Reviewed: 2026-09-18T18:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
