---
phase: 05-pixel-office-renderer
plan: 31
subsystem: ui
tags: [react, canvas, vite, playwright, pngjs, obs, pixel-art]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer
    provides: "05-21's integer display scale (displayScaleFor, MIN_DISPLAY_SCALE, backing store == CSS box)"
  - phase: 05-pixel-office-renderer
    provides: "05-12/05-26's locked attribution sentence and its whole-sentence test pin (OFFICE-02)"
  - phase: 05-pixel-office-renderer
    provides: "05-24's WALL_COLOR office border and 05-26's live-proof harness (TRUTH 0/6)"
provides:
  - "Office sized from the FULL viewport — no DOM height reserved for the footer (1280x720 -> scale 4, 1920x1080 -> scale 6)"
  - "Full-viewport WALL_COLOR surround with the canvas centred, so a non-multiple viewport never shows black"
  - "Transparent attribution footer overlaying the office's own bottom wall row, sentence unchanged"
  - "WALL_COLOR re-exported from pixel-office's public surface"
  - "Live TRUTH 0 at both documented OBS sizes with a pngjs near-black viewport scan"
affects: [obs-capture, twitch-overlay, ceo-dashboard]

actuals:
  tokens: 26664
  tasks: 2
  commits: 3
plan_head_before: eca9fff1ca49df07d6a9dbb9d8d1994e131375e1

tech-stack:
  added: []
  patterns:
    - "Host page sizes the canvas from the full viewport; DOM chrome overlays the office rather than reserving layout height"
    - "Viewport-level screenshot assertions (pngjs) alongside canvas getImageData — the canvas cannot see unpainted page background"

key-files:
  created: []
  modified:
    - apps/web/src/App.tsx
    - apps/web/src/App.test.tsx
    - apps/web/index.html
    - packages/pixel-office/src/index.ts
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md

key-decisions:
  - "The attribution stays a DOM footer (now transparent, overlaying the bottom wall row) rather than being drawn on canvas — App.test.tsx pins the sentence in rendered markup (SC4), which a canvas draw cannot satisfy"
  - "WALL_COLOR is re-exported from pixel-office and consumed by App.tsx, so the surround colour is the office's own constant rather than a duplicated literal; index.html's pre-mount body background is the one unavoidable copy and App.test.tsx pins it"
  - "The wrapper uses overflow:auto with margin:auto — below MIN_DISPLAY_SCALE the office scrolls rather than being clipped"
  - "The no-black check reads a full-viewport screenshot, not the canvas: getImageData can never observe the host page background, which is exactly where the defect lived"
  - "WALL_COLOR re-export landed in the RED commit — without it the test module cannot link, and an import error is INVALID_RED, not a behavioural failure"

patterns-established:
  - "Near-black viewport scan: every channel <= 16 in a pngjs-decoded page.screenshot(), asserted at zero (no office sprite colour has r+g+b < 60, so any hit is unpainted background)"
  - "TRUTH 0 iterates the documented OBS source sizes and ends at the default one, so later truths run at the viewport they always have"

requirements-completed: [OFFICE-02]  # OFFICE-01 held by the shared-ID gate — siblings 05-32..05-35 also declare it and have no SUMMARY yet

coverage:
  - id: D1
    description: "The display scale is computed from the full viewport with no footer allowance — 1280x720 presents at scale 4 (1280x704) and 1920x1080 at scale 6 (1920x1056); before this plan 1280x720 fell to scale 3"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#sizes the documented OBS sources from the full viewport, with no footer allowance"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs#TRUTH 0 (1920x1080 scale 6, 1280x720 scale 4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "At the OBS source size the frame shows only the office: the canvas is centred and any remainder is WALL_COLOR, with no black or near-black pixel anywhere"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#surrounds the canvas in the office border colour, so a remainder is never black"
        status: pass
      - kind: automated_ui
        ref: "scripts/verify-pixel-office-live.mjs#TRUTH 0 near-black scan — 0 px at 1280x720 and 1920x1080"
        status: pass
    human_judgment: true
    rationale: "G-05-P6 was raised by the CEO from a real OBS capture, and it closes there. Automation proves zero near-black pixels and centring at both documented sizes, and the two review screenshots were inspected, but the framing the user actually captures in OBS is theirs to confirm."
  - id: D3
    description: "The full attribution sentence stays visible at all times, overlaid on the office's bottom wall row with no black strip behind it"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#renders the complete attribution sentence, so a silent truncation goes red"
        status: pass
      - kind: unit
        ref: "apps/web/src/App.test.tsx#overlays the attribution with no black strip behind it"
        status: pass
      - kind: e2e
        ref: "scripts/verify-pixel-office-live.mjs#TRUTH 0 footer band + fork-name assertion"
        status: pass
    human_judgment: false
  - id: D4
    description: "The page background is WALL_COLOR, so no black frame shows before React mounts"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#paints the host page the same border colour, so no black frame shows before React mounts"
        status: pass
    human_judgment: false
  - id: D5
    description: "05-UI-SPEC.md records the full-viewport sizing rule, the recommended exact-multiple OBS sizes, the WALL_COLOR remainder and the transparent footer"
    verification:
      - kind: other
        ref: "grep -n \"05-31\" .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md (3 matches: Spacing Exceptions, Color Secondary, Copywriting Attribution footer)"
        status: pass
    human_judgment: false

duration: 9 min
completed: 2026-09-22
status: complete
---

# Phase 05 Plan 31: Full-Viewport Office Fill Summary

**The office is now sized from the whole viewport and centred on a WALL_COLOR surround, with the attribution overlaying its bottom wall row — a 1280x720 OBS source renders at scale 4 (1280x704) with zero black pixels in the frame, where it previously fell to scale 3 and left a black L-shape.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-22T22:30:55Z
- **Completed:** 2026-09-22T22:40:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Deleted `FOOTER_RESERVE_PX`: `currentDisplayScale()` now floors against the full `window.innerHeight`, so 1280x720 gives scale 4 instead of 3 and 1920x1080 stays at 6.
- The canvas sits in a fixed full-viewport flex wrapper painted `WALL_COLOR` with `margin: auto`, so a non-multiple viewport splits the remainder evenly into a strip continuous with the office's own border, and a sub-minimum viewport scrolls rather than clips.
- The attribution footer lost its `rgba(0, 0, 0, 0.6)` strip and now overlays the office's bottom wall row; the sentence, position, size and colour are untouched and the whole-sentence test pin is unchanged.
- `index.html`'s body background went from `#000` to `#3A3A5C`, removing the black frame that showed before React mounts.
- `WALL_COLOR` joined pixel-office's constants re-export, so the host reads the office's own value rather than duplicating a hex literal.
- Live TRUTH 0 now runs at 1920x1080 and 1280x720, asserting the literal OBS scale, 05-21's integer/CSS-box/pixelated invariants, sub-pixel centring, the footer inside the bottom wall row, and **zero** near-black pixels in a pngjs-decoded viewport screenshot at each size.

## Task Commits

1. **Task 1 (RED): failing tests for full-viewport office fill** — `dd93675` (test)
2. **Task 1 (GREEN): full-viewport sizing, WALL_COLOR surround, transparent footer** — `e8d6a8b` (feat)
3. **Task 2: TRUTH 0 at both OBS sizes with a no-black viewport scan + UI-SPEC** — `8594605` (test)

_No REFACTOR commit: the GREEN diff is a constant deletion, one wrapper element and two style changes — there was nothing to clean up._

## Files Created/Modified

- `apps/web/src/App.tsx` — full-viewport scale, WALL_COLOR wrapper with a centred canvas, transparent footer
- `apps/web/src/App.test.tsx` — four new behaviour tests (OBS scale pins, surround, host background, no black strip)
- `apps/web/index.html` — body background is WALL_COLOR, not black
- `packages/pixel-office/src/index.ts` — `WALL_COLOR` added to the constants re-export
- `scripts/verify-pixel-office-live.mjs` — explicit 1280x720 page viewport, two-size TRUTH 0, `scanViewportForBlack` via pngjs
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — sizing rule, recommended OBS sizes, WALL_COLOR remainder, transparent footer

## Decisions Made

- **The footer stays DOM, not canvas.** Drawing the credit on the canvas would free the layout entirely, but `App.test.tsx` pins the sentence in rendered markup (SC4/OFFICE-02) and a canvas draw cannot satisfy that pin. Making it transparent and letting it overlay the office's own bottom wall row achieves the same visual result with a two-property diff.
- **The surround colour comes from the engine.** `WALL_COLOR` is re-exported and imported by `App.tsx` rather than retyped. `index.html`'s pre-mount background is the one place a literal was unavoidable (no module runs yet), so `App.test.tsx` asserts that literal equals the imported constant — a drift there goes red.
- **The near-black check reads the viewport, not the canvas.** `getImageData` sees only what the engine painted; the entire defect was host-page background *outside* the canvas. A pngjs-decoded `page.screenshot()` is the only instrument that can observe it.
- **`overflow: auto` over clipping.** Below `MIN_DISPLAY_SCALE` the office is larger than the viewport; scrolling is strictly better than silently cropping the floor.
- **The `WALL_COLOR` re-export shipped in the RED commit.** Without it the test module fails to link, and an import error is INVALID_RED under `tdd.md`, not a behavioural failure. The export carries no behaviour; all four behaviour assertions were still red.

## Deviations from Plan

None — plan executed as written.

One recorded difference in *evidence handling*, not in scope: `gsd check tdd-red-evidence` could not be used to certify RED. Its record parser targets `node --test`'s TAP summary lines (`# tests`/`# pass`/`# fail`); Vitest's TAP reporter emits a nested `ok`/`not ok` tree with no such summary, so the verb returns `INVALID_RED (zero_tests_discovered)` on a genuinely red run. This is the same tooling gap already flagged in STATE.md for plans 01-03 and 03-02 (twice), and RED was verified manually the same way: three named target tests failing on assertions about the planned behaviour, with 20 unrelated tests still green (ruling out syntax, discovery and fixture failures), and the assertion output showing exactly the pre-change state (`background:#000`, `rgba(0, 0, 0, 0.6)`, an empty wrapper slice).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `dd93675` `test(05-31)` | Pass — 3 target tests failed on assertions, 20 unrelated green (verified manually; see Deviations) |
| GREEN | `e8d6a8b` `feat(05-31)` | Pass — 23/23 web tests, typecheck clean, pixel-office 152/152 |
| REFACTOR | — | Not needed; no commit made (per `tdd.md`, REFACTOR commits only on change) |

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter web test` | 23/23 passed (3 files) |
| `pnpm --filter web typecheck` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter pixel-office test` | 152/152 passed (8 files) — the re-export broke nothing |
| `node --check scripts/verify-pixel-office-live.mjs` | clean |
| `node scripts/verify-pixel-office-live.mjs` | **LIVE PROOF: PASS** — all eight truths |

Live TRUTH 0 output:

```
TRUTH 0 PASS — 1920x1080: scale 6 (backing 1920x1056), 1280x720: scale 4 (backing 1280x704);
centred, pixelated, CSS box == backing store, credit on the bottom wall, 0 near-black px
```

**Screenshot review** (written to a scratch directory outside the repo via `PIXEL_OFFICE_SHOTS`, both inspected):

- `viewport-1280x720.png` — the office fills the frame edge to edge. The only non-office area is the `WALL_COLOR` border: the office's own side walls at left and right, and the bottom wall row plus the 8px remainder strip. No black anywhere. The credit sits on that bottom purple strip, fully legible, clear of the floor.
- `viewport-1920x1080.png` — identical composition at scale 6, with 12px `WALL_COLOR` remainder strips above and below the office. Credit again on the bottom strip, floor untouched.

## Issues Encountered

- `gsd check tdd-red-evidence` rejected two record schemas before camelCase (`exitCode`/`targetTest`) was accepted, and then still returned `zero_tests_discovered` because it cannot parse Vitest TAP. Resolved by manual RED verification, consistent with prior plans in this project. Documented above and re-flagged as a standing tooling gap.
- `apps/api/.env` could not be read to pre-check the harness's four required keys — the session's secret-read guard blocks it. Not a problem: the harness itself throws by key name if any is missing, and it ran clean, which proves all four are present.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- G-05-P6 is closed and proven live at both documented OBS source sizes.
- **OFFICE-02 is marked complete.** The attribution is pinned whole-sentence in `App.test.tsx` and positively observed on the live canvas inside the bottom wall row at both OBS sizes — unlike 05-11/05-12, which left it open precisely because the live proof had never been run. `requirements.ready-ids` confirmed no unfinished sibling still declares it.
- **OFFICE-01 is held open by the shared-ID gate**: sibling gap-closure plans 05-32..05-35 also declare it and have no SUMMARY yet. It will flip when the last declaring plan finishes.
- Remaining Phase 5 gap-closure plans (05-32..05-35) are unaffected by this change — no engine, layout or event-path code was touched.
- Recommended OBS source sizes are now documented; the user may want to switch their browser source to an exact multiple (1280x704 or 1920x1056) to remove even the border strips.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-22*

## Self-Check: PASSED

All six modified files and the SUMMARY exist on disk; all three task commits (`dd93675`, `e8d6a8b`, `8594605`) are present in git history. Measured commit count from the plan ledger (`eca9fff..HEAD`) is 3, matching the `actuals.commits` frontmatter.
