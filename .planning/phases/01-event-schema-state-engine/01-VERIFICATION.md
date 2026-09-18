---
phase: 01-event-schema-state-engine
verified: 2026-09-18T16:00:00Z
status: gaps_found
score: 2/3 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/01-event-schema-state-engine/01-01-PLAN.md"
  - ".planning/phases/01-event-schema-state-engine/01-01-SUMMARY.md"
  - ".planning/phases/01-event-schema-state-engine/01-02-PLAN.md"
  - ".planning/phases/01-event-schema-state-engine/01-02-SUMMARY.md"
  - ".planning/phases/01-event-schema-state-engine/01-REVIEW.md"
  - ".planning/phases/01-event-schema-state-engine/01-SECURITY.md"
  - ".planning/phases/01-event-schema-state-engine/01-VALIDATION.md"
  - "packages/company-core/src/fixtures/stub-events.ts"
  - "packages/company-core/src/projections.ts"
  - "packages/company-core/src/reducer.ts"
  - "packages/event-schema/src/envelope.ts"
  - "packages/event-schema/src/payloads/index.ts"
covered_digest: "v1:sha256:0438ce5b45c46b680407140f9f2dee4d413400808731f90e16827bb7aff1ff14"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Feeding a sequence of stubbed events into the state engine produces correct materialized projections (agent/floor/team/project/task state)"
    status: failed
    reason: "reducer.ts uses unguarded non-null assertions (event.floorId!, event.projectId!, event.taskId!, event.sourceAgentId!) in the floor.created, project.created, task.created, agent.online, and session.started handlers. Because BaseEnvelope declares these correlation-id fields .optional() for every event type (by design, per 01-01-PLAN.md's own stated discretion), a schema-valid event of these types that omits its correlation id passes .safeParse() and then corrupts the projection: the computed property key [event.floorId!] coerces undefined to the literal string \"undefined\", silently writing e.g. state.floors[\"undefined\"] = { id: undefined, name: ... } — violating the FloorState/ProjectState/TaskState/AgentState id:string contract with no error, no log, and no way for a caller to detect it. Reproduced live during verification (see Behavioral Spot-Checks). This was already flagged as Critical finding CR-01 in 01-REVIEW.md and explicitly left unremediated (01-VALIDATION.md: 'Not remediated here; see REVIEW.md for the fix')."
    artifacts:
      - path: "packages/company-core/src/reducer.ts"
        issue: "Lines 26, 34, 42, 53, 62, 68 — non-null assertions on optional envelope fields, no guard-and-no-op pattern (the pattern IS correctly applied elsewhere in the same file, in git.commit_created and deployment.started, proving the fix is already known and consistent with the codebase's own conventions)"
    missing:
      - "Apply the same guard-and-no-op pattern used in git.commit_created/deployment.started to floor.created, project.created, task.created, agent.online, and session.started: read the optional id into a local const, and return state unchanged (no-op) if it is missing, instead of asserting non-null and proceeding."
      - "Add a test case (envelope- or reducer-level) proving that an event of one of these types with its correlation id omitted either is rejected at the schema level, or safely no-ops through the reducer without corrupting ProjectionState — this exact case is currently untested (01-REVIEW.md WR-02)."
deferred: []
---

# Phase 1: Event Schema & State Engine Verification Report

**Phase Goal:** A typed event schema and Company State Engine exist and correctly produce/rebuild projections from a stream of events, before any real infrastructure depends on them.
**Verified:** 2026-09-18T16:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths merged from ROADMAP.md Success Criteria (authoritative) and both plans' `must_haves.truths`.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every event type (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer) validates against a single typed schema carrying id/timestamp/company/floor/project/task/source-dest agent/payload/visibility — malformed events are rejected | ✓ VERIFIED | `CompanyEventSchema` is a Zod `discriminatedUnion` over all 12 seeded types (`packages/event-schema/src/payloads/index.ts`); `envelope.test.ts` has 25 passing assertions (valid + malformed per type, run live: `pnpm --filter event-schema test -- envelope.test.ts` → 25/25 pass); `visibility` is a required, non-optional, non-defaultable literal as EVENT-01 demands. Malformed = wrong discriminator literal or missing required payload field is correctly rejected. Note: envelope-level correlation ids (floorId/projectId/taskId/sourceAgentId) are optional for every type by explicit design choice (01-01-PLAN.md), so an event missing one of these is schema-valid, not "malformed" in schema terms — but see Truth 2, where that same design choice becomes a real reducer-level defect. |
| 2 | Feeding a sequence of stubbed events into the state engine produces correct materialized projections (agent/floor/team/project/task state) that are read-only to downstream consumers | ✗ FAILED | Reproduced live during verification: a schema-valid `floor.created` event with no `floorId` reduces to `state.floors["undefined"] = { id: undefined, name: ... }` via `reducer.ts`'s unguarded `event.floorId!` non-null assertion — silent projection corruption, not a thrown error. Same defect class in `project.created`, `task.created`, `agent.online`, `session.started` (6 unguarded assertions total, `reducer.ts:26,34,42,53,62,68`). Already identified as Critical finding CR-01 in `01-REVIEW.md`, confirmed still present in the current codebase, and explicitly left unfixed per `01-VALIDATION.md`. The 12-event fixture the test suite relies on happens to always supply every correlation id, so the shipped test suite is green despite this defect being real and reachable by any schema-valid event that omits an id. |
| 3 | Replaying the same event sequence from the start reproduces identical projections, proving state can be rebuilt without manual patching | ✓ VERIFIED | `reducer.test.ts`'s replay-determinism test folds the 12-event fixture twice from a fresh `emptyState()` and asserts `toEqual` — passes (run live: `pnpm --filter company-core test -- reducer.test.ts` → 7/7 pass, includes this case). `reduce`/`fold` contain no `Date.now()`/`crypto.randomUUID()`/module-mutable state/memoization (grep-verified: no `memoiz`/`new Map(`/`new WeakMap(` in `reducer.ts`). The CR-01 defect (Truth 2) does not undermine this truth specifically — a corrupted projection would still replay to the same corrupted result deterministically — but it does mean "identical" is not the same as "correct" (see Truth 2). |

**Score:** 2/3 truths verified (1 present-and-tested-but-failed on reproduction)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml` | Workspace glob `packages/*` | ✓ VERIFIED | Present, `packages: ["packages/*"]` |
| `turbo.json` | Turbo 2.x `tasks.test` pipeline | ✓ VERIFIED | Present, `pnpm turbo run test` confirmed green live |
| `packages/event-schema/src/envelope.ts` | BaseEnvelope + VisibilitySchema | ✓ VERIFIED | Present, substantive, `visibility` required non-optional |
| `packages/event-schema/src/payloads/index.ts` | CompanyEventSchema, all 12 members | ✓ VERIFIED | Present, 12 discriminated-union members, spread composition (no `.extend()` chains), all `z.object()` (no `looseObject`) |
| `packages/company-core/src/projections.ts` | ProjectionState (agents/floors/teams/projects/tasks) | ✓ VERIFIED (with defect) | Present, all 5 required kinds plus additive `companies` slot. Interface contracts (`FloorState.id: string` etc.) are violated at runtime by the reducer per Truth 2/CR-01 — the type exists but is not actually enforced end-to-end. |
| `packages/company-core/src/reducer.ts` | Dispatch-table reduce()/fold(), full 12-handler coverage | ⚠️ VERIFIED WITH DEFECT | Present, wired, imported by tests and used correctly for the happy path proven by the fixture — but see Truth 2/CR-01: 5 of 12 handlers corrupt state on a schema-valid input the fixture never exercises. |
| `packages/company-core/src/fixtures/stub-events.ts` | Shared 12-event causally-ordered fixture | ✓ VERIFIED | Present, 12 hardcoded events, no `crypto.randomUUID()`/`Date.now()` |
| `packages/company-core/src/reducer.test.ts` | Replay-determinism, projection-coverage, no-op proofs | ✓ VERIFIED | Present, 7 tests, all pass live |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `packages/company-core/src/reducer.ts` | `packages/event-schema/src/index.ts` | `import type { CompanyEvent } from "event-schema"` | ✓ WIRED | Confirmed line 1 of reducer.ts; workspace dependency `"event-schema": "workspace:*"` present in company-core/package.json |
| `packages/company-core/src/reducer.test.ts` | `packages/company-core/src/fixtures/stub-events.ts` | imports `stubEventSequence`, calls `fold(stubEventSequence)` | ✓ WIRED | Confirmed by passing full-fixture projection and replay tests |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `envelope.test.ts` (25 assertions, all 12 types valid+malformed) | `pnpm --filter event-schema test -- envelope.test.ts` | 25/25 pass | ✓ PASS |
| `reducer.test.ts` (empty/single/unknown-type/full-fixture/replay) | `pnpm --filter company-core test -- reducer.test.ts` | 7/7 pass | ✓ PASS |
| Full workspace suite via Turborepo | `pnpm turbo run test` | 2/2 packages pass (FULL TURBO cache hit) | ✓ PASS |
| CR-01 reproduction: schema-valid `floor.created` with `floorId` omitted, fed through `reduce()` | One-off vitest probe added to `packages/company-core/src/`, run via `pnpm --filter company-core test -- _probe.test.ts`, then deleted (not committed) | `state.floors` gained key `"undefined"` with `id: undefined` | ✗ FAIL — confirms CR-01 is live and reproducible, not just a theoretical review note |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any phase-modified file (`packages/**`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| EVENT-01 | 01-01, 01-02 | Typed event schema for all 12 categories, envelope fields, visibility required | ✓ SATISFIED | Schema exists, 12 types, `envelope.test.ts` 25/25 pass live. Correlation-id optionality is a Claude-discretion design choice per 01-CONTEXT.md, not itself a schema-validation failure. |
| EVENT-03 | 01-01, 01-02 | Company State Engine builds materialized projections read by downstream consumers | ✗ BLOCKED | Reducer builds all 5 required projection kinds for the happy-path fixture, but silently produces incorrect/corrupted projection entries for schema-valid inputs the fixture doesn't cover (CR-01). "Correctly builds" is not satisfied for the full input space the schema itself allows. |
| EVENT-04 | 01-01, 01-02 | Projections replayable/rebuildable from the event log without manual patching | ✓ SATISFIED | Replay-determinism proven at both single-event (Plan 01) and full-catalog (Plan 02) scale, live-verified; no memoization shortcut (grep-verified). |

No orphaned requirements — EVENT-01/03/04 are the only IDs REQUIREMENTS.md maps to Phase 1, and all three appear in both plans' `requirements` frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/company-core/src/reducer.ts` | 26, 34, 42, 53, 62, 68 | Unguarded non-null assertion (`event.floorId!` etc.) on a field the schema declares optional | 🛑 Blocker | Silent projection corruption on schema-valid input (CR-01) — directly falsifies Truth 2 / EVENT-03 / the phase's "correctly produce...projections" goal. Already identified in 01-REVIEW.md, confirmed still present, confirmed reproducible during this verification. |
| `packages/event-schema/src/envelope.ts` | 17 | `destinationAgentId` declared but never referenced by any payload/handler/fixture | ℹ️ Info | Dead field, not a blocker — carried forward from 01-REVIEW.md IN-01, not remediated, low impact |
| `tsconfig.json` | 1-9 | No `noUncheckedIndexedAccess` | ℹ️ Info | Would have caught the CR-01 class of bug at compile time; carried forward from 01-REVIEW.md WR-03, not remediated |

### Human Verification Required

None. The gap is deterministically reproducible via an automated test (see Behavioral Spot-Checks) — no human judgment call is needed to confirm it.

### Gaps Summary

Phase 1 delivers a real, working, tested event schema and reducer for the happy path the fixture exercises, and both `EVENT-01` (schema) and `EVENT-04` (replay-determinism) hold up under direct reproduction. However, `EVENT-03` — "Company State Engine builds materialized projections... that the renderer, dashboard, and overlay read" — is not actually satisfied for the full space of schema-valid input: 5 of 12 reducer handlers (`floor.created`, `project.created`, `task.created`, `agent.online`, `session.started`) use unguarded non-null assertions on envelope fields the schema itself declares optional, and a schema-valid event omitting one of those fields silently corrupts the projection (writes a `"undefined"`-keyed record) rather than being rejected or safely no-op'd.

This is not a new finding — it was already caught and documented as Critical (CR-01) in this phase's own `01-REVIEW.md`, and `01-VALIDATION.md` explicitly acknowledges it as "not remediated here." Verification confirms the defect is still present in the current codebase and is live-reproducible, not merely theoretical. Because Phase 2+ builds a durable event log and eventually a renderer/dashboard directly on top of `ProjectionState`, this defect should be fixed now — before "real infrastructure depends on" this engine, per the phase's own stated goal — rather than carried forward into a phase where the blast radius is larger.

The fix is small and already modeled in the same file: `git.commit_created` and `deployment.started` already use the correct guard-and-no-op pattern. Apply the same pattern to the other 5 handlers and add a regression test for the omitted-correlation-id case.

---

_Verified: 2026-09-18T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
