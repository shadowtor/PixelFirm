---
phase: 05-pixel-office-renderer
plan: 41
subsystem: ui
tags: [canvas, pixel-art, handoff, dialogue, vitest, gap-closure]

# Dependency graph
requires:
  - phase: 05-40
    provides: verb-led nullable-title dialogue templates, the id-never-painted guards, and nullable-title call sites in the choreography
provides:
  - "`titleOrNull` in dialogue-templates.ts: the one blank-is-absent rule (trim, null for absent/empty/whitespace), used by `resolveHandoffDialogue` and `getActiveHandoffs`"
  - "`ActiveHandoff.fullTitle: string | null`, never the task id"
  - "apps/web live task.created registration guarded on a non-empty title, like the snapshot path"
  - "IN-02: a record whose sender went offline or was re-seated stops reserving its aisle slot at once"
  - "Corrected docblocks (ActiveHandoff, showsLineOf, taskTitles) and UI-SPEC rows 102/150/173"
affects: [06-ceo-dashboard, 07-visibility-overlay]

actuals:
  tokens: 8910
  tasks: 3
  commits: 6
plan_head_before: 55c1f7e4e5ad29024734c5147115eb1d4335b196

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One guard where every caller routes through: the blank-title rule lives in the resolver, so no call site changes"
    - "A dead record (sender not current) holds no shared resource, even before the next tick retires it"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/handoff/dialogue-templates.ts
    - packages/pixel-office/src/handoff/dialogue-templates.test.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts
    - packages/pixel-office/src/index.ts
    - apps/web/src/App.tsx
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md
    - .planning/phases/05-pixel-office-renderer/deferred-items.md

key-decisions:
  - "Blank means no title known: titleOrNull is the only .trim() in pixel-office sources, and both title reads route through it"
  - "The App.tsx entry guard is a belt, not the fix; TaskCreatedPayload.title is not tightened because rowToCompanyEvent re-validates stored rows and .min(1) would break replay of already-accepted events (and still admit whitespace)"
  - "IN-02 reservation gated on senderIsCurrent(record); a current departing sender still holds its slot until retireHandoff (WR-08 unchanged)"

patterns-established:
  - "Nullable display fields on the host read path resolve through the same helper as the canvas, so the two can never disagree"

requirements-completed: [HANDOFF-01, HANDOFF-02]

coverage:
  - id: D1
    description: "A blank or whitespace title yields the complete no-title sentence, and a padded title is interpolated trimmed (CR-01)"
    requirement: HANDOFF-02
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/dialogue-templates.test.ts#renders the complete requested/accepted no-title sentence for a blank title (05-41, CR-01)"
        status: pass
      - kind: integration
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#a registered blank title yields both participants' complete no-title sentences (05-41, CR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getActiveHandoffs reports fullTitle null when no title is known or it is blank, never the task id (WR-01)"
    requirement: HANDOFF-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#reports fullTitle as null (05-41, WR-01)"
        status: pass
      - kind: other
        ref: "pnpm --filter web typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "A dead handoff record frees its aisle slot at once (IN-02); a current departing sender keeps it (WR-08)"
    requirement: HANDOFF-01
    verification:
      - kind: integration
        ref: "packages/pixel-office/src/handoff/handoff-choreography.test.ts#a record whose sender went offline frees its slot at once (review IN-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "apps/web live task.created registration skips an empty title, like the snapshot path"
    verification:
      - kind: other
        ref: "grep 'event.type === \"task.created\" && event.taskId && event.payload.title' apps/web/src/App.tsx; pnpm --filter web test (24 pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-09-23
status: complete
---

# Phase 5 Plan 41: Blank-title rule and nullable fullTitle Summary

**One `titleOrNull` helper makes a blank title read as "no title" on the canvas and on the host read path (`fullTitle: string | null`), plus an App.tsx entry guard and an immediate aisle-slot release for dead handoff records.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-23T10:35:11Z
- **Completed:** 2026-09-23T10:44Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- CR-01 closed: `resolveHandoffDialogue` routes every title through `titleOrNull`, so `""` and `"   "` yield `hands off to <name>` / `<name> accepts the handoff` through the real FSM. The malformed `hands  to agent-b` / `agent-b accepts ` strings are gone.
- WR-01 closed: `ActiveHandoff.fullTitle` is `string | null`, resolved via `titleOrNull(getTaskTitle(record.taskId))`. The task-id fallback is gone.
- App.tsx's live and snapshot title entry points now agree. event-schema is untouched.
- IN-02: a record whose sender went offline or was re-seated stops reserving its aisle slot at once. IN-01: the tautological assertion was removed.
- Docblocks and UI-SPEC rows 102 (six offsets), 150 and 173 now describe what ships.

## Task Commits

1. **Task 1 (tracer): blank title is no title, at the resolver (CR-01)**: `3d5db02` (test, RED), `38ee1d3` (feat, GREEN)
2. **Task 2: nullable fullTitle and docs (WR-01)**: `090af32` (test, RED), `31d8aa9` (feat, GREEN)
3. **Task 3: App.tsx belt, IN-02 slot release, IN-01**: `0b59321` (test, RED), `c9a37e3` (fix, GREEN)

## TDD Evidence

Each RED run used vitest `tap-flat`. The counters were transcribed from that same run's `ok` / `not ok` lines. All three returned `RED_EVIDENCE_OK`.

| Task | # tests | # pass | # fail | Received (RED) |
|------|---------|--------|--------|----------------|
| 1 | 86 | 79 | 7 | `hands  to Ada`, `Ada accepts `, `hands     to agent-b`, `hands   Fix login   to Ada` |
| 2 | 69 | 67 | 2 | `"task-1"`, `"   "` as fullTitle |
| 3 | 70 | 69 | 1 | `{ col: 8, row: 6 }` (second slot) instead of `{ col: 10, row: 6 }` |

Revert-proof spot checks, each restored afterwards:
- Removing `titleOrNull` from the resolver fails exactly the 7 blank-title cases.
- Putting the task-id fallback back on `fullTitle` fails the 2 null cases.
- Dropping `senderIsCurrent(record)` from the reservation fails only the IN-02 case. Both WR-08 cases stay green.

## Verification

- `pnpm --filter pixel-office test`: 216 passed (207 at HEAD, plus 9 new).
- `pnpm --filter web test`: 24 passed. `pnpm --filter web typecheck`: no `error TS`.
- `pnpm turbo run test --force`: 10/10 on the second run. The first run had 9/10 with 1 `apps/worker` failure. That package is not touched here, and it passed 21/21 alone. Logged to deferred-items.md.
- `git grep -n "\.trim()" -- packages/pixel-office/src ':!*.test.ts'`: one hit, in `titleOrNull`.
- All acceptance greps for the three tasks pass.

## Deviations from Plan

None - plan executed exactly as written. Two small wording notes:
- The App.tsx comment wraps over three lines. The plan said one line.
- Task 3's GREEN commit is typed `fix`, because it is a bug fix (IN-02).

## Issues Encountered

- A PreToolUse hook blocked one commit because `grep -n` shared the command line with `git commit`. Running the two separately fixed it.
- The flaky `apps/worker` test described above.

## Next Phase Readiness

Both verification gaps (CR-01, WR-01) are closed, and IN-02 and IN-01 are folded in. Phase 5 is ready for re-verification. Phase 6 can consume a nullable `fullTitle`.

## Self-Check: PASSED
