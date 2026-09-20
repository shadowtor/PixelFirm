---
phase: 03-worker-git-adapter-gsd-adapter
plan: 03
subsystem: infra
tags: [gray-matter, vitest, tdd, gsd, zod]

requires:
  - phase: 03-worker-git-adapter-gsd-adapter
    provides: "CompanyEventSchema's gsd.phase_observed payload and company-core's gsdObservations reducer slot (03-01), which this plan's observeGsdState populates"
provides:
  - "packages/gsd-adapter — a new, standalone workspace package with readStateMd/scanPhaseDir/mapToGsdCategory/observeGsdState, no dependency on apps/worker or packages/git-adapter"
  - "GSD's own 7-token STATE.md status vocabulary, reused verbatim, never reinvented"
  - "A single, explicit unknown/unknown fallback in mapToGsdCategory — the load-bearing implementation of GSD-01's anti-fabrication prohibition"
affects: [03-04-worker-integration]

actuals:
  tokens: 7983
  tasks: 2
  commits: 6

tech-stack:
  added: ["gray-matter@^4.0.3"]
  patterns:
    - "Dispatch-table-by-key pure function (mirroring company-core/reducer.ts) for mapToGsdCategory — input-determined output only, single final fallback branch"
    - "readStateMd/scanPhaseDir return null / all-false-zero for a first-class 'nothing here yet' state instead of throwing — same fail-closed-to-safe-default shape as git-adapter's isGitWorktree/isAnyClaudeProcessAlive"

key-files:
  created:
    - packages/gsd-adapter/package.json
    - packages/gsd-adapter/tsconfig.json
    - packages/gsd-adapter/src/index.ts
    - packages/gsd-adapter/src/state-md.ts
    - packages/gsd-adapter/src/phase-files.ts
    - packages/gsd-adapter/src/role-mapping.ts
    - packages/gsd-adapter/src/state-md.test.ts
    - packages/gsd-adapter/src/role-mapping.test.ts
  modified:
    - pnpm-lock.yaml
    - packages/event-schema/src/payloads/index.ts
    - packages/event-schema/src/payloads/index.test.ts

key-decisions:
  - "STATUS_EXACT_TOKENS copied verbatim (18 keys, 7 distinct values) from gsd-core's own state-document.cjs — never reinvented, verified by a test asserting the exact key/value counts"
  - "mapToGsdCategory's new_project branch covers status 'unknown' (no STATE.md at all) AND status 'planning' with no phase-file signal (SyncSmith's real, verified-this-session shape) — but deliberately NOT 'discussing'/'executing'/etc. with no signal, since a status claiming later-pipeline progress with no phase directory backing it up is a genuinely contradictory combination that must fall to unknown/unknown, not a new_project guess"
  - "Added 'unknown' to event-schema's GsdPhaseObservedPayload.category enum (03-01 gap, Rule 1 fix) — without it, CompanyEventSchema.safeParse would reject exactly the safe fallback event GSD-01's own anti-fabrication mitigation depends on reaching the pipeline"
  - "No dedicated automated test file for observeGsdState (matches the plan's Task 2 file list, same precedent as git-adapter's process-liveness.ts) — verified manually against this repo's real .planning/ state (resolves execution/Engineering for phase 03) and a nonexistent planningDir (resolves new_project/unknown) via a throwaway test file, removed before commit"

patterns-established:
  - "Pattern: RED-phase stub functions throw new Error(\"not implemented\") so every target test fails on a genuine thrown/rejected error, not a silently-passing edge case or import crash — same pattern established in 03-02"
  - "Pattern: a role/category mapping function's output is round-trip-validated against the real, already-shipped Zod schema in its own test suite, catching enum drift between packages before it reaches a downstream consumer"

requirements-completed: [GSD-01]

coverage:
  - id: D1
    description: "readStateMd parses STATE.md frontmatter via gray-matter and normalizes status against GSD's own 18-key/7-value STATUS_EXACT_TOKENS table, never throwing on a missing file, missing current_phase key, or unrecognized status string"
    requirement: "GSD-01"
    verification:
      - kind: unit
        ref: "packages/gsd-adapter/src/state-md.test.ts (7 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "scanPhaseDir scans .planning/phases/NN-* for CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION/REVIEW presence, resolving all-false/zero (never throwing) when the phases directory doesn't exist at all"
    requirement: "GSD-01"
    verification:
      - kind: unit
        ref: "packages/gsd-adapter/src/state-md.test.ts (2 tests, phase-files.ts describe block)"
        status: pass
    human_judgment: false
  - id: D3
    description: "mapToGsdCategory maps every defined (status, phase-file-presence, roadmapPhaseCompleted) combination from 03-RESEARCH.md Pattern 4's table to a category/role pair, with a single explicit final fallback resolving unknown/unknown for any unmatched or ambiguous combination — never a guessed role, and 'approval' never returned this phase"
    requirement: "GSD-01"
    verification:
      - kind: unit
        ref: "packages/gsd-adapter/src/role-mapping.test.ts (12 tests, including the SyncSmith must_haves-truth case and the approval-never-returned assertion)"
        status: pass
    human_judgment: false
  - id: D4
    description: "observeGsdState composes readStateMd -> scanPhaseDir -> mapToGsdCategory into event-schema's GsdPhaseObservedPayload shape minus active; every mapToGsdCategory output (including the unknown/unknown fallback) round-trips through the real CompanyEventSchema.safeParse without rejection"
    requirement: "GSD-01"
    verification:
      - kind: unit
        ref: "packages/gsd-adapter/src/role-mapping.test.ts (\"every mapToGsdCategory output ... validates against the real CompanyEventSchema\")"
        status: pass
      - kind: manual_procedural
        ref: "manual node invocation of observeGsdState against this repo's real .planning/ state (phase 03 -> execution/Engineering) and a nonexistent planningDir (-> new_project/unknown), via a throwaway test removed before commit"
        status: pass
    human_judgment: false

duration: ~13min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 3: GSD Adapter Summary

**`packages/gsd-adapter`: parses `.planning/STATE.md` + phase-directory file presence, normalizes against GSD's own verbatim 7-token status vocabulary, and maps the combination onto GSD-01's category/role table via a pure dispatch function that resolves "unknown" rather than fabricating a role whenever the signals don't clearly support one.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-09-20T02:02:34Z (approx, immediately following 03-02's completion)
- **Completed:** 2026-09-20T02:15:22Z
- **Tasks:** 2
- **Files modified:** 11 (8 created, 3 modified)

## Accomplishments
- `state-md.ts`: `readStateMd` parses `.planning/STATE.md` via `gray-matter`, normalizing `status` against a verbatim-copied `STATUS_EXACT_TOKENS` table (18 keys, 7 distinct values) from gsd-core's own source — never reinventing GSD's vocabulary. Resolves `null` for a missing STATE.md and `currentPhase: undefined` for the missing-key case (SyncSmith's real shape), never throwing.
- `phase-files.ts`: `scanPhaseDir` scans `.planning/phases/NN-*/` for CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION/REVIEW presence, resolving all-false/zero when the phases directory doesn't exist at all.
- `role-mapping.ts`: `mapToGsdCategory` is a pure dispatch-table function (mirroring `company-core/reducer.ts`'s pattern) implementing GSD-01's category/role table, with a single explicit final fallback resolving `unknown`/`unknown` for any unmatched combination — the load-bearing implementation of the kept anti-fabrication prohibition (T-03-07). `"approval"` is never returned this phase (Open Question 3).
- `index.ts`: `observeGsdState` composes the full observation pipeline (`readStateMd` → `scanPhaseDir` → `mapToGsdCategory`) into `event-schema`'s `GsdPhaseObservedPayload` shape minus `active` (computed by Plan 04's poll loop).
- Found and fixed a real schema gap during Task 2: `event-schema`'s `GsdPhaseObservedPayload.category` enum (built in 03-01) had no `"unknown"` member, which would have made `CompanyEventSchema.safeParse` silently reject exactly the safe fallback event this plan's own anti-fabrication mitigation depends on reaching the pipeline.
- Found and fixed a `must_haves.truths` gap: the initial `new_project` branch only fired for `status: "unknown"`, missing PLAN.md's explicit SyncSmith-shaped truth (`status: planning`, no `current_phase` key, no phases directory → `new_project`). Corrected and covered with a dedicated test plus a contrasting `"discussing"` case proving the fix doesn't over-broaden.
- Full TDD RED→GREEN cycle for both tasks (4 core commits, no REFACTOR needed), plus 2 additional Rule-1 bug-fix commits.

## Task Commits

Each task was committed atomically:

1. **Task 1: state-md.ts + phase-files.ts** - `a51ae2e` (test — RED), `d2ffc24` (feat — GREEN)
2. **Task 2: role-mapping.ts + package composition** - `7ec3638` (test — RED), `bc3a24e` (feat — GREEN)

**Deviation fixes (Rule 1):** `e0dacd8` (fix — event-schema category enum gap), `23858d7` (fix — new_project must_haves-truth gap)

**Plan metadata:** (this commit)

_Neither task needed a REFACTOR commit — both GREEN implementations matched the RED-phase stub shapes on the first pass._

## Files Created/Modified
- `packages/gsd-adapter/package.json` - workspace package manifest (gray-matter + event-schema dependencies, vitest test script)
- `packages/gsd-adapter/tsconfig.json` - extends root tsconfig, mirrors company-core's shape
- `packages/gsd-adapter/src/index.ts` - re-exports all functions/types + `observeGsdState` composition
- `packages/gsd-adapter/src/state-md.ts` - `STATUS_EXACT_TOKENS`, `readStateMd`
- `packages/gsd-adapter/src/phase-files.ts` - `scanPhaseDir`
- `packages/gsd-adapter/src/role-mapping.ts` - `mapToGsdCategory`
- `packages/gsd-adapter/src/state-md.test.ts` - 9 tests covering readStateMd + scanPhaseDir
- `packages/gsd-adapter/src/role-mapping.test.ts` - 12 tests covering every behavior-spec row, the must_haves-truth cases, the approval-never-returned assertion, and a CompanyEventSchema round-trip
- `packages/event-schema/src/payloads/index.ts` - added `"unknown"` to `GsdPhaseObservedPayload.category`'s enum
- `packages/event-schema/src/payloads/index.test.ts` - added acceptance coverage for `category: "unknown"`
- `pnpm-lock.yaml` - `gray-matter@^4.0.3` dependency resolved/linked

## Decisions Made
- `STATUS_EXACT_TOKENS` copied verbatim from gsd-core's own source — normalize against it exactly, never paraphrase
- `mapToGsdCategory`'s `new_project` branch is gated on status `"unknown"` OR `"planning"` (both consistent with "no work started yet"), not any other status — a contradictory status/no-signal combination (e.g. `"executing"` with no phase directory) correctly falls to the generic `unknown`/`unknown` fallback instead
- No dedicated automated test file for `observeGsdState` — matches the plan's Task 2 file list and the precedent set by git-adapter's `process-liveness.ts` (03-02); verified manually instead, evidence captured in this SUMMARY's coverage block

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing "unknown" member to GsdPhaseObservedPayload's category enum**
- **Found during:** Task 2 (writing the CompanyEventSchema round-trip test for mapToGsdCategory's output)
- **Issue:** `event-schema`'s `GsdPhaseObservedPayload.category` enum (shipped in 03-01) only listed the 9 GSD-01 pipeline categories, with no `"unknown"` member — but this plan's own kept prohibition (T-03-07) requires `mapToGsdCategory`'s fallback to resolve category `"unknown"`. Without the fix, `CompanyEventSchema.safeParse` would reject that exact fallback event, turning a "never fabricate" guarantee into silent event loss at the API boundary instead.
- **Fix:** Added `"unknown"` as the enum's final member (matching the existing pattern for the `role` enum, which already includes `"unknown"`).
- **Files modified:** `packages/event-schema/src/payloads/index.ts`, `packages/event-schema/src/payloads/index.test.ts`
- **Verification:** Added an acceptance test for `category: "unknown"` in `event-schema`'s own suite; added a cross-package round-trip test in `gsd-adapter` proving every `mapToGsdCategory` output (all 6 sample rows) validates successfully. Confirmed no existing test relied on the enum excluding `"unknown"` (no negative-rejection test existed).
- **Committed in:** `e0dacd8`

**2. [Rule 1 - Bug] Fixed new_project resolution for SyncSmith's real status:planning + no-phase-dir shape**
- **Found during:** Task 2 (re-checking the plan's `must_haves.truths` against the implemented `mapToGsdCategory`)
- **Issue:** The initial `new_project` branch only fired for `status === "unknown"` (no STATE.md at all). PLAN.md's `must_haves.truths` explicitly requires SyncSmith's real, verified-this-session shape (`status: planning`, no `current_phase` key, no `.planning/phases` directory) to also resolve `new_project` — this combination previously fell through to the generic `unknown`/`unknown` fallback instead.
- **Fix:** Broadened the `new_project` condition to `status === "unknown" || status === "planning"` (both gated on no phase-file signal existing at all). Deliberately did not broaden further — `"discussing"`/`"executing"`/etc. with no phase-file signal remains a contradictory combination that correctly falls to `unknown`/`unknown`.
- **Files modified:** `packages/gsd-adapter/src/role-mapping.ts`, `packages/gsd-adapter/src/role-mapping.test.ts`
- **Verification:** Added the SyncSmith-shaped must_haves test plus a contrasting `"discussing" + no signal -> unknown/unknown` test, proving the broadened condition doesn't over-match. Full 19-test suite passes.
- **Committed in:** `23858d7`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs found while proving the implementation against the plan's own must_haves/acceptance criteria before finalizing)
**Impact on plan:** Both fixes are necessary for GSD-01's core anti-fabrication guarantee to actually survive the event pipeline and match the plan's own explicit test requirements. No scope creep — both fixes stayed within this plan's two packages (`gsd-adapter`, `event-schema`'s Phase 3 additions).

## Issues Encountered

- `gsd_run check tdd-red-evidence` was not usable for either RED phase — its TAP parser targets `node --test`'s summary lines, which Vitest doesn't emit (same recurring gap flagged in 03-01/03-02's STATE.md decisions). RED evidence was verified manually both times by reading the actual Vitest failure output and confirming every target test failed on the real `"not implemented"` thrown error, not an import/discovery crash.
- `npx turbo run test` fails on `apps/api`'s DB-dependent tests (no test Postgres container running on this machine, port 5434 — same pre-existing environment precondition documented in 03-02's SUMMARY). `gsd-adapter` has zero dependency on `apps/api` or the database; confirmed out of scope, not introduced by this plan. `git-adapter`, `event-schema`, `company-core`, and `gsd-adapter` all pass fully (8/8, 31/31, 19/19, 19/19).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `packages/gsd-adapter` is feature-complete for this phase and ready for Plan 04's `apps/worker` poll loop to consume (`readStateMd`/`scanPhaseDir`/`mapToGsdCategory`/`observeGsdState` all exported from `index.ts`)
- `observeGsdState`'s output shape matches `event-schema`'s `GsdPhaseObservedPayload` exactly (minus `active`, which Plan 04's poll loop computes by combining this output with `git-adapter`'s `isAnyClaudeProcessAlive` signal) — proven by the cross-package `CompanyEventSchema.safeParse` round-trip test
- No dependency on `apps/worker` or `packages/git-adapter` — matches the plan's objective exactly
- No blockers or concerns carried forward

---
*Phase: 03-worker-git-adapter-gsd-adapter*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 10 created/modified files verified present on disk; all 6 commits (`a51ae2e`, `d2ffc24`, `7ec3638`, `bc3a24e`, `e0dacd8`, `23858d7`) verified present in git log; `pnpm --filter gsd-adapter test` passes 19/19; `npx turbo run test` confirms no regression in `git-adapter` (8/8), `event-schema` (31/31), or `company-core` (19/19).
