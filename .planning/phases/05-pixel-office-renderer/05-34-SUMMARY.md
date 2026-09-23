---
phase: 05-pixel-office-renderer
plan: 34
subsystem: ui
tags: [canvas, pixel-art, layout, handoff, vitest, playwright, choreography]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer
    provides: "05-27's interactionTileFor, blockedTilesFor and the occupancy-aware handoff walk"
  - phase: 05-pixel-office-renderer
    provides: "05-24's furnished floor (office-layout.json, FURNITURE, FURNITURE_BLOCKED_TILES) and 05-25's SEATS / STANDING_SPOTS"
  - phase: 05-pixel-office-renderer
    provides: "05-32's seated-whenever-resting rule, which made the standing sender beside a seated receiver the tallest thing on its row"
  - phase: 05-pixel-office-renderer
    provides: "05-33's position-agnostic bubble scorer, which let senders move without a single bubble-test edit"
provides:
  - "office-layout.json `interaction` block: the aisle row and the fixed column offsets a handoff sender waits on"
  - "interactionSlotsFor(home): the receiver home's fixed slots in preference order, filtered to clear floor that is not furniture and not a home; throws at load on malformed / off-map / floorless interaction data"
  - "interactionTileFor takes the first free, reachable fixed slot, with occupancy measured at Chebyshev distance 1 (diagonals included), so a second concurrent sender takes the next slot"
  - "Dominant-axis facing on arrival: UP across the desk to a row-4 receiver, DOWN to a row-8 one"
  - "Two sweeps over all 20 receiver homes in a full office: no character touches the waiting sender, and its visible ink stays >= 3 px clear on some axis (measured tightest: 4 px over 86 neighbour pairs)"
  - "A live harness mirror of the slot rule plus a derived-deadline icon poll replacing 05-08's fixed sleep"
affects: [ceo-dashboard, stream-overlay, obs-capture]

actuals:
  tokens: 15054
  tasks: 3
  commits: 4
plan_head_before: ba317451c17e2ef0d9957baff1bebe115534a6d2

tech-stack:
  added: []
  patterns:
    - "Interaction geometry lives in layout data, not in a search: the choreography consumes an ordered slot list instead of scanning a row, so the office layout owns where agents meet"
    - "Chebyshev-1 occupancy (diagonals included) for standing positions, where 4-adjacency would still allow a shoulder-to-shoulder read"
    - "Tests derive expected tiles from the layout function itself (slotsFor / slotsOfHome), so a layout edit moves the assertions with it; only the three tracer pins are literals"
    - "Visible-ink measurement by composite differencing: solo cells that survive the full render, minus what the furniture pass already owned, so desk overdraw counts as hidden"
    - "Non-vacuity counters in a spacing sweep: a sweep that found no neighbour would prove nothing, so the pair count is asserted too"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/layout/office-layout.json
    - packages/pixel-office/src/layout/officeLayout.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - packages/pixel-office/src/index.ts
    - apps/web/src/agent-event-mapper.test.ts
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "Aisle row 6 chosen because it is the only interior row two tiles from EVERY seat and standing spot — the clearance is a property of the row, not of the offsets, so no offset edit can reintroduce the defect"
  - "Occupancy is Chebyshev 1, not 4-adjacency: two standing sprites a diagonal apart still read as one group"
  - "Offsets +1, -1, +3, -3 are two columns apart, so the second and third concurrent senders are never adjacent to the first even before the occupancy rule fires"
  - "atInteractionSlot (renamed from besideReceiver) derives from interactionSlotsFor rather than restating the row and offsets, so the 15 rebased 05-27 assertions cannot drift from the layout"
  - "Walk durations in the robustness suite collapsed to one WALK_SECONDS constant instead of per-layout step counts (05-27 pinned 9 steps); the one remaining path-length assertion measures the walk it is about to interrupt"
  - "interactionSlotsFor re-exported from the pixel-office package index so apps/web's mapper test can assert against the layout's own rule instead of restating it"
  - "The live harness resolves the slot and its walk budget BEFORE posting the handoff, so the icon poll has a derived deadline; 05-08's fixed sleep(2500) was sized for a one-desk-gap walk and no longer covers the aisle walk"

patterns-established:
  - "Layout-data guard test: assert the PROPERTY every slot must have (floor, not furniture, not a home, Chebyshev >= 2 from every home) so a layout edit that breaks it goes red without any scene being run"
  - "RED-by-temporary-revert for a sweep that guards a property rather than a function: point the implementation back at the superseded rule, record the failing output, restore"

requirements-completed: [HANDOFF-01]

coverage:
  - id: D1
    description: "A handoff sender waits on a fixed interaction slot defined in layout data — the central aisle row 6 at column offsets +1, -1, +3, -3 from the receiver's home, taken in that order"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#the sender stops on the receiver's first fixed slot, never on the receiver"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#the interaction tile is always a fixed slot of the receiver's home"
        status: pass
    human_judgment: false
  - id: D2
    description: "A slot is used only when it is floor, not furniture, not a home, reachable, and no other character's seat or resting tile and no live handoff target lies within one tile of it, so a second concurrent sender takes the next fixed slot"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#the second concurrent sender gets the next fixed slot"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#three senders take the fixed preference order"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every slot the layout can produce is at least two tiles (Chebyshev) from every seat and standing spot; a layout-data test goes red on a layout edit that breaks it"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#every home has a slot, and every slot the layout can produce is clear floor two tiles from every home"
        status: pass
    human_judgment: false
  - id: D4
    description: "In a full 20-agent office, for every home as receiver, the waiting sender's visible ink is separated from every other character's by at least 3 px on some axis, desk overdraw included (measured tightest 4 px over 86 pairs; the seat-row layout measured 2)"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#clear ink separation: the sender's visible ink stays clear of every character within 2 tiles"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#never shoulder-to-shoulder: no other character's seat or resting tile touches the waiting sender"
        status: pass
    human_judgment: false
  - id: D5
    description: "On arrival the sender faces the receiver along the dominant axis — up toward a row-4 receiver across its desk, down toward a row-8 receiver"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#the sender faces the receiver on arrival, on the dominant axis"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#a row-8 receiver is faced DOWN from the aisle, a row-4 receiver UP"
        status: pass
    human_judgment: false
  - id: D6
    description: "05-33's bubble properties (inside the floor, over no glyph, tail on the speaker, 40-scene sweep) pass unchanged with senders on the new slots"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts (05-33 G-05-P1 sweeps) — pnpm --filter pixel-office test 177/177"
        status: pass
    human_judgment: false
  - id: D7
    description: "Live: TRUTH 5 finds the sender on the receiver's first fixed slot, fully visible, and its bubble passes 05-33's checks"
    verification:
      - kind: e2e
        ref: "node scripts/verify-pixel-office-live.mjs — LIVE PROOF: PASS; TRUTH 5 (sender visible) sender (6,6) 4544 agent px (need >= 2944), receiver (5,4) 7248 agent px"
        status: pass
      - kind: automated_ui
        ref: "playwright:handoff.png (PIXEL_OFFICE_SHOTS run, read back and inspected)"
        status: pass
    human_judgment: false

# Metrics
duration: 26 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 34: Fixed Aisle Interaction Slots Summary

**Handoff senders now wait on layout-defined aisle slots (row 6, offsets +1/-1/+3/-3 from the receiver's home) instead of the first free tile on the receiver's seat row, so a sender, its receiver and a seated neighbour never read as one stacked group — measured ink separation went from 2 px to 4 px.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-23T09:58:00Z
- **Completed:** 2026-09-23T10:24:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `office-layout.json` gained an `interaction` block — the aisle row and the fixed column offsets are now layout data, not a search hidden inside the choreography.
- `interactionSlotsFor(home)` filters those offsets to clear floor that is neither furniture nor another agent's home, preserving preference order, and throws at load if the interaction row is malformed, off-map or floorless (T-05-34-01).
- `interactionTileFor` walks that list instead of scanning the receiver's seat row, and measures occupancy at Chebyshev distance 1 (diagonals included), so a second concurrent sender takes the next slot rather than crowding the first.
- Because row 6 is the only interior row two tiles from every seat and standing spot, and no slot is a home, the defect is closed **by construction** and review WR-05 (a sender waiting on a vacant home) is now unreachable.
- Arrival facing is now dominant-axis: UP across the desk to a row-4 receiver, DOWN to a row-8 one.
- Two sweeps over all 20 receiver homes in a full 20-agent office prove it: nothing within Chebyshev 1 of the sender, and >= 3 px of visible-ink separation on some axis (tightest measured 4 px across 86 neighbour pairs, desk overdraw included).
- The live harness mirrors the slot rule and replaces 05-08's fixed `sleep(2500)` with a poll against a deadline derived from the actual walk; `LIVE PROOF: PASS` with the sender at (6,6).

## Task Commits

1. **Task 1 (tracer, TDD) — RED: failing tests for fixed aisle interaction slots** — `40dfe4d` (test)
2. **Task 1 — GREEN: senders wait on fixed aisle slots from layout data** — `49c8e47` (feat)
3. **Task 2: spacing and ink-separation sweeps over every receiver position** — `c769232` (test)
4. **Task 3: live mirror of the slot rule, icon poll, UI-SPEC note** — `01e361c` (feat)

No REFACTOR commit — the GREEN implementation was already the minimal shape (one ordered list walk replacing a two-directional search loop), so there was nothing to clean up without inventing indirection.

## TDD Gate Compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `40dfe4d` | 32 failed / 143 passed of 175 discovered. Target failures are assertions on the planned behaviour — `officeLayout must export interactionSlotsFor (05-34): expected 'undefined' to be 'function'`, and senders landing on the seat-row tiles `(2,4)` / `(8,4)` instead of an aisle slot. No link error, no syntax error, no zero-discovery: the other 7 test files stayed green throughout. |
| GREEN | `49c8e47` | `pnpm --filter pixel-office test` 175/175; `pnpm turbo test` 10/10 tasks. |
| REFACTOR | — | Not needed (see above). |

**`gsd check tdd-red-evidence` was not used** — as the orchestrator flagged and 05-01/03-02 recorded before, its parser targets `node --test` TAP summary lines that Vitest never emits, so it cannot certify RED on this repo. RED was verified manually against the criteria above (named target tests failing on behaviour assertions; unrelated tests green) and is recorded here rather than treated as an `INVALID_RED` failure.

**Task 2 RED evidence** (a property sweep, not a new function, so proven by the repo's 03-02 temporary-revert precedent): with `interactionTileFor` pointed back at a seat-row search (`d = 1, 2, ...` on the receiver's seat row, exact-tile occupancy only), both sweeps failed on receiver 0:

```
never shoulder-to-shoulder: agent-0 at (1,4) is 1 tile(s) from the sender at (2,4):
  expected 1 to be greater than 1
clear ink separation: sender (2,4) ink {"minX":33,"minY":44,"maxX":45,"maxY":65}
  vs agent-0 (1,4) ink {"minX":17,"minY":49,"maxX":30,"maxY":65}
  — 2 px across, 0 px apart: expected 2 to be greater than or equal to 3
```

That 2 px is exactly the figure the UAT shot measured. The revert was restored (verified by an empty `git diff` on the file) before the Task 2 commit, and the sweeps pass on the shipped slots.

## Files Created/Modified

- `packages/pixel-office/src/layout/office-layout.json` — added `"interaction": { "row": 6, "colOffsets": [1, -1, 3, -3] }`
- `packages/pixel-office/src/layout/officeLayout.ts` — validated `INTERACTION` block (throws at load) and the exported `interactionSlotsFor(home)`
- `packages/pixel-office/src/handoff/handoff-choreography.ts` — `interactionTileFor` rewritten onto the fixed slots with Chebyshev-1 occupancy; `checkHandoffArrivals` faces the receiver on the dominant axis; doc comments rewritten to cite 05-34 and name the ponytail ceiling
- `packages/pixel-office/src/handoff/handoff-choreography.test.ts` — layout guard, tracer, row-8 facing, the two spacing sweeps, and the 15 rebased 05-27 assertions
- `packages/pixel-office/src/index.ts` — re-exports `interactionSlotsFor` for consumers
- `apps/web/src/agent-event-mapper.test.ts` — rebased off the seat-row rule (see deviation 1)
- `scripts/verify-pixel-office-live.mjs` — slot-rule mirror, slot/walk budget resolved before the post, derived-deadline icon poll, TRUTH 5 comments
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — Spacing / Office layout note for 05-34

## Decisions Made

- **Aisle row 6, not a per-seat diagonal tile.** Row 6 is the only interior row two tiles from every seat and standing spot, so the clearance is a property of the ROW. Any future offset edit still cannot put a sender shoulder-to-shoulder with a seated agent, and the layout-guard test proves that from data alone without running a single scene.
- **Chebyshev 1, not 4-adjacency, for occupancy.** Two standing sprites a diagonal apart still read as one group at native scale; 4-adjacency would have let that through.
- **Tests derive tiles from `interactionSlotsFor`.** The only literals left are the three tracer pins the plan asked for — (10,6), (8,6), (12,6) — so a layout edit moves 15 rebased assertions with it instead of silently invalidating them.
- **`WALK_SECONDS` replaced per-layout step counts.** 05-27 pinned "9 steps" in two places; the aisle walk is longer and layout-dependent, so the suite now uses one generous constant and the single surviving path-length assertion measures the walk it is about to interrupt.
- **The live harness resolves the slot before posting the handoff.** That is what makes a derived poll deadline possible; the fixed `sleep(2500)` was sized for a one-desk-gap walk and would have been a coin flip on the aisle walk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `apps/web`'s mapper test still asserted the superseded seat-row rule**

- **Found during:** Task 1 (GREEN), caught by `pnpm turbo test` after `pnpm --filter pixel-office test` was already green
- **Issue:** `apps/web/src/agent-event-mapper.test.ts`'s "walks the sender to the receiver's desk" pinned `end.row === receiver.seatRow` and `|end.col - receiver.seatCol| === 1`. The plan and 05-33's executor both stated that no test outside `handoff-choreography.test.ts` needed editing; that survey missed this file, and the change necessarily breaks it (`expected 6 to be 4`). Left alone it is a red workspace suite, so it is blocking rather than out of scope.
- **Fix:** Rebased the assertion onto `interactionSlotsFor(receiver home)` — the same layout rule the package's own tests use — plus `end.row !== receiver.seatRow`. To make that possible without a deep import, `interactionSlotsFor` is re-exported from `packages/pixel-office/src/index.ts` (4 lines, the package's existing pattern for `handleHandoffEvent`).
- **Files modified:** `apps/web/src/agent-event-mapper.test.ts`, `packages/pixel-office/src/index.ts`
- **Verification:** `pnpm turbo test --force` 10/10 tasks, `apps/web` 23/23
- **Committed in:** `49c8e47` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] `interactionSlotsFor` did not typecheck against the module-level validation**

- **Found during:** Task 1 (GREEN)
- **Issue:** TS2835-aside, `tsc --noEmit` reported two real errors — `TS18048: 'interaction' is possibly 'undefined'` inside `interactionSlotsFor`, because narrowing from a module-level `throw` does not propagate into a function body.
- **Fix:** Moved the validation into an IIFE returning a non-optional `INTERACTION: InteractionData`. Same throws, same messages, narrowed type.
- **Files modified:** `packages/pixel-office/src/layout/officeLayout.ts`
- **Verification:** `tsc --noEmit` reports no new errors in the files this plan touched
- **Committed in:** `49c8e47`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both were consequences of the intended change rather than new scope. Deviation 1 added one 4-line re-export to the package's public surface; nothing else grew.

## Issues Encountered

- **One transient `worker#test` failure under `pnpm turbo test --force`**, run immediately after the Docker-based live proof. `pnpm --filter worker test` passed 21/21 in isolation right afterwards, and a clean `pnpm turbo test --force` passed 10/10. This plan touches no worker code; it is the machine-load-sensitive poll-loop wall-clock behaviour the orchestrator already worked on in `ba31745`, still timing-sensitive when the box is busy. Non-blocking, recorded so a future run that sees it does not chase it as a regression.
- **`pnpm --filter pixel-office exec tsc --noEmit` cannot be clean on this repo** — every test file imports without `.js` extensions and `packages/event-schema` re-exports the same way, so TS2835 fires repo-wide. The package has no `typecheck` script for that reason. Verified instead that the files this plan touched introduce no NEW errors; the two that appeared were fixed (deviation 2). This is the pre-existing gap already tracked in STATE.md's blockers and `deferred-items.md`.
- **`gsd check tdd-red-evidence` is unusable on this Vitest repo** (recurring since 05-01/03-02) — see the TDD Gate Compliance section.

## Threat Flags

None — no new network surface, auth path, file access pattern or schema change. Both registered threats were mitigated as planned: T-05-34-01 by the load-time validation of the `interaction` block plus the layout-guard test; T-05-34-02 by keeping the receiver's TYPE transition on the real completion event (unchanged) and by no slot ever being a home.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-05-P2 is closed: the layout, the choreography, the test sweeps, the live mirror and the UI-SPEC all agree on the same slot rule, and the live screenshot shows the sender alone in the aisle in front of the receiver's desk with clear floor on every side.
- 05-REVIEW's WR-05 (a sender waiting on a vacant home) is now unreachable by construction rather than by a runtime check.
- Remaining phase-05 concern unchanged: the live proof still requires Docker and a human-initiated run; nothing in this plan changed that.

## Self-Check: PASSED

All 8 modified files present on disk; all 4 task commits (`40dfe4d`, `49c8e47`, `c769232`, `01e361c`) present in `git log`. Plan-level verification re-run at close-out: `pnpm --filter pixel-office test` 177/177, `pnpm turbo test --force` 10/10 tasks, `node scripts/verify-pixel-office-live.mjs` → `LIVE PROOF: PASS`.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*
