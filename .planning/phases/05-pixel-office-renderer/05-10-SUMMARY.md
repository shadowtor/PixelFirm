---
phase: 05-pixel-office-renderer
plan: 10
subsystem: ui
tags: [canvas2d, pixel-art, renderer, tdd, vitest, fnv1a]

requires:
  - phase: 05-pixel-office-renderer
    provides: 05-07's bubble/badge sprite assets and the renderScene overlay draw pass; 05-08's live end-to-end proof that surfaced CR-02/WR-08
provides:
  - "resolveBubbleY: owner-bound state-glyph vertical placement (never relocated onto a neighbour)"
  - "Desk layout with real glyph headroom — DESK_ROW_START 3, DESK_ROW_PITCH 3, overflow clamped to DEFAULT_ROWS - 2"
  - "hueForAgentId: deterministic per-agent identity hue (FNV-1a onto 12 x 30deg buckets)"
  - "getCharacterSprites(hueShift) — single-argument signature, dead palette index removed"
  - "assertFrameCount: load-time validation of the fixed-index sprite frame access"
  - "A 19-character composite renderer test that would have gone red against the 05-08 code"
affects: [05-11, 05-12, apps/web renderer integration, Phase 7 visibility filtering]

actuals:
  tokens: 6900
  tasks: 2
  commits: 4
  plan_head_before: 7cb0d849a8701a1fdbcedf0720e2c2c188c6a0d2

tech-stack:
  added: []
  patterns:
    - "Owner-bound overlay placement: an overlay that makes a claim about a specific entity is anchored to that entity's own draw box, never floored against an unrelated canvas edge"
    - "Control-render diffing to isolate overlay pixels in renderer tests (colour partitioning is unsafe — glyphs share #000000/#ffffff with the character sprite)"
    - "Identity/state channel separation: hue is identity only and no AgentStatus value may influence it"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/index.test.ts
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/sprites/spriteData.ts
    - packages/pixel-office/src/sprites/spriteData.test.ts
    - packages/pixel-office/src/handoff/handoff-choreography.test.ts

key-decisions:
  - "Desk rows moved to 3/6/9 (start 3, pitch 3) rather than 05-VERIFICATION.md's suggested single top gutter row — a gutter alone leaves the first desk on row 2, where the glyph position is still negative and the clamp still fires, so the defect would have survived"
  - "No horizontal bubble clamp shipped, declining 05-VERIFICATION.md's Truth 2 `missing:` ask — an 11-wide glyph centred on a 16-wide sprite is always a subset of its owner's extent, so a clamp is unreachable code; a containment test is the guard instead"
  - "getCharacterSprites' palette index was deleted rather than given a meaning — there is exactly one character template in the repo, so the parameter had nothing to select"
  - "Twelve identity hue buckets accepted as a known ceiling (collisions past 12 seated agents), flagged in-code with a ponytail comment and an on-canvas-name-label upgrade path"
  - "Default office now seats 54 desks (down from 162) — accepted ceiling, in-code ponytail comment naming a larger grid / scrolling camera as the upgrade path"

patterns-established:
  - "Owner-bound overlay rule: clipping at a canvas edge is strictly better than misattribution to a neighbouring entity"
  - "Composite multi-character renderer tests seeded through the REAL seating layout (upsertCharacterFromAgent + getCharacter), not hand-placed tiles, so a layout regression and a placement regression are both caught by one test"

requirements-completed: [OFFICE-01, OFFICE-03]

coverage:
  - id: D1
    description: "A character's state glyph is drawn above its own head and never over a pixel a different character's sprite painted"
    requirement: OFFICE-03
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#never paints a later-row agent's blocked glyph inside the sprite box of the agent seated in front of it"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#places the glyph above the owner's own head when the owner has headroom"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#attaches the glyph to the owner's own sprite top — never a canvas row a neighbour owns — when there is no headroom"
        status: pass
    human_judgment: false
  - id: D2
    description: "The default office never seats a desk on an interior row where the glyph has no room above the sprite"
    requirement: OFFICE-03
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#seats the first desk row at interior row 3 and the next at interior row 6, sharing column 1"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#never seats a desk on interior row 1 or 2, and keeps consecutive desk rows at least 3 apart"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#clamps overflow desks to the last interior row rather than seating a character inside the wall border"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two different agent ids produce different character pixel data, so two desks are tellable apart"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#gives different agent ids different hues, and those hues produce different pixel data"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/spriteData.test.ts#genuinely reads its hue argument: two different hues differ in at least one cell (WR-08)"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#derives the hue deterministically — the same agent id yields the same hue across resets"
        status: pass
    human_judgment: false
  - id: D4
    description: "A regenerated character sprite JSON with the wrong frame count fails at module load with a named error, not inside the render loop"
    requirement: OFFICE-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/spriteData.test.ts#throws an Error naming the direction and the expected frame count when handed too few frames"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/spriteData.test.ts#does not throw for a well-formed 7-frame array"
        status: pass
    human_judgment: false
  - id: D5
    description: "The dead palette parameter is gone from the public surface rather than left accepted-and-unread"
    requirement: OFFICE-01
    verification:
      - kind: other
        ref: "grep -rl 'paletteIndex' packages/pixel-office/src (returns nothing)"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/spriteData.test.ts#exposes a single-argument signature: (hueShift) => CharacterSprites — the dead palette index is gone (WR-08)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The state-signal overlay is legible at typical stream/viewing scale, and blocked/waiting remain distinguishable from active in a grayscale/colourblind view"
    requirement: OFFICE-03
    verification: []
    human_judgment: true
    rationale: "Judgment-tier. This plan fixes WHICH agent a glyph belongs to — the stronger ground on which 05-VERIFICATION.md failed it — but legibility at stream scale and grayscale survivability are visual judgments no assertion makes. Deliberately routed to 05-12-PLAN.md's human verification, as this plan's own planner_assumptions records."

duration: 20 min
completed: 2026-09-21
status: complete
---

# Phase 05 Plan 10: Owner-Bound Glyph Placement and Per-Agent Identity Pixels Summary

**The blocked glyph now belongs to the agent it describes — bound to its owner's sprite box instead of floored against the canvas — on a desk layout (rows 3/6/9) with real headroom, with per-agent identity hue derived from a deterministic FNV-1a fold of the agentId and load-time frame-count validation on the sprite asset.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 (both TDD)
- **Files modified:** 9
- **Tests:** 50 → 63 (13 added, all passing)

## Accomplishments

- **CR-02 closed.** `resolveBubbleY` binds the state glyph to its owner: preferred position is above the owner's own sprite top; when that is negative the glyph attaches to the owner's own sprite box (floored at 0) rather than being relocated onto whatever canvas row a neighbour occupies. The 05-08 clamp did the latter, which is why a row-2 agent's `blocked` glyph painted entirely inside the row-1 agent's sprite — a true claim about the wrong agent.
- **Desk layout with real headroom.** `DESK_ROW_START = 3` / `DESK_ROW_PITCH = 3` put desks on interior rows 3, 6 and 9, making the no-headroom branch unreachable in the default office. Overflow past 54 desks clamps to `DEFAULT_ROWS - 2` instead of seating a character inside the wall border. Every interior tile stays walkable floor, so `findPath` still routes handoff walks through the now-empty rows between desks.
- **WR-08 closed.** `getCharacterSprites`' palette index — accepted, folded into the cache key, never read, and therefore the reason every agent rendered byte-identical pixels — was deleted, along with the orphaned `Character.palette` field it fed. A new module-private `hueForAgentId` folds the agentId through FNV-1a onto twelve 30-degree identity buckets, pure and deterministic so a recorded stream and a live view agree about who is who.
- **IN-04 closed.** `assertFrameCount` runs once per direction before any indexed access, so a regenerated or truncated `character-metrocity.json` fails at load naming the direction, the expected count (7) and the count actually received — instead of throwing inside `requestAnimationFrame`.
- **IN-06 closed.** The z-sort comment now states what the code does (ascending `zY`, drawn in order, so a lower `zY` is drawn first and sits behind) rather than the inverse.
- **The regression guard exists.** A 19-character composite test seeds agents through the real `upsertCharacterFromAgent` seating layout, blocks only the later-row agent, isolates its glyph rects via a control render, and asserts disjointness from the earlier-row agent's sprite box. Against the 05-08 code it goes red on the real defect: a glyph pixel at `(29,7)` inside agent-1's box `{16..32, -8..24}`.

## Task Commits

1. **Task 1 (tracer, TDD): owner-bound glyph placement + desk headroom**
   - RED — `e83e706` `test(05-10)`: 5 new tests fail; composite fails on the real CR-02 defect
   - GREEN — `810fd9f` `feat(05-10)`: `resolveBubbleY`, desk constants, IN-06 comment, handoff test start-tile fix
   - REFACTOR — none needed; no commit (the reference commits REFACTOR only on change)
2. **Task 2 (TDD): identity hue, dead parameter removal, frame validation**
   - RED — `c274d14` `test(05-10)`: 4 new tests fail (hue arg unread, hues identical, helper absent)
   - GREEN — `7267d66` `feat(05-10)`: single-argument `getCharacterSprites`, `hueForAgentId`, `assertFrameCount`, `Character.palette` removed

## TDD Gate Compliance

Both tasks completed a full RED → GREEN cycle with the gate commits present and in order:

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | `e83e706` ✓ | `810fd9f` ✓ | — (no change) | Pass |
| 2 | `c274d14` ✓ | `7267d66` ✓ | — (no change) | Pass |

RED evidence was verified manually rather than through `gsd_run check tdd-red-evidence`: that verb's TAP parser targets `node --test` summary lines, which Vitest does not emit — a recurring GSD tooling gap on this repo, already recorded in STATE.md from Phases 01 and 03. Both RED runs were captured with the failing test names and assertion messages (Task 1's target failure: `glyph rect {"color":"#000000","x":29,"y":7,...} lands inside agent-1's sprite box {"left":16,"right":32,"top":-8,"bottom":24}`), and in both cases all previously passing tests stayed green, so neither RED was a load crash, a zero-discovery, or an unrelated failure.

## Files Created/Modified

- `packages/pixel-office/src/engine/renderer.ts` — `resolveBubbleY` helper replacing the canvas clamp; corrected z-sort comment; single-argument `getCharacterSprites` call
- `packages/pixel-office/src/engine/renderer.test.ts` — `resolveBubbleY` unit cases, 19-character CR-02 composite, horizontal-containment guard; top-row case reworded to the owner-attached rule
- `packages/pixel-office/src/index.ts` — `DESK_ROW_START`/`DESK_ROW_PITCH` layout, overflow clamp, `hueForAgentId`, hue threaded into `createCharacter`
- `packages/pixel-office/src/index.test.ts` — desk-headroom cases and per-agent identity hue cases
- `packages/pixel-office/src/sprites/spriteData.ts` — `assertFrameCount`, single-argument signature, hue-only cache key
- `packages/pixel-office/src/sprites/spriteData.test.ts` — signature pin rewritten, hue-is-read case, `assertFrameCount` cases
- `packages/pixel-office/src/engine/characters.ts` — `palette` dropped from `createCharacter`'s parameters and return literal
- `packages/pixel-office/src/types.ts` — `Character.palette` removed; `hueShift` documented as the identity channel
- `packages/pixel-office/src/handoff/handoff-choreography.test.ts` — reads the sender's real `tileCol`/`tileRow` instead of the now-invalid literal `findPath(1, 1, ...)`

## Decisions Made

See `key-decisions` in the frontmatter. The two worth restating:

- **A single gutter row would not have worked.** 05-VERIFICATION.md suggested one top gutter row, which puts the first desk on interior row 2 where the preferred glyph position is `16r - 39 = -7` — still negative, so the clamp still fires and the defect survives. Pitch 3 from row 3 is the smallest layout where `16p > 47` clears the sprite box of the row behind, making the fallback unreachable in the default office.
- **The horizontal clamp was declined, not dropped.** 05-VERIFICATION.md's Truth 2 `missing:` list asks for a `bubbleX` map-bounds clamp. An 11-wide glyph centred on a 16-wide sprite is always a strict subset of its owner's extent, and the owner is always on the map, so the clamp would be unreachable code. The containment test asserts the real invariant instead and goes red the moment a glyph wider than a character is introduced. A comment at the centring line records this.

## Deviations from Plan

### Interpretation adjustments (no rule-triggered auto-fixes)

**1. [Rule 3 - Blocking] The plan's `grep -rn "\.palette"` acceptance criterion is over-broad and was satisfied on intent**

- **Found during:** Task 2 acceptance verification
- **Issue:** The criterion "`grep -rn "\.palette" packages/pixel-office/src` returns no hits" also matches `json.palette` and `parsed.palette` — the bubble/badge sprite ASSET format's palette key in `bubbleSprites.ts` and its tests, which is an unrelated concept from the removed `Character.palette` field. Satisfying the criterion literally would mean renaming the checked-in JSON asset schema, which is out of this plan's scope and would break every `bubble-*.json` / `badge-*.json` asset.
- **Fix:** Verified the criterion's actual target instead — a repo-wide grep for `Character.palette` references (`ch.palette`, `character.palette`, any `.palette` excluding `json.`/`parsed.`) across `packages` and `apps` returns zero hits. The plan's other, precise criterion (`grep -rl "paletteIndex" packages/pixel-office/src` returns nothing) also passes.
- **Files modified:** none (verification-only)
- **Verification:** `grep -rn 'ch\.palette\|character\.palette\|\.palette\b' --include=*.ts --include=*.tsx packages apps | grep -v 'json\.palette\|parsed\.palette'` → empty
- **Committed in:** n/a (no code change)

**2. [Scope boundary] Pre-existing type errors left alone**

- **Found during:** post-Task-2 typecheck
- **Issue:** `npx tsc --noEmit -p packages/pixel-office` reports TS2835 extensionless-import errors across `event-schema` and several `*.test.ts` files, plus two TS18046 `'visual' is of type 'unknown'` errors in `status-mapping.test.ts`.
- **Decision:** Out of scope. The TS2835 gap is already a recorded STATE.md blocker from 05-01; the TS18046 errors were introduced by 05-02 (`39fc0b0`) and are untouched by this plan. Filtering TS2835 out, this plan introduced **zero** new type errors.
- **Files modified:** none

---

**Total deviations:** 1 criterion-interpretation adjustment, 1 scope-boundary decline. No rule-triggered code auto-fixes.
**Impact on plan:** None. Every task action and acceptance criterion's intent was met; no scope creep.

## Known Stubs

None. No placeholder values, unwired data sources, or skipped tests were introduced.

Two ceilings were accepted deliberately and are flagged in-code with `ponytail:` comments (not stubs — working code with a documented limit):

| Ceiling | File | Upgrade path |
|---|---|---|
| Twelve identity hue buckets — collisions past 12 seated agents | `packages/pixel-office/src/index.ts` (`hueForAgentId`) | On-canvas name labels; 05-UI-SPEC.md's Typography section already reserves the monospace/11px scale |
| 54 desks on the default 20x11 grid; overflow stacks on the last valid row | `packages/pixel-office/src/index.ts` (`nextDeskPosition`) | A larger grid or a scrolling camera |

Both are carried forward in 05-11-PLAN.md's deferred-items entry, as this plan's `planner_assumptions` specifies.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes. `pixel-office` remains a pure consumer of already-projected state; this plan narrowed its public surface rather than widening it.

The plan's own threat register is addressed:

| Threat ID | Disposition | Status |
|---|---|---|
| T-05-10-01 (glyph misattribution = spoofed state claim) | mitigate | Closed — owner-bound placement plus the 19-character composite regression guard |
| T-05-10-02 (unvalidated fixed-index frame access) | mitigate | Closed — `assertFrameCount` fails at load, not in the render loop |
| T-05-10-03 (identity non-repudiation across replay) | mitigate | Closed — pure deterministic hash of the agentId, no `Math.random`/`Date.now` |
| T-05-10-04 (glyph reveals task state to any viewer) | accept | Unchanged — INTERNAL-tier only until Phase 7 |

## Issues Encountered

- **Vitest cannot produce `tdd-red-evidence`-parseable output.** Recorded above under TDD Gate Compliance; RED was verified manually for both tasks, consistent with Phases 01 and 03. This is a GSD tooling gap on Vitest-based repos, not a discipline lapse.
- **`resolveBubbleY`/`assertFrameCount` could not be statically imported during RED** — a named import of a not-yet-existing export is an ESM link failure, which would classify as INVALID_RED rather than a genuine assertion failure. Both RED tests use `await import(...)` inside the test body instead, so they fail as `resolveBubbleY is not a function` within the target test. Kept as-is after GREEN; it is valid and passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **05-09 is unblocked and unaffected.** This plan's public-surface narrowing removed `Character.palette` and `getCharacterSprites`' first parameter; 05-09 references neither and reads `seatCol`/`seatRow` dynamically rather than hardcoding tile coordinates, so no assertion of its is invalidated by the new desk layout. Zero `files_modified` overlap, as the coupling note declared.
- **Routed to 05-12's human verification, deliberately unverified here:** "MUST NOT rely solely on colour/hue to distinguish blocked/waiting from active" and "MUST NOT ship a state-signal overlay that is practically illegible at typical stream/viewing scale". This plan strengthened the ground under both (shape-not-colour holds in the asset data; hue is identity-only per 05-UI-SPEC.md's locked separation; and the glyph now belongs to the right agent), but both remain judgment-tier with no mechanical test — see coverage deliverable D6.
- **Carried forward unchanged from 05-08:** still no producer of `agent.online` anywhere in the codebase, and an already-connected browser client still never re-derives `AgentStatus` from live events. Neither is touched by this plan.

## Self-Check: PASSED

- All four task commits present in `git log --oneline --all`: `e83e706`, `810fd9f`, `c274d14`, `7267d66`.
- All modified source files present on disk.
- Plan `<verification>` re-run: `npx vitest run --root packages/pixel-office` exits 0 with 63 tests (> the 50 recorded in 05-VERIFICATION.md); `grep -rl "paletteIndex" packages/pixel-office/src` returns nothing; the composite test asserts glyph/sprite-box disjointness across two agents, not a single-character bounding box.
- All task `<acceptance_criteria>` re-run and passing (see Deviations for the one over-broad criterion satisfied on intent).

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*
