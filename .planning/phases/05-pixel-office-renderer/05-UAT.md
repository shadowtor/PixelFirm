---
status: diagnosed
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-22T12:20:26Z
updated: 2026-09-22T12:58:49Z
---

## Current Test

[testing complete]

## Tests

### 1. Stream-scale readability (G-05-1a/1b/1c re-check)
expected: At OBS capture size, glyphs readable and head-anchored; handoff label is a compact tailed bubble (short "<title> → <name>" text).
result: issue
reported: "This is much closer and the previous visual issues look largely resolved. Before I accept the visual pass, please do one final polish pass: 1. Make speech bubbles dynamically choose a safe position so they never overlap the viewport edge or obscure desks unnecessarily. 2. Give handoff participants fixed interaction offsets so 2-3 agents don't visually stack on top of each other. 3. Keep a clear visual distinction between an agent working at their desk and an agent standing/interacting nearby. 4. Keep the 12-character task truncation, but ensure the full task/title can be surfaced elsewhere later via hover/click/dashboard or an expanded interaction. 5. Review the waiting-for-agent glyph once more. Its silhouette should be immediately identifiable at native scale, not just through colour. 6. Confirm the renderer outputs only the intended office canvas with no black/unused area around it."
severity: minor
note: Geometry auto-verified (live harness TRUTH 0/4/5 PASS: scale 3, glyph 1.33 px above head, bubble 73 world px). Readability is a judgment call.

### 2. Grayscale / colour-deficiency legibility (G-05-2 re-check)
expected: Under grayscale and deuteranopia/protanopia filters, the '?' (waiting_for_ceo) and hourglass (waiting_for_agent) glyphs remain distinct by shape with a closed dark outline.
result: pass
source: automated
evidence: "Glyph sprites rendered at scale 3 on the MetroCity floor under grayscale and Machado deuteranopia/protanopia matrices (shots/cvd.png). '?', hourglass, blocked, task icon all distinct by silhouette with closed black outline in every view."

### 3. Handoff placement on rows 4 and 8 (G-05-1d / G-05-4 re-check)
expected: Trigger a handoff with the receiver at a left-hand seat on row 4, then on row 8. The sender stands beside (not on) the receiver, both fully visible, and the bubble spans the pair under their feet, never starting at x=0 or covering other agents' glyphs.
result: pass
source: automated
evidence: "Playwright-driven engine page: receiver at (1,4) with '?' neighbour, and receiver at (1,8) with blocked neighbour (3,8) + 8 agents on row 4, sender walking from (7,4). Sender stops at (2,x) beside the receiver, both visible; requested and accepted bubbles hang under the pair at floor-interior left edge (not x=0) and cover no glyph (shots/row-a-*.png, row-b-*.png). Live harness TRUTH 5 PASS for (4,4)->(5,4)."

### 4. Furnished office reads as an office (G-05-1e re-check)
expected: MetroCity plank floor, wall, 8 desk pods with monitors, bookcase/cabinet/plants/paintings; seated agents sit at desks with lower bodies hidden by the desk; no bare grey floor.
result: pass
source: automated
evidence: "Live frames empty.png/cohort.png: plank floor, wall, 8 desks with 2 monitors each, bookcase, cabinet, 2 plants, 2 paintings; seated agents show head/shoulders over the desk. Harness TRUTH 6: 0 bare-floor px; TRUTH 7: 59.4 fps with 9 agents."

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-05-P1
  truth: "Handoff speech bubble picks a safe position: never crosses the canvas edge and avoids covering desks when a clear spot exists"
  status: failed
  reason: "User reported (UAT test 1 polish item 1)"
  severity: minor
  test: 1
  root_cause: "resolveDialogueBox (renderer.ts:201) has one candidate position: always under the speaker foot line, centred on the pair midpoint, clamped only into the floor interior [TILE_SIZE, (COLS-1)*TILE_SIZE]. It never considers other placements, so the bubble sits on the receiver desk/monitors every time (seen in row-a/row-b shots), and the clamp is floor-bound rather than an explicit canvas-edge check."
  artifacts:
    - path: "packages/pixel-office/src/engine/renderer.ts"
      issue: "resolveDialogueBox: single fixed candidate, no desk/glyph/edge scoring"
  missing:
    - "Ordered candidate placements (e.g. under feet, above the head band clear of glyphs, left/right of the pair) scored against FURNITURE desk rects, glyph rects of every character, and the canvas bounds; pick the first fully in-bounds candidate that covers no desk, else the one with least desk overlap"
    - "Tail still points at the speaker"
    - "Tests: never out of canvas bounds for every seat/standing receiver; no desk overlap where a clear candidate exists; never over a glyph"
  debug_session: "inline diagnosis in verify-work (polish items, no runtime fault)"
- gap_id: G-05-P2
  truth: "Handoff participants use fixed interaction offsets so 2-3 agents (sender, receiver, neighbour) never visually stack"
  status: failed
  reason: "User reported (UAT test 1 polish item 2)"
  severity: minor
  test: 1
  root_cause: "interactionTileFor (handoff-choreography.ts:74) searches the receiver seat row outward d=1,2..: the first free tile is the even column directly between two odd-column seats, so sender, receiver and the neighbouring seated agent end up 16 px apart in a row and their 16 px sprites touch (row-b shot: receiver (1,8), sender (2,8), blocked neighbour (3,8))."
  artifacts:
    - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
      issue: "interactionTileFor: search-order on the seat row, no fixed slot, no neighbour spacing"
  missing:
    - "Fixed interaction slots per receiver seat (defined in layout data, e.g. the aisle tile in front/diagonal to the seat) chosen in a fixed preference order, so a sender never lands shoulder-to-shoulder between two seats"
    - "Second concurrent sender gets the next fixed slot"
    - "Tests: sender slot is never horizontally adjacent to a third occupied tile; both participants and neighbours keep >= N px clear ink separation"
  debug_session: "inline diagnosis in verify-work (polish items, no runtime fault)"
- gap_id: G-05-P3
  truth: "An agent working at its desk is visually distinct from an agent standing/interacting nearby"
  status: failed
  reason: "User reported (UAT test 1 polish item 3)"
  severity: minor
  test: 1
  root_cause: "renderer.ts:284 only sinks a character into its desk when state === TYPE on its own seat. Frozen/idle statuses (blocked, waiting_*, idle) stand full-body at their seat, which is exactly the pose a handoff sender has standing beside them, so "at desk" and "standing nearby" look the same (row-b: blocked neighbour vs sender)."
  artifacts:
    - path: "packages/pixel-office/src/engine/renderer.ts"
      issue: "sittingOffset applied to TYPE only"
    - path: "packages/pixel-office/src/status/status-mapping.ts"
      issue: "non-working statuses map to standing poses at the seat"
  missing:
    - "Any character resting on its own seat renders seated (desk hides lower body) regardless of status; glyph stays head-anchored to the seated frame"
    - "Only a character off its seat (walking or at an interaction slot) renders full-body standing"
    - "STATUS_MAP pose semantics unchanged except seat rendering; tests that a resting seated agent and an interacting agent differ in visible body rows"
  debug_session: "inline diagnosis in verify-work (polish items, no runtime fault)"
- gap_id: G-05-P4
  truth: "Dialogue keeps the 12-char title truncation, but the full task title stays available to the host for later hover/click/dashboard surfacing"
  status: failed
  reason: "User reported (UAT test 1 polish item 4)"
  severity: minor
  test: 1
  root_cause: "The full title is already kept (registerTaskTitle/getTaskTitle, index.ts:52-57, fed by App.tsx:68/83) and only truncated at template time (dialogue-templates.ts MAX_DIALOGUE_TITLE_CHARS=12). What is missing is a host-facing read path: nothing exposes which task/agents an on-screen bubble belongs to, so a future hover/click/dashboard cannot look up the full title."
  artifacts:
    - path: "packages/pixel-office/src/index.ts"
      issue: "no accessor for active handoffs / bubble ownership"
    - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
      issue: "handoff records private"
  missing:
    - "Read-only export (e.g. getActiveHandoffs(): {taskId, fullTitle, fromAgentId, toAgentId, phase}[]) plus the on-canvas dialogue box rect so a host can hit-test later"
    - "No UI built now (hover/dashboard is later work); keep 12-char truncation"
    - "Test: full untruncated title returned for an active handoff whose bubble shows the truncated one"
  debug_session: "inline diagnosis in verify-work (polish items, no runtime fault)"
- gap_id: G-05-P5
  truth: "waiting_for_agent glyph silhouette is identifiable at native (1x) scale, independent of colour"
  status: failed
  reason: "User reported (UAT test 1 polish item 5)"
  severity: minor
  test: 1
  root_cause: "bubble-waiting.json neck is 5 px wide (3 fill px) for 3 rows and the bulbs are flat-sided (widths 11,11,9,9,7,5,5,5,7,9,9,11,11), so at 1x the silhouette reads as a spool/capital I rather than an hourglass; identification leans on the blue colour."
  artifacts:
    - path: "packages/pixel-office/src/sprites/bubble-waiting.json"
      issue: "neck too wide/long, bulbs not triangular"
  missing:
    - "Redraw as a true hourglass: heavy top/bottom caps, triangular bulbs tapering to a 1-fill-px (3-wide ink) neck, sand in the lower bulb"
    - "Keep 11x13, closed near-black outline, contrast and >= 20-cell shape-separation tests green; add a 1x silhouette test (ink mask differs from the ? and blocked masks and has a single-pixel-fill waist)"
  debug_session: "inline diagnosis in verify-work (polish items, no runtime fault)"
- gap_id: G-05-P6
  truth: "Renderer output is only the office canvas: no black/unused area around it at the OBS source size"
  status: failed
  reason: "User reported (UAT test 1 polish item 6)"
  severity: minor
  test: 1
  root_cause: "App.tsx:22/27 reserves a 24 px DOM footer and floors the scale: at a 1280x720 OBS source (720-24)/176 = 3.95 -> scale 3, so the canvas is 960x528 and 320 px right + ~168 px below are black body background (live shots). 1920x1080 happens to fit exactly (scale 6 + footer); other sizes do not."
  artifacts:
    - path: "apps/web/src/App.tsx"
      issue: "FOOTER_RESERVE_PX subtracted before flooring; black body; canvas pinned top-left"
    - path: "apps/web/index.html"
      issue: "body background #000"
  missing:
    - "Size from the full viewport (1280x720 -> scale 4 = 1280x704) and draw/overlay the attribution in the office bottom border strip so it stays visible (SC4) without reserving DOM height"
    - "Any unavoidable remainder (non-multiple viewport) is centred and filled with the office border colour, never black"
    - "Document the recommended OBS source sizes (exact multiples of 320x176, e.g. 1280x704, 1920x1056); App.test attribution pin kept; live harness TRUTH 0 extended to assert no black pixel in the viewport screenshot at 1280x720 and 1920x1080"
  debug_session: "inline diagnosis in verify-work (polish items, no runtime fault)"
