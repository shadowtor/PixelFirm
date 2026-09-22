---
status: diagnosed
trigger: "G-05-1c: Status glyphs are visibly anchored to their agent, centred above the sprite, not reading as a detached legend. User: red/orange/blue icons look detached from the characters."
created: 2026-09-22T08:01:41Z
updated: 2026-09-22T08:08:08Z
goal: find_root_cause_only
bug_class: Bohrbug (deterministic geometry)
---

## Current Focus

hypothesis: CONFIRMED (AND-gate set). The glyph is anchored to the 16x32 sprite FRAME top, not the visible head. The first desk row is chosen so the glyph lands across the top-wall edge. Stuck agents all stand, so their glyphs line up in an evenly spaced strip on the wall, with nothing (no tail or plate) linking each icon to its body.
test: done. Measured opaque rows of character-metrocity.json, rendered through the real renderScene with a recording ctx, and matched against 1-states.png and 8-native.png pixel coordinates.
expecting: n/a
next_action: none (find_root_cause_only). Hand back to the caller.
reasoning_checkpoint:
  hypothesis: "Glyphs read as detached because (a) resolveBubbleY anchors to drawY (frame top), leaving 5-6 px of air above the head instead of the nominal 2, (b) DESK_ROW_START=3 puts the glyph at y 9..21, across the wall/floor edge at y 16, and (c) stuck agents stand in IDLE (head 9 px higher than seated TYPE neighbours), so glyphs form a uniform strip on the wall."
  confirming_evidence:
    - "IDLE frame (down[1]) opaque rows 3..30. Rows 0-2 are transparent headroom. The blocked/waiting glyphs' row 12 is transparent."
    - "Real renderScene, row-3 IDLE agent: glyph ink y 9..20, head ink starts y 27, so the air gap is 6 px (5 for permission). Nominal BUBBLE_ICON_GAP_PX is 2."
    - "1-states.png at 6x: glyphs at y 54..126 (9..21 native), wall/floor edge at y 96 (16 native), heads at y 162 (27). The wall edge cuts through each glyph and sits between glyph and head."
    - "TYPE body ink y 36..61 vs IDLE 27..54: the stuck (standing) heads are 9 px higher than seated neighbours, and their glyphs share one y band."
  falsification_test: "If the clamp or the owner-bound fallback were responsible, resolveBubbleY would return the fallback for row 3. It returns preferred = 9 (>= 0), so the clamp is not involved. If the anchor used head ink, the gap would be 2 px. It is 6."
  fix_rationale: "Anchor to the opaque head top (per frame or per pose) with a small gap. Keep glyphs off the wall edge, either by moving desk rows down one tile or by letting the glyph overlap the hair slightly. Optionally add a 1-2 px tail or plate so the icon reads as the agent's bubble."
  blind_spots: "Perception is subjective. The user has not seen a variant with a 1-2 px gap. G-05-1e (desks/chairs) will change where heads sit and may shift this."
  candidate_causes:
    - "code: resolveBubbleY anchors to the drawY frame box, not the opaque head (renderer.ts:102-106)"
    - "data: 3 transparent headroom rows in the IDLE frame, and a transparent bottom row in the blocked/waiting glyphs"
    - "config/layout: DESK_ROW_START=3 was chosen as the lowest row whose glyph clears y=0, which puts it on the wall edge (index.ts:67-76)"
    - "design: bare icons with no tail or plate (05-07-SUMMARY: 'bubble tail/frame chrome' deliberately out of scope). Every stuck status uses the standing IDLE pose while working agents are seated."
  and_gate: "yes. The 'detached legend' look needs the enlarged air gap AND the wall-edge straddle AND same-y alignment across stuck agents. Any one alone reads much milder."

## Symptoms

expected: Each status glyph sits visibly attached to its agent, centred just above the sprite's head.
actual: Glyphs sit in a row near the top wall, well above the sprites. Blocked/waiting agents stand in IDLE pose, higher than seated TYPE agents. The icons read as a detached legend.
errors: none (visual)
reproduction: live harness screenshots uat05/1-states.png (1920 wide) and 8-native.png
started: UAT 2026-09-22

## Eliminated

- hypothesis: "The CR-02 owner-bound fallback / clamp in resolveBubbleY is firing and displacing the glyph"
  evidence: "For desk row 3 IDLE, drawY = 16*3+8-32 = 24. preferred = 24 - 13 - 2 = 9 >= 0, so the preferred branch is returned (verified: resolveBubbleY(24,13,1) = 9). Rows 6 and 9 are also >= 0. The fallback only fires on rows 1-2 (handoff walks), not in the reported screenshots."
  timestamp: 2026-09-22T08:07:00Z
- hypothesis: "The glyph is horizontally mis-centred"
  evidence: "Recording-ctx render: body ink x 49..62 (centre 55.5), blocked glyph ink x 51..61 (centre 56). In 1-states.png every glyph is centred over its own owner's column. Horizontal placement is correct."
  timestamp: 2026-09-22T08:07:00Z

## Evidence

- timestamp: 2026-09-22T08:03:30Z
  checked: packages/pixel-office/src/engine/renderer.ts:102-106, 151-153, 189-193; constants.ts:24-32
  found: "drawY = offsetY + (ch.y + sittingOffset)*zoom - spriteHeight*zoom, i.e. the TOP of the 16x32 frame. resolveBubbleY = drawY - 13*zoom - BUBBLE_ICON_GAP_PX(2)*zoom. The anchor is the frame box, not the opaque pixels."
  implication: "Any transparent headroom in the frame, plus transparent rows at the bottom of the glyph, adds to the visible gap."
- timestamp: 2026-09-22T08:04:00Z
  checked: sprites/character-metrocity.json opaque bounds
  found: "down[1] (IDLE pose via getCharacterSprite -> walk[DOWN][1]) opaque rows 3..30. down[3]/down[4] (TYPE) opaque rows 6..31. bubble-blocked and bubble-waiting row 12 are empty. bubble-permission row 0 is empty and row 12 is inked."
  implication: "Effective air above an IDLE head = 2 (gap) + 3 (frame headroom) + 1 (glyph empty bottom row) = 6 px for blocked/waiting and 5 px for permission. That is about half the glyph's 12 px ink height, and 3x the nominal constant."
- timestamp: 2026-09-22T08:05:00Z
  checked: packages/pixel-office/src/index.ts:67-76 (05-10 desk geometry)
  found: "'A character on interior row r draws at y = 16r - 24 and its glyph occupies [16r - 39, 16r - 26]. First interior row whose glyph clears y = 0: 16r - 39 >= 0 needs r >= 3.' DESK_ROW_START = 3, DESK_ROW_PITCH = 3."
  implication: "The first desk row is by construction the lowest row whose glyph fits on the canvas. So every row-3 glyph lands at y 9..21, while the top wall occupies y 0..15. About 7 of the 12 ink rows sit on the dark wall, and the wall/floor edge runs between glyph and body."
- timestamp: 2026-09-22T08:06:00Z
  checked: "1-states.png (6x) and 8-native.png (1x, 8x nearest crop in scratchpad native-crop-8x.png)"
  found: "Three glyphs at native y 9..21 in one evenly spaced strip (16 px pitch) crossing the wall edge at y 16. Heads of the stuck agents start at y 27. Heads of seated TYPE agents in the same row start at y 36. There is no tail or plate on any glyph."
  implication: "Visually: icons mounted on the wall like a key/legend, above a ragged line of heads. This matches the user's report."
- timestamp: 2026-09-22T08:07:00Z
  checked: "Experiment scratchpad exp/geom.test.ts: real renderScene, row-3 agent at col 3, recording ctx, zoom 1 and 3"
  found: "zoom 1: IDLE body ink y 27..54. Glyph ink y 9..20 (blocked), 10..21 (permission), 10..20 (waiting). Air gap 6/5/6 px. TYPE body ink y 36..61. zoom 3: every value x3 (gap 18/15/18)."
  implication: "Confirms the arithmetic directly on the production code path. The gap is a property of the anchor, not of zoom."
- timestamp: 2026-09-22T08:07:30Z
  checked: status/status-mapping.ts:43-50, engine/renderer.ts:189-190, 05-07-SUMMARY.md:198
  found: "WAITING_FOR_CEO, WAITING_FOR_AGENT and BLOCKED all map to pose IDLE (standing, frozen). CHARACTER_SITTING_OFFSET_PX (6) applies only to TYPE, and the TYPE frame's head starts 3 rows lower, so a seated head is 9 px lower than a standing one. 05-07-SUMMARY: 'any bubble tail/frame chrome' deliberately out of scope."
  implication: "Standing stuck agents plus bare icons give no visual tether. The row of glyphs detaches from the row of (mixed-height) heads."

## Resolution

root_cause: "Several conditions combine (AND-gate). (1) resolveBubbleY (packages/pixel-office/src/engine/renderer.ts:102-106) anchors the glyph to the sprite FRAME top (drawY), not the opaque head. The IDLE frame has 3 transparent rows above the hair and the blocked/waiting glyphs have a transparent bottom row, so the visible air gap is 6 px (5 for permission), not the nominal BUBBLE_ICON_GAP_PX = 2, about half the glyph's height. (2) DESK_ROW_START = 3 (index.ts:72-73) was derived as the lowest row whose glyph clears y = 0, so every first-row glyph lands at y 9..21, across the top wall edge (wall y 0..15). The wall/floor boundary cuts between icon and head, and the icons read as mounted on the wall. (3) All stuck statuses stand (IDLE, status-mapping.ts:43-50) while working agents sit 9 px lower, and glyphs are bare icons with no tail or plate. Stuck agents' glyphs therefore form one evenly spaced horizontal strip, which reads as a legend. The CR-02 clamp is NOT involved (it returns the preferred value for rows 3/6/9)."
fix: ""
verification: ""
files_changed: []
suggested_fix_direction: "Anchor the glyph to the opaque head top (compute the first opaque row of the current frame, or a per-pose constant: IDLE +3, TYPE +6), keep a 1-2 px visible gap, and trim or ignore the glyph's own empty rows. Move desk rows down one tile (start 4), or accept the glyph overlapping the hair by a pixel, so the glyph sits on the floor, not across the wall edge. Recheck DESK_ROW_PITCH and the capacity comment. Consider a 1-2 px tail/pointer under the glyph. Coordinate with G-05-1e (desks/chairs), which changes head heights."
oracle_type: "derived: visible gap between glyph ink bottom and owner head ink top <= 2 px, and glyph ink entirely on floor tiles"
