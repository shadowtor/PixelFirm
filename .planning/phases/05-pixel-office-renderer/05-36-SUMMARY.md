---
phase: 05-pixel-office-renderer
plan: 36
subsystem: ui
tags: [react, accessibility, wcag, vitest, playwright, contrast]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer (05-31)
    provides: the full-viewport WALL_COLOR surround, the footer's transparent overlay, and the TRUTH 0 near-black viewport scan this plan must not regress
provides:
  - "An unconditional `background: WALL_COLOR` backdrop on the attribution footer — #cccccc measures 6.74:1 wherever the footer lands"
  - "An equality assertion on the footer's rendered background declaration, so a DELETED backdrop goes red as loudly as a black one"
  - "Unit-level coverage of the below-MIN_DISPLAY_SCALE viewport where the canvas overflows and the pinned footer can reach the floor"
  - "A third live-harness viewport (800x480) plus a computed-backdrop assertion at every viewport"
affects: [attribution, accessibility, live verification harness]

actuals:
  tokens: 5236
  tasks: 3
  commits: 4
plan_head_before: 9d1107b0a3999ed93e1e9b999e32ec1c405082fb

tech-stack:
  added: []
  patterns:
    - "Assert the PROPERTY by equality, not the absence of a bad value — an absence check passes for 'the thing is missing entirely'"
    - "Harness constants (colour included) are read from the engine's own source via readColorConst, never restated"
    - "Scope geometry assertions that are only defined in one regime behind an explicit per-entry flag (`fits`) rather than relaxing them globally"

key-files:
  created: []
  modified:
    - apps/web/src/App.tsx
    - apps/web/src/App.test.tsx
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "Backdrop is WALL_COLOR (#3A3A5C), the same constant the surround already uses — one constant, two consumers, so the footer and the surround cannot drift and no black strip returns"
  - "The 800x480 harness entry writes obsScale as a literal 3 rather than MIN_DISPLAY_SCALE, so the existing `expected === obsScale` check pins the floor instead of comparing the constant against itself"
  - "The footer-backdrop assertion sits OUTSIDE the `fits` branch: the guarantee is unconditional, so its proof must be too"
  - "Centring and the bottom-wall-band check were scoped to fitting viewports (planner assumption A3) rather than weakened — neither property is defined when the canvas overflows"

patterns-established:
  - "Equality-over-absence: a verification guard that passes for the absent case pins the regression instead of catching it (the WR-02 root cause)"
  - "`fits` flag on harness viewport entries separates regime-specific assertions from universal ones"

requirements-completed: [OFFICE-02, OFFICE-01]

coverage:
  - id: D1
    description: "The attribution footer carries its own unconditional WALL_COLOR backdrop, so the 11px #cccccc legal notice measures 6.74:1 wherever it lands instead of 4.40:1 / 3.21:1 on the MetroCity floor planks"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#backs the attribution with the office border colour, so its contrast never depends on what is underneath"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs TRUTH 0 — footerBg === rgb(58, 58, 92) at all three viewports"
        status: pass
    human_judgment: false
  - id: D2
    description: "The guard is an EQUALITY on the footer's background declaration, so both a black strip and a missing backdrop turn the suite red; the two literal-substring guards that passed for 'no backdrop at all' are gone"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx — observed RED before the fix: expected [] to deeply equal [ 'background:#3a3a5c' ]"
        status: pass
      - kind: other
        ref: "grep -n 'not\\.toContain' apps/web/src/App.test.tsx — only lines 66-68, all inside 'shows the credit unconditionally'"
        status: pass
    human_judgment: false
  - id: D3
    description: "The overflow case is covered at all — a viewport below the 960x528 canvas floor is exercised as a unit-level geometry assertion AND as a third live-harness viewport, and what is asserted there is the footer's BACKDROP, not only its position"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#keeps the credit legible where the canvas overflows the viewport and scrolls under it"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs OBS_SIZES 800x480 (fits:false) — canvas 960x528 overflows, backdrop asserted"
        status: pass
    human_judgment: false
  - id: D4
    description: "G-05-P6 is untouched by the fix: the backdrop is not black and adds no near-black pixel — the full-viewport screenshot scan still reports 0 near-black px at every checked viewport"
    requirement: "OFFICE-01"
    verification:
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs scanViewportForBlack, NEAR_BLACK_MAX=16 unchanged, 0 hits at 800x480 / 1920x1080 / 1280x720"
        status: pass
    human_judgment: false
  - id: D5
    description: "Everything 05-31 proved is unchanged and still passes: the complete attribution sentence, its always-on/ungated properties, scale 4 at 1280x720 and 6 at 1920x1080, centring when the canvas fits, CSS box == backing store, image-rendering pixelated, and the WALL_COLOR page body"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "apps/web test suite — 24/24 pass (3 files), attribution sentence byte-identical"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs — LIVE PROOF: PASS, TRUTHS 0-7 all green"
        status: pass
      - kind: unit
        ref: "packages/pixel-office test suite — 190/190 pass (8 files), engine untouched"
        status: pass
    human_judgment: false
  - id: D6
    description: "The stale 'the footer is transparent / never the floor' claims are corrected in both the App.tsx comment block and 05-UI-SPEC.md's Copywriting Contract row"
    requirement: "OFFICE-02"
    verification:
      - kind: other
        ref: "grep -c 'Corrected 05-36 (WR-02)' .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md -> 1"
        status: pass
    human_judgment: true
    rationale: "The marker string is machine-checkable but the accuracy and completeness of the corrected prose is not — a reader has to confirm the new explanation actually describes the mechanism (MIN_DISPLAY_SCALE floor vs. position:fixed footer) rather than merely replacing one confident claim with another."

# Metrics
duration: 7 min
completed: 2026-09-23
status: complete
---

# Phase 05 Plan 36: Footer Backdrop Gap Closure Summary

**The attribution footer now carries its own `background: WALL_COLOR`, proven by an equality assertion that was observed RED first, and by a third live-harness viewport (800x480) where the canvas overflows and the pinned footer actually reaches the floor.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-23T03:42:42Z
- **Completed:** 2026-09-23T03:49:57Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- **Closed G-05-P6 / WR-02.** 05-31 deleted the footer's `rgba(0, 0, 0, 0.6)` strip and replaced it with nothing, leaving 11px `#cccccc` at 4.40:1 and 3.21:1 over the two MetroCity floor planks. The footer now carries `background: WALL_COLOR` — the same constant the full-viewport surround uses — so the text measures 6.74:1 wherever it lands, and no black strip returns.
- **Fixed the guard that pinned the regression.** `App.test.tsx`'s `not.toContain("rgba(0, 0, 0")` / `not.toContain("#000")` passed for "no backdrop at all", which is exactly the defect. Replaced with an equality on the footer's background declarations extracted from the rendered markup — RED was observed (`expected [] to deeply equal [ 'background:#3a3a5c' ]`) before the style property was added.
- **Made the overflow case reachable and asserted.** `MIN_DISPLAY_SCALE` floors the canvas at 960x528 while the footer is `position: fixed`, so any smaller viewport scrolls the canvas under it. That case is now a unit-level geometry assertion (800x480, computed from `DEFAULT_COLS`/`DEFAULT_ROWS`/`TILE_SIZE`/`MIN_DISPLAY_SCALE`, never from literals) and a third live-harness `OBS_SIZES` entry.
- **Live-proved the backdrop at every viewport.** `getComputedStyle(footer).backgroundColor` is asserted outside the `fits` branch — an unconditional guarantee must not have a conditional proof. The harness reads the expected colour from the engine's own source via the existing `readColorConst`.

## Task Commits

1. **Task 1 (RED): equality assertion on the footer's backdrop** — `a06c8d6` (test)
2. **Task 1 (GREEN): `background: WALL_COLOR` + corrected comment + UI-SPEC** — `bd523ac` (feat)
3. **Task 2: overflow-viewport unit coverage** — `791d9cf` (test)
4. **Task 3: third live-harness viewport + computed-backdrop assertion** — `703ccdb` (test)

_TDD REFACTOR produced no change — the `backgroundDeclarations` helper was written in its final form during RED, so no refactor commit exists (commit-on-change only)._

## Files Created/Modified

- `apps/web/src/App.tsx` — footer gains `background: WALL_COLOR`; the comment block's two false clauses ("transparent", "never the floor") replaced with the actual mechanism and the measured ratios
- `apps/web/src/App.test.tsx` — `backgroundDeclarations()` helper; the substring guard replaced by an equality; new `OVERFLOW_VIEWPORT` case
- `scripts/verify-pixel-office-live.mjs` — `WALL_COLOR` read, `hexToRgbCss()`, `fits` flag on every `OBS_SIZES` entry, new 800x480 entry, `footerBg` in the geometry probe and its assertion, `fits`-scoped centring/band checks, overflow assertion, updated TRUTH 0 header and PASS log
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — `**Corrected 05-36 (WR-02):**` clause on the Attribution footer row

## Decisions Made

- **WALL_COLOR, not a new colour.** Reusing the surround's constant means the two can never drift, and G-05-P6's no-black-frame property is structurally untouched rather than re-verified by luck.
- **`obsScale: 3` as a literal in the harness.** Writing `MIN_DISPLAY_SCALE` there would make the existing `expected === obsScale` check compare the constant against itself and assert nothing. The literal makes it pin that 800x480 genuinely floors.
- **Scoped, not relaxed (planner assumption A3).** Centring and "the footer sits on the bottom wall row" are undefined when the canvas overflows. They are gated behind `fits: true` with an in-source comment; the overflow entry asserts `cssW > viewW || cssH > viewH` instead, so it cannot silently prove nothing.
- **No `SCROLLBAR_GUTTER_PX` needed (planner assumption A4 resolved).** The 800x480 entry reported 0 near-black pixels, so headless Chromium painted no scrollbar chrome that trips the scan. `NEAR_BLACK_MAX` stays at 16 and the conditional exclusion the plan authorised was not used.

## Deviations from Plan

None - plan executed exactly as written.

The plan permitted one conditional addition (`SCROLLBAR_GUTTER_PX`) if the overflow viewport's near-black scan reported browser scrollbar chrome. It did not, so the constant was correctly not added — that is the plan's own "if and only if" branch, not a deviation.

**Total deviations:** 0
**Impact on plan:** None. All three tasks executed as specified, all acceptance criteria verified, all prohibitions honoured.

## Verification Results

| Command | Result |
|---|---|
| `pnpm --filter web test` | 24/24 pass, 3 files (no new test file) |
| `pnpm --filter web typecheck` | clean |
| `node --check scripts/verify-pixel-office-live.mjs` | exit 0 |
| `node scripts/verify-pixel-office-live.mjs` | `LIVE PROOF: PASS` — TRUTH 0 at `800x480: scale 3 (backing 960x528, overflows)`, `1920x1080: scale 6 (fits)`, `1280x720: scale 4 (fits)`; credit backed by `rgb(58, 58, 92)` (#3A3A5C) at every viewport; 0 near-black px |
| `pnpm --filter pixel-office test` | 190/190 pass, 8 files (engine untouched) |

**Prohibitions honoured:** no black/near-black strip reintroduced (backdrop is `WALL_COLOR`); the whole-sentence pin, `position: fixed`, ungated rendering and 11px/monospace typography are byte-identical; `MIN_DISPLAY_SCALE`, the wrapper's `overflow: auto` and `NEAR_BLACK_MAX` are all unchanged; every 05-31 TRUTH 0 assertion still runs (centring and the band check scoped to the regime where they are defined, not deleted).

## Known Stubs

None. Every element of this plan is real, exercised code.

## Issues Encountered

None. RED was observed on the first run, the fix went green immediately, and the live harness passed on its first run with the new viewport.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **G-05-P6 / WR-02 is closed.** This was the only gap remaining open in `05-VERIFICATION.md`. The regression it recorded (`apps/web/src/App.tsx:169-179 — the background: rgba(0,0,0,0.6) ... deleted by 05-31 and not replaced`) is resolved with a stronger guard than the one that failed to catch it.
- **05-37 is unaffected** — that plan addresses review items WR-07/WR-08 in `handoff-choreography.ts`; this plan touched no engine source and the 190-test `pixel-office` suite is unchanged and green.
- **Pre-existing, out of contract:** `apps/web/src/App.tsx:146`'s disconnect banner uses a literal `rgba(153, 0, 0, 0.85)` background rather than a named constant. It predates this round, is not the attribution footer, and is not near-black. Recorded so it is not rediscovered as new.

## Self-Check: PASSED

- `apps/web/src/App.tsx` — FOUND, contains `background: WALL_COLOR` inside the `<footer>` element (line 188, between 178 and 193)
- `apps/web/src/App.test.tsx` — FOUND, `toEqual` count 1, `OVERFLOW_VIEWPORT` count 4, no `not.toContain` inside `App viewport fill`
- `scripts/verify-pixel-office-live.mjs` — FOUND, `OBS_SIZES` has exactly 3 entries ending at 1280x720, `footerBg` appears 3 times, `NEAR_BLACK_MAX = 16`
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — FOUND, contains `Corrected 05-36 (WR-02)`
- Commits `a06c8d6`, `bd523ac`, `791d9cf`, `703ccdb` — all present in `git log`; `git rev-list --count 9d1107b..HEAD` = 4, matching the `commits:` frontmatter

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-23*
