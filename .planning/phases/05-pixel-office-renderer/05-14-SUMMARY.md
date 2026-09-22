---
phase: 05-pixel-office-renderer
plan: 14
subsystem: pixel-office
tags: [layout, identity-hue, desk-allocation, gap-closure, vitest]
status: complete

requires:
  - phase: 05-10
    provides: "desk rows 3/6/9, FNV-1a identity hue buckets"
  - phase: 05-12
    provides: "live proof that mirrors the desk formula (scripts/verify-pixel-office-live.mjs)"
provides:
  - "nextDeskPosition derives the lowest free desk from seated characters; no counter"
  - "deskForSlot(slot) — the unchanged 05-10 row/col formula (module-private)"
  - "identityHueFor(agentId) — hashed bucket preferred, probes to first bucket no seated character holds"
  - "Corrected ceiling record and HANDOFF-01 trigger-ownership pointer in deferred-items.md"
affects: [05-16, verify-phase-05, phase-06-planning]

actuals:
  tokens: 4400
  tasks: 3
  commits: 5
plan_head_before: 25c990667e6c16ab790cf9e90b2277f2d59c241d

tech-stack:
  added: []
  patterns:
    - "Allocation derived from current state (occupied seats / held hues) instead of a monotonic counter"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/index.test.ts
    - packages/pixel-office/src/types.ts
    - .planning/phases/05-pixel-office-renderer/deferred-items.md
    - .planning/STATE.md

key-decisions:
  - "Desks come from occupancy: lowest slot whose tile no seated character holds; on an empty floor agent k still gets slot k, so 05-16's deskPosition mirror stays valid."
  - "Identity hue probes forward from the FNV-1a bucket to the first free one; collisions start at the thirteenth concurrently seated agent."
  - "HANDOFF-01's production trigger recorded as unowned by any ROADMAP phase; placement is a roadmap decision before Phase 6 planning."

requirements-completed: [OFFICE-01, HANDOFF-01]

coverage:
  - deliverable: "Despawned desks reclaimed, lowest free first"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/index.test.ts#reclaims a despawned agent's desk across heavy offline/online churn (WR-03)"
        status: pass
      - kind: test
        ref: "packages/pixel-office/src/index.test.ts#never seats two concurrently seated characters on one tile after churn (<= 54 seated)"
        status: pass
      - kind: test
        ref: "packages/pixel-office/src/index.test.ts#gives the next new character the lowest-numbered free desk"
        status: pass
  - deliverable: "Distinct identity hues up to twelve concurrently seated agents"
    human_judgment: false
    verification:
      - kind: test
        ref: "packages/pixel-office/src/index.test.ts#gives the ten measured ids ten distinct hues and pairwise-different pixel data"
        status: pass
      - kind: test
        ref: "packages/pixel-office/src/index.test.ts#holds twelve distinct hues for twelve seated agents, and exactly twelve for thirteen (the ceiling)"
        status: pass
      - kind: test
        ref: "packages/pixel-office/src/index.test.ts#never lets AgentStatus feed the identity hue"
        status: pass
      - kind: command
        ref: "pnpm --filter web test"
        status: pass
  - deliverable: "Deferral record corrected (ceilings, dated note, unowned trigger, latent handoff edge)"
    human_judgment: false
    verification:
      - kind: command
        ref: "grep -c 'Corrected by 05-14' / 'no ROADMAP phase currently owns' / 'Both are Phase 6 scope' (0) deferred-items.md"
        status: pass
  - deliverable: "Whether a 13-agent hue collision onset is acceptable for the milestone"
    human_judgment: true
    rationale: "Human-verification item 4 (planner assumption B4) — not closed by this plan."

duration: 4 min
completed: 2026-09-22
---

# Phase 5 Plan 14: Desk Reclaim and Collision-Avoiding Identity Hue Summary

**Desks and identity hues are now derived from who is seated: a despawned agent's desk goes back to the pool (lowest free first) and a new agent takes its hashed hue or the next free one, so collisions start at the thirteenth concurrently seated agent instead of the second.**

## Performance

- Duration: about 4 min
- Tasks: 3 (5 commits)
- Tests: pixel-office 80 -> 87, all passing; web 18/18

## Accomplishments

- `nextDeskPosition()` scans seated characters' `seatCol,seatRow` and returns the first free `deskForSlot(slot)` for slot 0..53. It falls back to `deskForSlot(characters.size)` (the old overflow stacking) only when all 54 are held. The monotonic counter and its reset line are gone. `DESK_ROW_START` / `DESK_ROW_PITCH` are untouched single-line literals.
- `identityHueFor(agentId)` replaces `hueForAgentId`. The FNV-1a fold is unchanged; it probes forward (wrapping) past hues held by seated characters and returns the preferred bucket if all twelve are held.
- deferred-items.md: both ceilings restated, dated correction note naming the "second agent" understatement, HANDOFF-01 trigger recorded as unowned (the "Both are Phase 6 scope" claim removed), new latent entry "Handoff record outlives its sender's despawn". STATE.md has one new Blockers/Concerns bullet.

## Task Commits

1. Task 1 (tracer): RED `944422e`, GREEN `9b5282f`
2. Task 2: RED `3e58912`, GREEN `03f2b43`
3. Task 3: `7d85086`

## TDD Gate Compliance

- **Task 1 RED:** small-office churn failed `expected { col: 13, row: 9 } to deeply equal { col: 2, row: 3 }`; collision case failed `expected 36 to be 37` (distinct-seat count, i.e. a shared tile); lowest-free failed `seatCol 6` vs `2`. All 80 existing cases passed.
- **Task 2 RED:** ten-id case failed `expected 7 to be 10`; twelve-seated `expected 10 to be 12`; hue release `expected 150 to be 300`. The status-independence case passed at RED (the old hash never read status either) — it is a guard, not a RED. All existing hue cases passed.
- **Tracer gate:** end-of-phase mode, automated-only verify; re-ran `pnpm --filter pixel-office test -- index` green (83/83) before Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale doc pointer in types.ts**
- **Found during:** Task 2 (grep for `hueForAgentId`)
- **Issue:** `Character.hueShift`'s JSDoc named the deleted `hueForAgentId`.
- **Fix:** Points at `identityHueFor` and says the hue depends on the agentId and seated hues.
- **Files modified:** packages/pixel-office/src/types.ts (not in files_modified; comment-only)
- **Commit:** 03f2b43

**Total deviations:** 1 auto-fixed. **Impact:** comment only.

## Known Stubs

None.

## Threat Flags

None. T-05-14-01, 02 and 04 are mitigated as planned; T-05-14-03 stays accepted.

## Next Phase Readiness

Ready for 05-15/05-16. The 05-16 live proof's `deskPosition(slot)` / `claimDesk` mirror still matches, because no churn happens there and agent k on an empty floor still gets slot k. The open item is the roadmap decision on where HANDOFF-01's production trigger lives. It needs to be made before Phase 6 is planned.

## Self-Check: PASSED

- Commits 944422e, 9b5282f, 3e58912, 03f2b43 and 7d85086 are all in `git log`.
- Acceptance checks:
  - `DESK_ROW_START` and `DESK_ROW_PITCH` are both still single-line `= 3` literals.
  - `function deskForSlot` count is 1, and `function identityHueFor` count is 1.
  - Task 3 greps: 2 / 1 / 0 / 1 / 2 / 1.
  - The STATE.md diff adds exactly one line, and it is inside Blockers/Concerns.
  - The 05-11-SUMMARY.md diff is empty.
- `pnpm --filter pixel-office test` passes 87/87 and `pnpm --filter web test` passes 18/18.
