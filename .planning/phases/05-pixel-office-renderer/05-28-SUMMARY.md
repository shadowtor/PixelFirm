---
phase: 05-pixel-office-renderer
plan: 28
subsystem: ui
tags: [pixel-office, handoff, dialogue, canvas, live-proof]
status: complete
gap_closure: true
gap_ids: [G-05-4, G-05-1b]

requires:
  - phase: 05-27
    provides: handoff sender waits on the receiver's seat row, adjacent column (speakers stand only on seat rows)
provides:
  - resolveDialogueBox(speakerCenterX, partnerCenterX, footY, textWidth, zoom, floorLeft, floorRight) -> { x, y, w, h, tailX }
  - Character.bubbleTextPartnerId (requested line -> receiver; accepted line -> null)
  - compact light speech bubble (5 world-px font, 9 px tall, ink border + tail)
  - layout guard test derived from SEATS/STANDING_SPOTS
  - live TRUTH 5 (during/accepted) for the attributed bubble
affects: [05-29 (shorter templates + UI-SPEC amendment; bubble width follows text)]

actuals:
  tokens: 9580
  tasks: 2
  commits: 3
plan_head_before: d99147890e38d2a8452cd44bf24d3e9e0ec8ab55

tech-stack:
  added: []
  patterns:
    - "Layout-free overlay rule + a layout-data guard test that goes red on any layout edit breaking it"

key-files:
  created: []
  modified:
    - packages/pixel-office/src/constants.ts
    - packages/pixel-office/src/types.ts
    - packages/pixel-office/src/handoff/handoff-choreography.ts
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts
    - scripts/verify-pixel-office-live.mjs

key-decisions:
  - "Handoff line is a speech bubble hanging from the speaker's foot line, centred on the speaker/partner midpoint, clamped only to the floor interior (x 16..304 at zoom 1); it never reads the glyph slot"
  - "Bubble colours: fill #dcdcdc, ink (border, tail, text) #161616; both achromatic and absent from every character, glyph and office palette"
  - "renderScene drops its canvasWidth parameter; BUBBLE_ICON_HEIGHT_PX removed (only the old dialogue maths used it)"

requirements-completed: [HANDOFF-01, HANDOFF-02]

coverage:
  - id: D1
    description: "Requested line spans sender to receiver, tail at the sender, under their feet, never at x = 0"
    requirement: HANDOFF-01
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/engine/renderer.test.ts#handoff speech bubble (05-28, G-05-4 / G-05-1b)"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-pixel-office-live.mjs (TRUTH 5 (during))"
        status: pass
  - id: D2
    description: "Speaker bands are clear of every other layout position's sprite and glyph (layout guard + 20-position sweep)"
    requirement: HANDOFF-01
    verification:
      - kind: unit
        ref: "renderer.test.ts#layout guard: every speaker row's bubble band is clear / attributed at every position"
        status: pass
  - id: D3
    description: "Accepted line belongs to the receiver alone"
    requirement: HANDOFF-02
    verification:
      - kind: unit
        ref: "renderer.test.ts#the accepted bubble belongs to the receiver alone"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-pixel-office-live.mjs (TRUTH 5 (accepted))"
        status: pass

duration: 9min
completed: 2026-09-22
---

# Phase 5 Plan 28: Partner-spanning handoff speech bubble Summary

**The handoff line is now a small light speech bubble hanging under the talking pair's feet. It spans the sender to the receiver, its tail sits at the speaker, and it is clamped only to the floor interior. A test built from the layout data proves no other agent or glyph is ever under it (G-05-4 closed; visual half of G-05-1b closed).**

## Performance

- Duration: ~9 min
- Started: 2026-09-22T11:43:25Z
- Completed: 2026-09-22T11:52:19Z
- Tasks: 2 (tracer + auto)
- Files modified: 6

## Accomplishments

- `resolveDialogueBox`: `w = ceil(text) + 2*(pad+1)*zoom`, `h = 9*zoom`, `y = footY + 2*zoom`, x = the pair's midpoint minus half the width, clamped into [floorLeft, floorRight - w], `tailX` = speaker centre. The doc comment states the layout-free contract and names the layout guard as the proof.
- `drawDialogue`: fill, 4 ink border rects, a 1-world-px tail from the foot line to the box, text in `5*zoom px monospace` at (x + 3*zoom, y + 2*zoom). Pass order is unchanged (sprites/furniture, then dialogue, then glyphs).
- `bubbleTextPartnerId` is set with the requested line (`= toAgentId`) and cleared in the same guarded statement at completion and in `retireHandoff`. The accepted line sets it to null.
- Tests: the tracer, the layout guard, the 20-position sweep (every seat and standing spot as receiver, 18 BLOCKED bystanders), the accepted-line test, and `resolveDialogueBox` unit cases at zoom 1 and 3 with a non-zero offsetX. The colour guard also asserts a light fill and dark ink. The `mockCtx.measureText` model is now `0.6 * font px` per code point.
- Live: `TRUTH 5 (during) PASS — requested: 6807 bubble px + 1425 text px at x 17..147.3, y 75..81.7 (foot line 72, centres 72/88)`. `TRUTH 5 (accepted) PASS — x 32.3..143.3, y 75..81.7 (centre 88)`. `LIVE PROOF: PASS`.
- Screenshot (`scratchpad/shots28/handoff.png`, x3): a small light bubble with a dark border sits under the three row-4 agents, and the tail tick is at the sender (col 4). There is no banner, and every state glyph above the heads is clear. The text is still the long 05-13 sentence, truncated with an ellipsis by the caps ("Handing off "live-proof-task…" to live-proof-…"); 05-29 shortens it.

## Layout guard can fail (one-off proof, not committed)

With `[17, 8]` changed to `[17, 7]` in `office-layout.json`, `vitest -t "layout guard"` went red with: `row 4 speaker band {"x":16,"y":74,"w":288,"h":9,"tailX":24} is hit by the idle agent at (17,7): {"color":"#000000","x":277,"y":74,...}`. The file was restored with `git checkout --`.

## Task Commits

1. Task 1 RED: `01221ef` test(05-28): add failing speech-bubble tests
2. Task 1 GREEN: `0764fc8` feat(05-28): handoff line is a tailed speech bubble under the pair
3. Task 2: `2b6ada7` test(05-28): live TRUTH 5 proves the handoff bubble spans the pair

## Replaced tests (Task 1)

- Removed (they encoded the old contract): the 05-13 tracer ("entirely above its sprite"), "stacks a row-8 owner's box directly above its own glyph slot", "clamps a wide box into the canvas horizontally...", and "resolveDialogueBox: centred, stacked above the glyph slot, clamped at y = 0".
- Kept as-is and passing: "draws no text and no dialogue box when bubbleText is null, undefined or empty", both pass-order tests, and the colour guard (now also checking lightness).
- The furnished-office tests passed `320` as renderScene's canvasWidth. That argument was dropped because the parameter is gone.

## TDD Gate Compliance

RED `01221ef`: 8 tests failed (5 new, the colour guard, and 2 furnished-office tests hit by the signature change). GREEN `0764fc8`: 149/149 pixel-office, 19/19 web, and `pnpm --filter web typecheck` clean. No refactor commit.

## Deviations from Plan

- The harness also drops the `BUBBLE_ICON_GAP_PX` read, which nothing used after the glyph-slot maths was removed. The header truth (5) was reworded to match. Both changes are inside the planned file.

Otherwise the plan was executed as written.

## Deferred Issues

- `tsc -p packages/pixel-office` has pre-existing TS2835 (missing `.js` extension) and `status-mapping.test.ts` TS18046 errors. None of them are in the files this plan touched, and they fall outside the plan's typecheck gate (`pnpm --filter web typecheck`).

## Self-Check: PASSED

- The 6 modified files exist, and commits 01221ef, 0764fc8 and 2b6ada7 are present in `git log`.
