---
phase: 05-pixel-office-renderer
plan: 09
subsystem: ui
tags: [react, vitest, projection, event-driven, live-update, tdd]

requires:
  - phase: 05-pixel-office-renderer
    provides: 05-03's deriveAgentStatus + reducer agent handlers; 05-04's handoff choreography FSM; 05-08's live proof that surfaced CR-01
provides:
  - "applyLiveEvent(prev, event) — company-core's own reduce plus an agent-projection diff, the live Character create/update path"
  - "CharacterUpsert { agentId, status, name? } — the live path's upsert shape"
  - "App.tsx holds a live ProjectionState ref seeded from the snapshot, with handleHandoffEvent ordered below the upsert loop"
  - "A user-visible stale-feed banner when the browser socket closes or errors"
  - "apps/web's first wired test that actually renders App (OFFICE-02 attribution enforcement)"
affects: [05-11, 05-12, Phase 6 CEO dashboard live updates, Phase 7 visibility filtering]

actuals:
  tokens: 5600
  tasks: 3
  commits: 5
  plan_head_before: 36dbff5b0e98791f731b0c0194342ae3687e205e

tech-stack:
  added: []
  patterns:
    - "Live path = fold path: the browser holds a ProjectionState and runs the shared reducer, instead of a second hand-written event->status table that can drift"
    - "Reference-inequality diffing as the change signal — sound because every reducer handler returns a fresh object per touched agent"
    - "Vite's ?raw as the zero-dependency filesystem read in a browser package that has no node typings"
    - "renderToStaticMarkup as the wired-render tier for effect-free assertions (no jsdom, no testing-library)"

key-files:
  created:
    - apps/web/src/App.test.tsx
  modified:
    - apps/web/src/agent-event-mapper.ts
    - apps/web/src/agent-event-mapper.test.ts
    - apps/web/src/App.tsx

key-decisions:
  - "The live path runs company-core's reduce() over a browser-held ProjectionState rather than the verifier's suggested stateless task.status_changed branch — deriveAgentStatus needs gsdCategory, which lives in ProjectionState.gsdObservations and never on the event, so a stateless mapper would have drifted on 6 of the 15 AgentStatus values"
  - "deriveCharacterUpsertFromStatusEvent was deleted rather than extended: it mapped only agent.online/session.started, which no producer emits and WORKER_ALLOWED_EVENT_TYPES does not admit"
  - "App.tsx's ordering invariant (upserts before handleHandoffEvent) is pinned by a standing source-order test, proven red by temporarily inverting the order — the onEvent closure is not exported and its effect never runs under static rendering, so source order is the only observable form the invariant has"
  - "node:fs was replaced by vite's ?raw: apps/web has no @types/node and Task 3 forbids adding a dependency"
  - "A dropped socket now paints an on-screen stale-feed banner (Rule 2) — the plan's own must_haves carry that truth and App.tsx had no close/error handler at all"

patterns-established:
  - "A renderer that must stay live holds the projection and replays the shared reducer; it never re-derives state from a private rule table"
  - "When an ordering invariant has no runtime seam, pin it with a source-order assertion and demonstrate the red by deliberately inverting the code"

requirements-completed: [OFFICE-01, OFFICE-02, HANDOFF-01]

coverage:
  - id: D1
    description: "A relayed task.status_changed repaints its own agent with no page reload, producing a real frozen/bubbled Character"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#turns a relayed task.status_changed into exactly one upsert for the owning agent"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#produces a frozen, blocked-bubbled Character when its upsert is applied to pixel-office"
        status: pass
      - kind: other
        ref: "grep -c 'applyLiveEvent' apps/web/src/App.tsx → 2 (the wiring exists)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The live path cannot drift from the snapshot fold path, including the gsdCategory-dependent states a stateless mapper cannot reach"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#cannot drift from company-core's fold path over the same event stream"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#resolves RESEARCHING from a gsd.phase_observed arriving after a running task, which no stateless mapper could"
        status: pass
      - kind: other
        ref: "grep -rn 'deriveCharacterUpsertFromStatusEvent' apps packages → no hits (no second derivation table remains)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The handoff choreography's unknown-character guard is satisfiable on the live path, and the ordering that makes it so is pinned"
    requirement: HANDOFF-01
    verification:
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#creates both handoff participants from live events alone — no snapshot, no reload"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#walks the sender to the receiver's desk when the choreography runs after the upserts"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#leaves the sender standing still when the choreography runs before the upserts — the ordering in App.tsx is load-bearing"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#keeps App.tsx's handleHandoffEvent call below its upsert loop"
        status: pass
    human_judgment: false
  - id: D4
    description: "The in-app attribution credit is present, complete, ungated, and points at an audit document that exists"
    requirement: OFFICE-02
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#renders the complete attribution sentence, so a silent truncation goes red"
        status: pass
      - kind: unit
        ref: "apps/web/src/App.test.tsx#points at an audit document that actually exists and has content"
        status: pass
      - kind: unit
        ref: "apps/web/src/App.test.tsx#shows the credit unconditionally — never behind a disclosure element or hidden"
        status: pass
    human_judgment: false
  - id: D5
    description: "An identity-less or agent-touchless event never fabricates or mutates a Character"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#never creates an undefined-keyed agent from a task.status_changed with no sourceAgentId"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#emits no upserts for an event that touches no agent"
        status: pass
    human_judgment: false
  - id: D6
    description: "A WS socket close/error surfaces a user-observable signal rather than the office silently freezing"
    requirement: OFFICE-01
    verification: []
    human_judgment: true
    rationale: "The plan itself marks this truth `verification: backstop`. The handler and banner exist in App.tsx (close/error → on-screen stale-feed notice), but the banner is state-gated and App's effect never runs under static rendering, so no assertion in this suite observes it. Routed to 05-12's human verification: pull the API down with the office open and confirm the banner appears."

duration: 20 min
completed: 2026-09-21
status: complete
---

# Phase 05 Plan 09: Live Projection Applier Summary

**`apps/web` now folds every relayed event through company-core's own `reduce()` against a browser-held `ProjectionState` and upserts exactly the agents that changed — so agent appearance tracks real state live instead of freezing at the connect-time snapshot, and the handoff choreography's unknown-character guard is satisfiable on the real producer path for the first time.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 (Task 1 tracer/TDD, Task 2 TDD, Task 3 auto)
- **Files created/modified:** 4
- **Tests:** apps/web 9 → 18 (9 added, all passing); pixel-office unchanged at 63

## Accomplishments

- **CR-01 closed.** `applyLiveEvent(prev, event)` runs `reduce` — the exact function `fold()` applies — and emits one `CharacterUpsert` per agent whose projection entry changed. `App.tsx` holds that projection in a ref, seeds it from `onSnapshot` *before* its character loop, and applies every upsert on each relayed event. A `task.status_changed` → `blocked` now produces a frozen, `blocked`-bubbled Character with no reload, proven by a cross-package test rather than by reading the source.
- **Drift made structurally impossible, not merely tested for.** The plan deliberately declined 05-VERIFICATION.md's suggested fix (a stateless `task.status_changed` branch reusing `deriveAgentStatus`) because `deriveAgentStatus` needs `gsdCategory`, which lives in `ProjectionState.gsdObservations`, never on the event — a stateless mapper resolves CODING where the fold path resolves RESEARCHING / PLANNING / TESTING / REVIEWING / DISCUSSING / DEPLOYING. Test 3 folds an event array through `fold()` and separately threads it through successive `applyLiveEvent` calls, asserting deep equality over all of `state.agents`. Test 4 pins the exact case the stateless shape could not reach.
- **The dead mapper is gone.** `deriveCharacterUpsertFromStatusEvent` mapped only `agent.online` and `session.started` — neither emitted by any producer in this repo, neither admitted by `WORKER_ALLOWED_EVENT_TYPES`. Deleting it *is* the CR-01 fix, not a side effect: it was the entire live path, and it was dead in production.
- **HANDOFF-01 unblocked.** `handoff-choreography.ts:48`'s `if (!fromChar || !toChar) return;` could never be satisfied in production, because nothing created the receiver's Character from a live event. Now the reducer's own `agent.handoff_requested` handler (receiver → `WAITING_FOR_AGENT`) creates it via this same event's upsert, provided `handleHandoffEvent` runs *after* the upsert loop. Four tests pin this: both participants exist from live events alone, the sender's walk path ends exactly on the receiver's `seatCol`/`seatRow`, the inverted order leaves the sender with an empty path (the guard firing), and a source-order assertion keeps `App.tsx` honest.
- **OFFICE-02's attribution prohibition has a wired enforcing test for the first time.** `App.test.tsx` renders `App` with `renderToStaticMarkup` — no jsdom, no testing-library, no new dependency — and asserts the complete attribution sentence, that `references/ASSET-LICENSES.md` exists and is non-empty, that the footer is not gated behind `hidden`/`<details>`/`<dialog>`, and that the canvas is sized from `pixel-office`'s own `DEFAULT_COLS`/`DEFAULT_ROWS`/`TILE_SIZE` rather than hardcoded numbers.
- **A dropped socket now says so.** `App.tsx` listens for `close`/`error` and paints a fixed stale-feed banner. Before this, a dead feed was visually identical to an idle company.

## Task Commits

1. **Task 1 (tracer, TDD): live projection applier + App.tsx wiring**
   - RED — `bddce41` `test(05-09)`: 6 new tests fail with `applyLiveEvent is not a function`; the 4 pre-existing ws-client tests stay green
   - GREEN — `2c3ea8e` `feat(05-09)`: `applyLiveEvent`, dead mapper deleted, projection ref + ordering + disconnect banner in `App.tsx`
   - REFACTOR — none needed; no commit
2. **Task 2 (TDD): live handoff path**
   - `bf54537` `test(05-09)`: 4 tests pinning live participant creation, the walk target, the guard firing on inverted order, and the source-order invariant
   - `1f320a6` `fix(05-09)`: `node:fs` → vite `?raw` after `tsc --noEmit` flagged the missing node typings
3. **Task 3 (auto): wired attribution test**
   - `cfebf15` `test(05-09)`: `App.test.tsx`, apps/web's first test that renders the component

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | `bddce41` ✓ | `2c3ea8e` ✓ | — (no change) | Pass |
| 2 | see note | n/a (Task 1's `feat` is the implementation) | — | Pass (test-only task) |
| 3 | n/a (`type="auto"`, not TDD) | — | — | n/a |

**Task 2 has no RED commit by construction.** Its `<files>` list is the test file alone — the behavior it pins was implemented in Task 1's `feat` commit, so its tests were green on arrival (TDD fail-fast rule 1: "the feature may already exist" — here it demonstrably does, and deliberately). Non-vacuity was proven instead of assumed: the source-order test was demonstrated red by temporarily moving `handleHandoffEvent` above the upsert loop in `App.tsx` (`AssertionError: expected 3491 to be less than 3401`), then reverted with `git checkout -- apps/web/src/App.tsx` before committing. The inverted-order behavioral test additionally asserts the receiver is `undefined` before the upserts and defined after, so it cannot pass vacuously on a never-created character.

**RED evidence for Task 1 was verified manually**, not through `gsd_run check tdd-red-evidence`: that verb's TAP parser targets `node --test` summary lines, which Vitest does not emit — the recurring GSD tooling gap on this repo, already recorded in STATE.md from Phases 01, 03 and 05-10. All six target tests failed on `TypeError: applyLiveEvent is not a function` inside the test body (a namespace import is used deliberately, since a named import of a not-yet-existing export is an ESM link failure and would classify as INVALID_RED), the file loaded cleanly, and the 4 unrelated tests stayed green — so it was neither a load crash, a zero-discovery, nor an unrelated failure.

## Files Created/Modified

- `apps/web/src/agent-event-mapper.ts` — `deriveCharacterUpsertFromStatusEvent` deleted; `applyLiveEvent` + `CharacterUpsert` added; imports `reduce` from `company-core` and contains no status logic of its own
- `apps/web/src/App.tsx` — live projection ref seeded in `onSnapshot`, upsert loop in `onEvent`, ordering comment naming the guard it satisfies, socket close/error → stale-feed banner
- `apps/web/src/agent-event-mapper.test.ts` — rewritten: 6 applier tests + 4 live-handoff tests
- `apps/web/src/App.test.tsx` — NEW: 4 tests, the package's first wired render

## Deviations from Plan

### 1. [Rule 2 - Missing critical] Socket close/error had no user-observable signal

- **Found during:** Task 1 (App.tsx rewiring)
- **Issue:** `must_haves.truths` carries "A WS socket close/error surfaces some user-observable signal rather than failing silently" (`verification: backstop`), but no task action implemented it and `App.tsx` had no `close`/`error` listener at all — the truth was false as written.
- **Fix:** Added a `markDisconnected` listener pair and a fixed-position stale-feed banner, removed on cleanup. ~15 lines, no new dependency, no change to the attribution footer.
- **Files modified:** `apps/web/src/App.tsx`
- **Verification:** `npx vitest run --root apps/web` green; `tsc --noEmit` clean; the banner itself is state-gated and routed to 05-12 human verification (coverage D6).
- **Commit:** `2c3ea8e`

### 2. [Rule 3 - Blocking] `node:fs` does not typecheck in apps/web

- **Found during:** Task 2 (after the test commit, on `tsc --noEmit`)
- **Issue:** Task 2's source-order test and Task 3's action both call for reading a file with `node:fs`, but `apps/web` has no `@types/node`, so `tsc --noEmit` failed with TS2307. Adding `@types/node` would have violated Task 3's own acceptance criterion ("`apps/web/package.json` gained no new dependency or devDependency").
- **Fix:** Used Vite's `?raw` import in both places — a build-time filesystem read whose types come from the already-referenced `vite/client`. A missing file fails the module outright, so the "file exists" half of the assertion is stronger than an `existsSync` check; the non-empty half is asserted explicitly. Probed empirically first, including for `references/ASSET-LICENSES.md`, which lives outside the vitest root.
- **Files modified:** `apps/web/src/agent-event-mapper.test.ts`, and `apps/web/src/App.test.tsx` was authored this way
- **Verification:** `tsc --noEmit` clean; both suites green
- **Commit:** `1f320a6` (and `cfebf15`)

### 3. [Criterion interpretation] The plan's test-FILE counts are off by one

- **Found during:** Task 1 verification
- **Issue:** Task 1's `fails_when` requires "fewer than 3 test files" to fail, Task 3's and the plan-level `<verification>` require "at least 4 test files". `apps/web`'s baseline is **2** files (`ws-client.test.ts`, `agent-event-mapper.test.ts`) and this plan adds exactly one (`App.test.tsx`), for **3**. Reaching 4 would mean splitting a describe block into its own file purely to satisfy an arithmetic slip — and Task 2's `<files>` explicitly scopes its tests to `agent-event-mapper.test.ts`.
- **Decision:** Satisfied on intent. The criterion's real content is "the named test files exist and the suite is green": all three files run, 18 tests pass, exit 0, and `App.test.tsx` is present in the reporter's file list. Counts recorded honestly rather than manufactured.
- **Files modified:** none

### 4. [Scope note] Task 2's `<done>` claim narrowed to what is actually pinned

- **Found during:** Task 2
- **Issue:** Task 2's `<done>` promises a test that "goes red if `handleHandoffEvent` is moved back above the upsert loop", but `App.tsx`'s `onEvent` closure is not exported and its effect never runs under static rendering, so no behavioral test can observe that ordering. Task 2's `<files>` forbids restructuring `App.tsx` to expose a seam.
- **Decision:** Added a source-order assertion inside the permitted file and demonstrated it red by inverting the real code, so the `<done>` claim holds literally rather than by narration. Recorded here because a source-text assertion is a deliberate, unusual choice, not an oversight.
- **Files modified:** `apps/web/src/agent-event-mapper.test.ts`

---

**Total deviations:** 1 Rule 2 auto-add, 1 Rule 3 auto-fix, 2 documented interpretation/scope notes.
**Impact on plan:** None on scope. Every task action was performed; every acceptance criterion is met or satisfied on documented intent (item 3).

## Known Stubs

None. No placeholder values, no unwired data sources, no skipped tests.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or trust-boundary schema change — `applyLiveEvent` is reached only from `ws-client.ts`'s existing `CompanyEventSchema.safeParse`-validated `onEvent`.

The plan's own register:

| Threat ID | Disposition | Status |
|---|---|---|
| T-05-09-01 (untrusted relayed data reaching the shared reducer) | mitigate | Closed — no new entry point; `applyLiveEvent` is only ever called with an already-parsed `CompanyEvent` |
| T-05-09-02 (spoofable relayed `sourceAgentId`) | accept | Unchanged — control-plane concern, carried in 05-11 |
| T-05-09-03 (client projection growth) | accept | Unchanged — bounded by the same data the snapshot already delivers |
| T-05-09-04 (`bubbleText` interpolating task titles) | transfer | Unchanged — titles already flowed via snapshot/`task.created`; Phase 7 owns filtering |

## Issues Encountered

- **Vitest still cannot produce `tdd-red-evidence`-parseable output** (Phases 01/03/05-10 precedent). RED verified manually for Task 1.
- **`apps/web` has no node typings**, so filesystem reads in its tests must go through Vite (`?raw`). Worth knowing before a future plan reaches for `node:fs` there.
- **The live-vs-fold equality is only as strong as the reducer's fresh-object discipline.** `applyLiveEvent`'s diff relies on every handler returning a new object per touched agent. That holds today across all 17 handlers; a future handler that mutates an agent in place would silently stop emitting upserts. The anti-drift test would still pass (both paths use the same reducer), so this is a reducer-side invariant, not one this module can defend.

## Next Phase Readiness

- **05-11 and 05-12 unblocked.** Live updating and the handoff choreography are now reachable on the real producer path, which is what 05-12's human verification needs to observe.
- **Routed to 05-12's human verification:** the disconnect banner (coverage D6) — pull `apps/api` down with the office open and confirm the stale-feed notice appears.
- **Carried forward unchanged:** still no producer of `agent.online` anywhere in the codebase (05-08/05-10 note). This plan makes that irrelevant for liveness — `task.status_changed` and the handoff pair, which producers *do* emit, now drive Character creation on their own.

## Self-Check: PASSED

- All five commits present: `bddce41`, `2c3ea8e`, `bf54537`, `1f320a6`, `cfebf15`.
- `apps/web/src/App.test.tsx` exists on disk; all three modified files present.
- Plan `<verification>` re-run: `npx vitest run --root apps/web` exits 0 (3 files / 18 tests — see deviation 3 on the file count); `npx vitest run --root packages/pixel-office` exits 0 with 7 files / 63 tests; `grep -rn "deriveCharacterUpsertFromStatusEvent" apps packages` returns no hits; the frozen/`blocked`-bubbled Character is proven by a cross-package test.
- All task `<acceptance_criteria>` re-run and passing, except the file-count arithmetic recorded in deviation 3.
- `npx tsc --noEmit` in `apps/web` is clean — this plan introduced zero type errors.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*
