---
status: diagnosed
trigger: "G-05-1d: During a handoff the sender walks onto the receiver's exact tile and is drawn hidden behind the receiver; hourglass stacked on the handoff-task icon (UAT 05 test 1)"
created: 2026-09-22T09:00:00Z
updated: 2026-09-22T09:20:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED. The walk target is the receiver's own seat tile; nothing marks occupied tiles; both characters end at identical (x,y), tie on zY, and Map insertion order draws the (newer) receiver over the sender.
bug_class: Bohrbug (deterministic)
known_pattern_candidate: none (no knowledge-base.md)
next_action: return ROOT CAUSE FOUND to orchestrator

reasoning_checkpoint:
  hypothesis: "handoff-choreography.ts:124 calls walkCharacterTo(fromChar, toChar.seatCol, toChar.seatRow, ..., NO_BLOCKED_TILES), so the sender's path ends ON the receiver's tile; characters.ts:118-121 snaps it to that tile centre, giving identical ch.x/ch.y. renderer.ts:195 zY = ch.y + 8.5 ties, the stable sort (renderer.ts:203) keeps characters-Map insertion order (index.ts:408), and the receiver (seated later) is drawn over the sender."
  confirming_evidence:
    - "Probe: sender seat (5,3), receiver seat (7,3); sender path [(6,3),(7,3)]; after walk sender tile (7,3) xy (120,56) state type; receiver tile (7,3) xy (120,56) state idle."
    - "Probe render: only 48 of the sender's 221 sender-only-colour pixels survive (22%), at y 38..58 = legs/flanks, matching the screenshot (legs under receiver)."
    - "Probe: sender glyph y=15 (TYPE sitting offset +6 -> drawY 30), receiver glyph y=9, both at x=115 -> 13 px glyphs 6 px apart = the stacked hourglass-over-task-icon in the screenshot; receiver drawn later so its hourglass wins."
  falsification_test: "If the walk target were a free adjacent tile, sender and receiver x would differ by >= 16 px and the sender-only pixel count would equal the solo count (221)."
  fix_rationale: "The defect is the choice of destination tile, not draw order; picking a defined interaction tile (free neighbour of the receiver) removes both the sprite and glyph overlap. Draw-order tweaks would only swap which one is hidden."
  blind_spots: "Did not check behaviour when all four neighbours of the receiver are occupied or walls (row 9 edge, dense rows); the path from col 5 also passes THROUGH the col-6 agent's tile (transient collision), same missing-occupancy cause."
  candidate_causes:
    - "code: walk target = receiver seat (handoff-choreography.ts:124)"
    - "config/data: NO_BLOCKED_TILES empty set - no occupancy/blocked tiles fed to findPath (handoff-choreography.ts:38-40; tileMap.ts:54-58 accepts any walkable end)"
    - "code: z-sort tie on identical ch.y resolved by Map insertion order (renderer.ts:195,203; index.ts:408)"
  and_gate: "no for the overlap itself (same-tile target alone guarantees it); yes for WHICH sprite is hidden: tie on zY + receiver inserted after sender. Both orders are a collision."

## Symptoms

expected: Sender stops at a defined interaction position (e.g. one tile beside/in front of the receiver) and stays visible.
actual: Sender stands on the receiver's tile; only its legs show under the receiver; receiver's hourglass glyph stacked over the sender's handoff-task icon.
errors: none (visual)
reproduction: live harness; sender at desk col 5 row 3 (CODING, TYPE pose), receiver new agent at col 7 row 3 (waiting glyph); agent.handoff_requested; scratchpad/uat05/2-handoff-600.png / 2-handoff-2500.png
started: since 05-04 (handoff choreography)

## Eliminated

- hypothesis: "Sender is drawn at a wrong offset / renderer mispositions a walking character"
  evidence: "Probe: sender ch.x/ch.y = (120,56) exactly equal to receiver's; the renderer draws what the model says."
  timestamp: 2026-09-22T09:15:00Z

## Evidence

- timestamp: 2026-09-22T09:05:00Z
  checked: "Screenshots 1-states.png vs 2-handoff-600/2500.png vs 7-accepted.png"
  found: "Before: brown-haired sender at col 5 (sitting). During: col 5 empty, olive receiver at col 7 with dark legs below it and two glyphs stacked at x~115 native. After: sender walking back at col 5, receiver sitting."
  implication: "Sender's destination is the receiver's tile."
- timestamp: 2026-09-22T09:08:00Z
  checked: "handoff-choreography.ts:38-40,124; characters.ts:117-121,171-190; tileMap.ts:39-106"
  found: "walkCharacterTo(fromChar, toChar.seatCol, toChar.seatRow, getTileMap(), NO_BLOCKED_TILES). NO_BLOCKED_TILES is an empty Set; findPath only rejects WALL/VOID/blocked end tiles, so an occupied seat is a valid end. On path completion the walker snaps to the tile centre."
  implication: "Sender and receiver share one tile centre by construction."
- timestamp: 2026-09-22T09:10:00Z
  checked: "renderer.ts:183-213; index.ts:404-408"
  found: "zY = ch.y + TILE_SIZE/2 + 0.5 (sitting offset not included). Equal ch.y -> tie -> Array.sort stable -> characters Map insertion order. Glyph x centred on owner (renderer.ts:151), glyph y from drawY (sitting offset +6 for TYPE)."
  implication: "Receiver (inserted after sender) paints over sender; the two glyphs land 6 px apart at the same x."
- timestamp: 2026-09-22T09:12:00Z
  checked: "Throwaway vitest probe (scratchpad/probe/handoff.probe.test.ts) replaying UAT cohort through stepOffice + renderScene"
  found: "sender path [(6,3),(7,3)]; final sender (7,3) (120,56) TYPE, handoff-task; receiver (7,3) (120,56) IDLE, waiting. Sender-only-colour px visible 48/221 (y 38..58). Glyph Y sender 15, receiver 9, both x 115."
  implication: "Reproduces the screenshot deterministically."

## Resolution

root_cause: "handoff-choreography.ts:124 sends the sender to the receiver's own seat tile (toChar.seatCol, toChar.seatRow) with an empty blocked-tile set (NO_BLOCKED_TILES, line 40), so findPath (tileMap.ts:54-58) accepts the occupied tile and characters.ts:118-121 snaps the sender onto the receiver's exact tile centre. There is no 'interaction position' concept. In the renderer both get the same zY (renderer.ts:195), the stable sort (renderer.ts:203) falls back to characters-Map insertion order (index.ts:408), so the receiver (seated later) covers the sender, leaving only the sender's legs (its TYPE sitting offset +6 px) visible; both glyphs are centred on the same x (renderer.ts:151) 6 px apart, so the receiver's hourglass stacks over the sender's handoff-task icon. The same empty occupancy set lets the path pass straight through the col-6 agent."
fix:
verification:
files_changed: []
