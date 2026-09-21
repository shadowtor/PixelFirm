---
phase: 05-pixel-office-renderer
plan: 02
subsystem: pixel-office
tags: [status-mapping, sprite-assets, licensing, attribution, canvas2d]

requires:
  - phase: 05-pixel-office-renderer
    plan: 01
    provides: "AgentStatus contract (event-schema), packages/pixel-office's forked Character FSM (engine/characters.ts, types.ts), apps/web shell — 05-02 replaces 05-01's IDLE-only upsertCharacterFromAgent stub with the exhaustive mapping"
provides:
  - "STATUS_MAP — the exhaustive AgentStatus (15 values) -> {pose, bubble?, frozen?, frameSpeedMultiplier?} lookup table, no fallback branch"
  - "9 new bubble/badge icon sprite assets in the existing palette+pixels JSON format"
  - "references/ASSET-LICENSES.md — D-05's scoped asset-licence audit"
  - "Visible in-app attribution footer (apps/web)"
affects: [05-03-real-derivation, 05-04-handoff-choreography, 06-ceo-dashboard]

actuals:
  tokens: 10358
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Exhaustive Record<AgentStatus, StatusVisual> lookup table with no runtime fallback — a missing key is a compile-time impossibility, not a default"
    - "Distinct-silhouette icon design: every new bubble/badge glyph is a different pictogram shape (octagon+bar, X, checkmark, ring+handle, diagonal bar, wide oval, rect+tail+dots, rect+tab+lines, rocket+fins) so OFFICE-03's grayscale/colourblind legibility holds without relying on colour alone"
    - "Character.frozen + Character.frameSpeedMultiplier fields drive engine/characters.ts's updateCharacter — frozen short-circuits frame advance entirely (not just IDLE's already-static case), frameSpeedMultiplier scales dt accumulation for the one legitimate procedural-variation state (deploying)"

key-files:
  created:
    - packages/pixel-office/src/status/status-mapping.ts
    - packages/pixel-office/src/status/status-mapping.test.ts
    - packages/pixel-office/src/sprites/bubble-blocked.json
    - packages/pixel-office/src/sprites/bubble-failed.json
    - packages/pixel-office/src/sprites/bubble-completed.json
    - packages/pixel-office/src/sprites/badge-planning.json
    - packages/pixel-office/src/sprites/badge-researching.json
    - packages/pixel-office/src/sprites/badge-testing.json
    - packages/pixel-office/src/sprites/badge-reviewing.json
    - packages/pixel-office/src/sprites/badge-discussing.json
    - packages/pixel-office/src/sprites/badge-deploying.json
    - references/ASSET-LICENSES.md
  modified:
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/index.test.ts
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/engine/characters.ts
    - apps/web/src/App.tsx

key-decisions:
  - "Widened Character.bubbleType from the fork's original \"permission\"|\"waiting\"|null to a new 11-member BubbleType union (types.ts) covering both reused fork concepts and the 9 new glyphs — necessary for STATUS_MAP to type-check, not requested by the plan's own <files> list for Task 1 but required for compile (Rule 3)."
  - "Added Character.frozen and Character.frameSpeedMultiplier fields (types.ts, characters.ts) rather than encoding freeze/speed purely as a status-mapping-time side effect — updateCharacter now short-circuits animation entirely when frozen, and scales dt by frameSpeedMultiplier otherwise. This is structurally correct even though every current frozen state happens to use the already-static IDLE pose (defensive against a future plan changing that)."
  - "Did not fork/author bubble-permission.json/bubble-waiting.json — the plan's action text describes waiting_for_ceo/waiting_for_agent as reusing 'the fork's existing bubble-permission/bubble-waiting sprites,' but 05-01 never actually forked those JSON assets (dropped per its own scope trim) and no code in this plan's file list loads/renders any bubble JSON yet (engine/renderer.ts still doesn't draw bubbles — that remains out of scope past this plan, per its own header comment). STATUS_MAP's bubble: \"permission\"/\"waiting\" are data labels only; nothing currently resolves them to pixels, so there was nothing to fork yet."
  - "references/ASSET-LICENSES.md's 'Provenance-undocumented, used this phase' section reports NONE rather than listing furniture/floor/wall/carpet assets as instructed by the plan's literal wording — this repo's actual forked renderer draws every tile as a flat solid-colour fill (FALLBACK_FLOOR_COLOR/WALL_COLOR), verified via grep across packages/pixel-office/src for any furniture/carpet/.png/assets path reference (none found beyond comment text about dropped subsystems). The plan assumed the fork's original PNG-based floor/furniture pipeline was still wired in; 05-01 trimmed it out entirely, so there is nothing at this trust boundary to flag as provenance-undocumented this phase — documented honestly rather than inventing entries for assets this repo doesn't load."

patterns-established:
  - "Pattern: new AgentStatus-driven visual state fields (frozen, frameSpeedMultiplier) live on the Character struct itself and are applied unconditionally by upsertCharacterFromAgent from resolveStatusVisual's output, keeping engine/characters.ts's updateCharacter ignorant of AgentStatus entirely (pure consumer of Character fields, per RESEARCH.md Anti-Pattern 1's spirit extended to the internal engine boundary)."

requirements-completed: [OFFICE-01, OFFICE-02, OFFICE-03]

coverage:
  - id: D1
    description: "status-mapping.ts's exhaustive STATUS_MAP has a defined entry for every one of the 15 AgentStatus values — no gaps, no fallthrough default"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/status/status-mapping.test.ts#STATUS_MAP exhaustiveness"
        status: pass
    human_judgment: false
  - id: D2
    description: "waiting_for_agent and waiting_for_ceo resolve to different bubble icons; blocked, waiting_for_agent, and waiting_for_ceo all resolve to frozen: true"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/status/status-mapping.test.ts#OFFICE-03 blocked/waiting glanceable signal"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#upsertCharacterFromAgent freezes and applies a distinct bubble"
        status: pass
    human_judgment: false
  - id: D3
    description: "references/ASSET-LICENSES.md lists MetroCity as confirmed CC0, fork engine code as MIT, provenance-undocumented assets are never silently upgraded to confirmed, and unused fork asset packs are explicitly deferred (D-05)"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "grep -ic confirmed references/ASSET-LICENSES.md (non-zero) && ! grep -A3 -i Provenance-undocumented ... | grep -qi confirmed"
        status: pass
    human_judgment: false
  - id: D4
    description: "apps/web renders a visible, always-on attribution line crediting the fork and MetroCity CC0 pack — not only recorded in a planning document"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "grep -c pixel-agents-hq/pixel-agents apps/web/src/App.tsx (output 1)"
        status: pass
      - kind: unit
        ref: "apps/web/src/App.test.tsx / ws-client.test.ts (existing suite still green after JSX change)"
        status: pass
    human_judgment: false
  - id: D5
    description: "9 new bubble/badge icon assets parse as valid JSON with a palette object and a 13-row, 11-col pixels array, each a visually distinct silhouette (not a recolour of another icon) per OFFICE-03's grayscale-legibility prohibition"
    requirement: "OFFICE-03"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/status/status-mapping.test.ts#new bubble/badge sprite assets"
        status: pass
      - kind: unit
        ref: "manual grid-shape review during authoring (octagon+bar, X, checkmark, clipboard, magnifying glass, wrench, eye, speech-bubble+dots, rocket+fins — nine distinct silhouettes)"
        status: pass
    human_judgment: true
    rationale: "OFFICE-03's 'visually distinct at a glance' bar is inherently a visual/subjective claim automated JSON-shape parsing can't fully cover — RESEARCH.md's own Validation Architecture flags this same gap (Playwright screenshot diff deferred to phase-gate, not this plan's required verify). The 9 grids were hand-designed with deliberately different pictogram silhouettes and are ready for a human/Playwright visual pass at phase gate."

duration: ~55min
completed: 2026-09-21
status: complete
---

# Phase 5 Plan 2: Exhaustive AgentStatus Visual Mapping + Asset-Licence Audit Summary

**All 15 `AgentStatus` values now resolve through a single exhaustive `STATUS_MAP` to a real pose/bubble/frozen/frameSpeedMultiplier combination — replacing 05-01's IDLE-only stub — with 9 new distinct-silhouette icon assets, a scoped honest asset-licence audit, and a visible in-app attribution footer.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-21T03:06:46Z
- **Tasks:** 2 (both `type="auto"`, no checkpoints — plan is `autonomous: true`)
- **Commits:** 2 (measured: `git rev-list --count 54c65d2..HEAD`)

## Accomplishments

- `packages/pixel-office/src/status/status-mapping.ts` — `STATUS_MAP: Record<AgentStatus, StatusVisual>`, all 15 entries taken verbatim from RESEARCH.md Pattern 2's disposition table; `resolveStatusVisual()` is a thin accessor with no fallback branch
- 9 new bubble/badge sprite JSON assets, each a distinct pictogram silhouette (stop-octagon, X, checkmark, clipboard, magnifying glass, wrench, wide eye, speech-bubble+dots, rocket+fins) in the established `{palette, pixels}` 11×13 format
- `packages/pixel-office/src/index.ts`'s `upsertCharacterFromAgent` now drives every status through `resolveStatusVisual`: `offline` despawns the character, everything else sets pose/bubble/frozen/frameSpeedMultiplier
- `packages/pixel-office/src/types.ts` gained `BubbleType` (11-member union) and `Character.frozen`/`Character.frameSpeedMultiplier`; `engine/characters.ts`'s `updateCharacter` now short-circuits animation when frozen and scales `dt` by `frameSpeedMultiplier`
- `references/ASSET-LICENSES.md` — the D-05 scoped audit (Confirmed CC0 / MIT / Provenance-undocumented / Deferred)
- `apps/web/src/App.tsx` — always-on fixed footer crediting the fork and MetroCity pack

## Task Commits

1. **Task 1: Exhaustive AgentStatus -> visual mapping** — `39fc0b0` (feat)
2. **Task 2: Asset-licence audit + in-app attribution** — `ee993c2` (docs)

## Files Created/Modified

- `packages/pixel-office/src/status/status-mapping.ts` — `STATUS_MAP`, `StatusVisual`, `resolveStatusVisual`
- `packages/pixel-office/src/status/status-mapping.test.ts` — exhaustiveness, distinct-bubble, frozen-flag, offline-sentinel, deploying-speed, and sprite-JSON-validity assertions
- `packages/pixel-office/src/sprites/{bubble-blocked,bubble-failed,bubble-completed,badge-planning,badge-researching,badge-testing,badge-reviewing,badge-discussing,badge-deploying}.json` — 9 new icon assets, generated via a scratchpad Node script for row-length/count correctness, hand-designed distinct silhouettes
- `packages/pixel-office/src/index.ts` — `upsertCharacterFromAgent` rewritten to call `resolveStatusVisual`; offline despawns via `characters.delete`
- `packages/pixel-office/src/index.test.ts` — replaced the stale "no-ops for non-IDLE" test (05-01's documented placeholder) with coverage of the new exhaustive behavior (CODING creates TYPE pose, blocked/waiting freeze + distinct bubbles, offline despawns, deploying gets 1.5x speed)
- `packages/pixel-office/src/types.ts` — `BubbleType` union (11 members); `Character.bubbleType` retyped from the narrow 2-member fork original; new `Character.frozen`/`Character.frameSpeedMultiplier` fields
- `packages/pixel-office/src/engine/characters.ts` — `createCharacter` initializes `frozen: false, frameSpeedMultiplier: 1`; `updateCharacter` short-circuits on `frozen` and multiplies `dt` by `frameSpeedMultiplier`
- `references/ASSET-LICENSES.md` — new file, D-05's 4-section audit
- `apps/web/src/App.tsx` — added a fixed-position `<footer>` with the attribution line

## Decisions Made

- **Widened `Character.bubbleType`'s type and added two new `Character` fields not in Task 1's `<files>` list** (`types.ts`, `engine/characters.ts`) — required for `STATUS_MAP`'s output to type-check against the existing `Character` struct and for the plan's own action text ("suppress the idle-loop animation frame advance when frozen", "apply frameSpeedMultiplier") to have somewhere to land. Rule 3 (blocking) — the exhaustive mapping cannot compile or behave as specified without these.
- **Did not create `bubble-permission.json`/`bubble-waiting.json`.** The plan's action text says these are reused from "the fork's existing" bubble sprites, but 05-01 never forked those two JSON assets (dropped per its own documented scope trim — no bubble-sprite JSON exists anywhere in this repo pre-05-02), and no code touched by this plan's `<files>` list renders bubble JSON at all yet (`engine/renderer.ts` still doesn't draw bubbles — deferred past this plan). `STATUS_MAP`'s `bubble: "permission"`/`"waiting"` values are data labels consumed by nothing yet, so there was no asset to fork. Flagging for whichever future plan wires bubble rendering — it will need to author (or fork, if by then available) `bubble-permission.json`/`bubble-waiting.json` too, not just the 9 new ones built here.
- **`references/ASSET-LICENSES.md`'s "Provenance-undocumented, used this phase" section is empty (None)**, not populated with furniture/floor/wall/carpet entries as the plan's literal wording assumes. Verified via `grep -r "furniture\|carpet\|\.png\|assets/" packages/pixel-office/src` that this repo's forked renderer draws every tile as a flat solid-colour fill (`FALLBACK_FLOOR_COLOR`/`WALL_COLOR`) — 05-01 trimmed out the fork's PNG-based floor/furniture pipeline entirely. There is genuinely nothing at that trust boundary to flag this phase; documented honestly with the verification method shown, rather than inventing placeholder entries for assets this repo doesn't load. All such assets remain correctly tracked in §4 "Deferred — not used this phase."
- **Icon glyphs hand-designed for silhouette distinctness, generated via a one-off scratchpad Node script** (not committed to the repo) that validated every grid was exactly 11 columns × 13 rows before writing — chosen to guarantee row/column-count correctness across 9 hand-authored pixel grids rather than risk manual JSON-array transcription errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Character.bubbleType`'s narrow 2-member type didn't cover the new mapping's bubble keys**
- **Found during:** Task 1, writing `status-mapping.ts` against the existing `Character` interface
- **Issue:** `types.ts`'s `bubbleType: "permission" | "waiting" | null` (05-01) can't hold `"blocked"`, `"failed"`, `"completed"`, or any of the 6 new badge keys `STATUS_MAP` needs to assign.
- **Fix:** Added a new exported `BubbleType` union (11 members) in `types.ts` and retyped `Character.bubbleType: BubbleType | null`.
- **Files modified:** `packages/pixel-office/src/types.ts`
- **Verification:** `pnpm --filter pixel-office test` — 21/21 passing, no type errors in the touched files
- **Committed in:** `39fc0b0` (Task 1 commit)

**2. [Rule 3 - Blocking] No field existed to carry `frozen`/`frameSpeedMultiplier` per-character**
- **Found during:** Task 1, implementing the plan's explicit instruction to "suppress the idle-loop animation frame advance when frozen === true, and apply frameSpeedMultiplier ... when present"
- **Issue:** `Character` had no `frozen` or `frameSpeedMultiplier` fields, and `engine/characters.ts`'s `updateCharacter` had no mechanism to honor either.
- **Fix:** Added both fields to `Character` (default `false`/`1` in `createCharacter`); `updateCharacter` now returns early (frame pinned to 0) when `ch.frozen`, and multiplies `dt` by `ch.frameSpeedMultiplier` before the existing per-state frame-timer logic.
- **Files modified:** `packages/pixel-office/src/types.ts`, `packages/pixel-office/src/engine/characters.ts`
- **Verification:** `pnpm --filter pixel-office test` — 21/21 passing, including a new assertion that `deploying` yields `frameSpeedMultiplier === 1.5`
- **Committed in:** `39fc0b0` (Task 1 commit)

**3. [Rule 1 - Bug] `index.test.ts`'s existing "no-ops for non-IDLE" test contradicted the new required behavior**
- **Found during:** Task 1, first `pnpm --filter pixel-office test` run after rewriting `upsertCharacterFromAgent`
- **Issue:** 05-01's test explicitly asserted `AgentStatus.CODING` was a documented no-op with a `console.warn` — this plan's whole point is to remove that stub, so the old assertion now fails (correctly).
- **Fix:** Replaced the stale test with coverage matching the new exhaustive behavior (CODING creates a TYPE-pose character, blocked/waiting freeze with distinct bubbles, offline despawns, deploying gets the 1.5x multiplier).
- **Files modified:** `packages/pixel-office/src/index.test.ts`
- **Verification:** `pnpm --filter pixel-office test` — 21/21 passing
- **Committed in:** `39fc0b0` (Task 1 commit)

**Total deviations:** 3 auto-fixed (all Rule 3/blocking or Rule 1/bug, all necessary for the plan's own stated behavior to compile and pass its required verify commands). No architectural (Rule 4) deviations.
**Impact on plan:** None expanded scope beyond what Task 1/2 already touched — all three were prerequisites the plan's own action text implied but didn't list in `<files>`.

## Known Stubs

- **`bubble-permission.json`/`bubble-waiting.json` do not exist.** `STATUS_MAP`'s `waiting_for_ceo`/`waiting_for_agent` entries carry `bubble: "permission"`/`bubble: "waiting"` as data labels, but no JSON asset backs either key yet, and no rendering code resolves `Character.bubbleType` to pixels at all this plan (`engine/renderer.ts` still doesn't draw bubbles — unchanged from 05-01, its own header comment already flags this as deferred). Not a regression: this plan's scope was the mapping table + 9 net-new glyphs, not bubble rendering. Resolved when a future plan wires bubble-sprite rendering into `engine/renderer.ts` — that plan will need to author (or locate) `bubble-permission.json`/`bubble-waiting.json` too.
- **`spriteData.ts`'s `getCharacterSprites` still returns fully-transparent placeholder frames** (unchanged, carried over from 05-01 — no real MetroCity pixel art is loaded). `references/ASSET-LICENSES.md` §1 documents this pack as CC0-credited while noting the actual pixel data isn't wired in yet.

## Threat Flags

None — this plan added no new trust boundary (pure presentational/documentation artifacts on top of 05-01's already-secured transport), matching the plan's own threat-model register (T-05-06, accepted/low, documentation-only risk).

## Issues Encountered

None blocking. The pre-existing repo-wide TS module-resolution `tsc --noEmit` inconsistency (documented in 05-01-SUMMARY.md, `moduleResolution: NodeNext` flagging relative imports without explicit `.js` extensions in `.test.ts` files) still applies to `packages/pixel-office` — my new `status-mapping.test.ts` follows the same existing convention as `index.test.ts` (no `.js` extension), consistent with the pre-existing pattern, not a regression. `packages/pixel-office` has no `typecheck` script (matching sibling packages); the plan's required verify commands are both `vitest`/`grep`-based and pass cleanly.

## Next Phase Readiness

- 05-03 (real per-agent derivation) can drive `upsertCharacterFromAgent` with real reducer-derived `AgentStatus` values and get the full 15-value visual fidelity immediately — no further mapping-table work needed.
- 05-04 (handoff choreography) is unaffected by this plan's changes; `findPath`/`walkCharacterTo` remain as 05-01 left them.
- **Known gap for a future plan:** bubble-icon *rendering* (drawing `Character.bubbleType`'s glyph above the character on canvas) is still unimplemented — `engine/renderer.ts` needs a new draw pass reading the sprite JSON assets (the 9 built here, plus `bubble-permission.json`/`bubble-waiting.json` which still need authoring) before OFFICE-03's "visually distinct at a glance" claim is actually demonstrable in a running browser, not just data-correct in unit tests.

## Self-Check: PASSED

All claimed created/modified files verified present on disk; commits `39fc0b0` and `ee993c2` verified present in `git log`.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*
