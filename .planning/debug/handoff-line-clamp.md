---
status: diagnosed
trigger: "G-05-4: Handoff dialogue line clamped to x=0 on the top wall, far from its speaker, overlapping row-3 status glyphs of other agents (UAT 05 test 4)"
created: 2026-09-22T09:00:00Z
updated: 2026-09-22T09:20:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED. resolveDialogueBox places a sentence-wide box above the glyph slot; row 3 has no headroom so y clamps to 0 over the whole row's glyph band, and the centre-then-clamp x rule pins it to x=0 for any speaker left of ~x=105. Nothing (tail/connector) ties it to sender or receiver.
bug_class: Bohrbug (deterministic geometry)
known_pattern_candidate: none (no knowledge-base.md)
next_action: return ROOT CAUSE FOUND to orchestrator

reasoning_checkpoint:
  hypothesis: "The line overlaps other agents' glyphs and sits at/near x=0 because resolveDialogueBox (renderer.ts:125-138) stacks the box above the reserved glyph slot, which for a row-3 owner is y=9-2-13=-6 -> clamped to 0 (overlapping y 9..12 of every row-3 glyph slot), and sizes it to the full text width (~210-283 px of a 320 canvas) centred on the speaker then clamped into [0, 320-w]."
  confirming_evidence:
    - "Probe: resolveDialogueBox(120, 24, 205.6, 1, 320) = {x:15,y:0,w:210,h:13}; screenshot 2-handoff-2500.png box = native x 15..225, y 0..13 (pixel-exact match)."
    - "Probe sweep: UAT line, speakers at cols 1/3/5 -> x=0, not centred; col 14/18 -> x=110 (right clamp). Max-capped 46-char line (w=283, 88% of canvas) is off-centre for every column."
    - "Screenshot: red blocked glyph (col 2) pixels start at native y=10, inside the box's rows 10..12; glyph pass runs after dialogue (renderer.ts:213)."
    - "Row-6 speaker box y 42..55 sits inside row-3 sprite boxes (24..56) -> overlaps agents on another row."
  falsification_test: "If a row-3 speaker's box were computed with y>=22 (below no glyph) or width <= one tile pitch, the overlap/clamp would not occur; probe shows y=0 and w=210 instead."
  fix_rationale: "Placement and extent of the label are what violate the truth; a fix must change resolveDialogueBox's vertical budget (row headroom) and width/anchor model (compact label + speaker pointer), not the draw order."
  blind_spots: "Exact monospace advance depends on the browser's resolved font (Consolas 6.05 px/char assumed; matches screenshot). Did not test other zoom levels (app always renders zoom 1)."
  candidate_causes:
    - "code: resolveDialogueBox y stacking + x centre-then-clamp (renderer.ts:133-136)"
    - "config/layout: DESK_ROW_START=3 / DESK_ROW_PITCH=3 leave 24 px above a row-3 sprite, box+glyph need 30 (index.ts:312-315)"
    - "data: template + caps allow a 46-code-point sentence (dialogue-templates.ts:211,220-221)"
  and_gate: "yes: other-agent glyph overlap needs BOTH a box wider than one desk pitch (width) AND the y=0 clamp into the glyph band (row-3 headroom). x=0 pinning needs only the width + left-half speaker."

## Symptoms

expected: Handoff line anchored at the sender/receiver, originating at the sender and terminating at the receiver; never clamped to x=0; never overlapping status glyphs or agents on other rows.
actual: "Handing off \"t-sender\" to receiver" box is a wide black banner on the top wall starting near x=0, left of its speaker (col 7); bottom rows overlap the tops of other row-3 agents' glyphs.
errors: none (visual)
reproduction: live harness; agents via task.status_changed; agent.handoff_requested sender(col 5)->receiver (new agent, col 7, desk row 3); screenshot scratchpad/uat05/2-handoff-2500.png (320x176 canvas scaled x6).
started: since 05-13 (dialogue pass); flagged as human item 4 in 05-VERIFICATION.md

## Eliminated

- hypothesis: "Box is anchored to the wrong character / wrong x (e.g. uses canvas origin instead of speaker)"
  evidence: "Screenshot box centre = native x 120 = sender ch.x at col 7 (sender stands on receiver's tile). In this frame the box is centred, not clamped; the 'at x~0' read comes from its 210 px width (left edge x=15). The true x=0 clamp fires for speakers at cols 1-5 (probe)."
  timestamp: 2026-09-22T09:15:00Z
- hypothesis: "Draw order puts dialogue over glyphs"
  evidence: "renderer.ts:205-213 draws glyphs after dialogue; the glyphs paint over the box, which is what the user saw (glyph over box bottom rows), so order is not the cause of the overlap, only of which one wins."
  timestamp: 2026-09-22T09:15:00Z

## Evidence

- timestamp: 2026-09-22T09:05:00Z
  checked: "Pixel scan of 2-handoff-2500.png (1920x1056 = 320x176 x6)"
  found: "#121212 box spans screen x 90..1349, y 0..77 -> native x 15..225, y 0..13 (w 210, h 13). Red blocked glyph at screen y 60..119 (native 10..19)."
  implication: "Box covers native rows 0..12; row-3 glyph slots are y 9..21, so rows 9..12 of each glyph slot inside x 15..225 are overlapped."
- timestamp: 2026-09-22T09:10:00Z
  checked: "renderer.ts:125-138 resolveDialogueBox"
  found: "h=13; w=ceil(textWidth)+4; glyphSlotY=resolveBubbleY(drawY,13,zoom); y=max(0, glyphSlotY-2-h); x=min(max(0, round(cx-w/2)), max(0, canvasWidth-w)). Doc comment (lines 118-123) already states row 3 lands at y 0..12 over the glyph slot and a row-6 owner's box overlaps the desk row in front."
  implication: "Overlap and x clamp are designed-in, not accidental; geometry cannot satisfy G-05-4 on this layout."
- timestamp: 2026-09-22T09:12:00Z
  checked: "Throwaway vitest probe (scratchpad/probe/handoff.probe.test.ts) against real src"
  found: "Rendered dialogue op: rect #121212 15,0 210x13, text @17,1. Sweep for UAT line: col1/3/5 x=0 (not centred), col7 x=15, col10 x=63, col14/18 x=110 (not centred). Max-cap line 46 chars, w=283 (0.88 canvas): off-centre at every column. Row-6 box y 42..55 over row-3 sprites (24..56)."
  implication: "Clamp to x=0 is reached for every speaker in the left ~third of the room; with long titles for nearly every speaker."
- timestamp: 2026-09-22T09:13:00Z
  checked: "index.ts:306-315 desk layout; renderer.ts:102-106 resolveBubbleY"
  found: "Row r sprite top drawY=16r-24; glyph slot [16r-39, 16r-26]. Row 3: drawY 24, glyph 9..21, box wants 9-2-13=-6. Pitch 3 rows = 48 px, but sprite(32)+gap+glyph(13)+gap+box(13) = 62 px."
  implication: "No desk row has room for a box stacked above its glyph without entering the row above (or the wall for row 3)."
- timestamp: 2026-09-22T09:14:00Z
  checked: "drawDialogue renderer.ts:156-172; handoff-choreography.ts:199-205, 166-169"
  found: "Draws only fillRect + fillText; no tail, pointer or connector. Requested line is set on the sender (fromChar.bubbleText) while it stands on the receiver's tile; accepted line on the receiver."
  implication: "Nothing visually originates at the sender or terminates at the receiver; attribution relies solely on horizontal centring, which the clamp breaks."

## Resolution

root_cause: "resolveDialogueBox (packages/pixel-office/src/engine/renderer.ts:132-136) places the handoff line as a full-sentence-wide box stacked above the speaker's reserved glyph slot. On desk row 3 the stack needs y=-6, so it is clamped to y=0 (line 135) where rows 9..12 of every row-3 glyph slot inside its ~210-283 px width sit under it; the x rule (line 136) centres then clamps into [0, 320-w], pinning the box to x=0 for speakers at cols 1-5 (all columns for a max-length line). drawDialogue (lines 156-172) draws no tail/connector, so nothing ties the line to the sender or receiver. Contributing: the desk layout (index.ts:312-315) leaves 24 px of headroom on row 3 and a 48 px pitch that cannot fit sprite+glyph+box (62 px); row-6/9 boxes land on the row in front."
fix:
verification:
files_changed: []
