---
status: diagnosed
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-22T17:25:00Z
updated: 2026-09-22T08:12:28Z
---

## Current Test

[testing complete]

## Tests

### 1. Legibility at stream scale
Open the office at the scale you will stream at (OBS source size) with agents in blocked, waiting_for_ceo and waiting_for_agent, plus a handoff in progress; glance for one second without zooming.
expected: You can tell which agent is stuck and which kind of stuck, and read the handoff line.
result: issue
reported: "Native 320x176 glyphs unreadable; handoff banner too dominant; status icons look detached from agents; sender hidden behind receiver during handoff; bare grey floor with no desks; characters look scattered rather than seated at workstations"
severity: major
automated_evidence: live harness screenshots (scratchpad uat05/: 1-states, 2-handoff-*, 3-gray, 4-deut, 5-prot, 6-gray-deut, 8-native), 2026-09-22

### 2. Grayscale and colourblind view
View the same through a grayscale filter and a deuteranopia/protanopia simulator.
expected: Blocked/waiting still reads from glyph shape and frozen animation.
result: issue
reported: "Waiting-for-CEO orange ? gets muddy in grayscale and some colour-deficiency views; state should read from shape + animation + colour, not colour"
severity: minor
automated_evidence: live harness screenshots (scratchpad uat05/: 1-states, 2-handoff-*, 3-gray, 4-deut, 5-prot, 6-gray-deut, 8-native), 2026-09-22

### 3. MetroCity provenance
Compare a rendered character with the fork's webview-ui/public/assets/characters/char_0.png at commit 3537e140 and the MetroCity art on itch.io.
expected: The figure matches (ASSET-LICENSES.md section 1, link 2).
result: pass
evidence: "User supplied the itch.io downloads (MetroCity, MetroCity_2.0, MetroCity_2.1, Interior; kept at C:/Users/shado/.claude/uploads/726d047b-acda-41ee-b81f-6cf429a387b4/). Pixel template match: MetroCity 2.0 Suit.png frame (0,64) equals the outfit layer of the fork's char_0.png frame 0 at offset (8,0), 110/110 opaque pixels identical. Hair layer is not in the supplied packs (it comes from the base free character pack); user confirmed the art is fine to use even if a newer pack release differs."
note: "Link 2 in references/ASSET-LICENSES.md can be upgraded from credit-only to verified (outfit layer); do this in the gap-closure round."

### 4. Row-3 dialogue attribution
Watch a handoff whose receiver sits on desk row 3 (desks 0-17).
expected: Decide whether a top-wall line clamped to x = 0 with glyphs over its bottom rows is acceptable, or move desks to row 4 (36 desks).
result: issue
reported: "Not acceptable: fix line positioning so it does not start at x=0 or overlap status glyphs/agents on other rows; connection should originate from the sender and terminate at the receiver only"
severity: major
automated_evidence: live harness screenshots (scratchpad uat05/: 1-states, 2-handoff-*, 3-gray, 4-deut, 5-prot, 6-gray-deut, 8-native), 2026-09-22

## Summary

total: 4
passed: 1
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-05-4
  truth: "Handoff dialogue line is attributed to its speaker: anchored at the sender/receiver, never clamped to x=0, never overlapping status glyphs or agents on other rows"
  status: failed
  reason: "User reported (High): Row 3 / handoff line clipping - starts at x=0 and overlaps row-3 glyphs; connection should originate from the sender and terminate at the receiver only"
  severity: major
  test: 4
  root_cause: "resolveDialogueBox sizes the box to the whole sentence and stacks it above the speaker's glyph slot: a row-3 speaker needs y=-6 so it clamps to y=0 over every row-3 glyph (glyph pass paints after dialogue); x is centred then clamped to [0,320-w], pinning it to x=0 for speakers left of ~x=105; drawDialogue draws only a rect+text, no tail/connector; desk rows (start 3, pitch 3) leave 24px headroom vs 62px needed for sprite+glyph+box."
  artifacts:
    - path: "packages/pixel-office/src/engine/renderer.ts:133-136"
      issue: "box width from text, y clamp to 0, x centre-then-clamp"
    - path: "packages/pixel-office/src/engine/renderer.ts:156-172"
      issue: "drawDialogue has no tail/connector to sender or receiver"
    - path: "packages/pixel-office/src/index.ts:312-315"
      issue: "desk rows leave no headroom for a box stacked above the glyph"
  missing:
    - "Anchor a compact tailed bubble to the speaker (beside/below the pair, not above the glyph slot) or draw a sender->receiver connector at sprite level"
    - "Never clamp over other agents' glyphs; test attribution for speakers at cols 1-5 and 14-18"
  debug_session: ".planning/debug/handoff-line-clamp.md"
- gap_id: G-05-1a
  truth: "At native 320x176 the state icons are still distinguishable from each other (small-scale glyph variants or a minimum UI scale)"
  status: failed
  reason: "User reported (High): at native size the status glyphs are effectively unreadable; state icons must still be distinguishable even if text is not"
  severity: major
  test: 1
  root_cause: "The office is always rendered at zoom 1 and nothing upscales it: index.ts:209 calls renderFrame without zoom, App.tsx sizes the canvas to exactly 320x176 with no CSS scale or image-rendering pixelated; each state glyph is a single 11x13 asset whose distinguishing detail is 1-3 px."
  artifacts:
    - path: "packages/pixel-office/src/index.ts:209"
      issue: "renderFrame called without zoom"
    - path: "apps/web/src/App.tsx:97-102"
      issue: "canvas at 1x, no CSS scale / pixelated"
    - path: "packages/pixel-office/src/sprites/bubble-{blocked,permission,waiting}.json"
      issue: "single 11x13 asset, 1-3px distinguishing detail"
  missing:
    - "Minimum integer display scale (CSS size N x 320x176, N>=3 or largest integer fitting the viewport, imageRendering pixelated) or thread zoom into renderFrame"
    - "Do not enlarge glyphs alone (16px desk spacing)"
  debug_session: ".planning/debug/glyph-native-scale.md"
- gap_id: G-05-1b
  truth: "Handoff text is a compact label/speech bubble near the participants, not a wide banner overlapping the office"
  status: failed
  reason: "User reported (High): the Handing off... black banner takes a very large amount of space and reads as a debug banner"
  severity: major
  test: 1
  root_cause: "Box width is measureText of the full sentence (+4px) in an 11px monospace font on the zoom-1 320px canvas (~6px/char), with full-sentence templates whose caps were sized to fill one 320px line: typical line 210px (66% of canvas), capped max 283px (88%), painted as an opaque square #121212 strip with no tail. 05-UI-SPEC locks the 11px size and templates."
  artifacts:
    - path: "packages/pixel-office/src/constants.ts:282-289"
      issue: "11px font, 13px box, opaque fill"
    - path: "packages/pixel-office/src/engine/renderer.ts:133,165-171"
      issue: "width from text, plain strip"
    - path: "packages/pixel-office/src/handoff/dialogue-templates.ts:211-221"
      issue: "full-sentence templates, caps sized to canvas width"
    - path: ".planning/phases/05-pixel-office-renderer/05-UI-SPEC.md:92-98,128-130"
      issue: "locks the size/wording - amend"
  missing:
    - "Short label (e.g. task icon + receiver name / truncated title) in a small tailed bubble near the pair, or text on a higher-res overlay"
    - "Amend UI-SPEC typography and template lines"
  debug_session: ".planning/debug/handoff-banner-size.md"
- gap_id: G-05-1c
  truth: "Status glyphs are visibly anchored to their agent, centred above the sprite, not reading as a detached legend"
  status: failed
  reason: "User reported (Medium): red/orange/blue icons look detached from the characters"
  severity: minor
  test: 1
  root_cause: "resolveBubbleY places the glyph relative to the 16x32 frame top, not the visible head (3 empty rows standing + glyph's empty bottom row = 6px gap vs intended 2px); DESK_ROW_START=3 puts first-row glyphs at y 9..21 straddling the top wall edge (y 0..15); all stuck statuses use standing IDLE whose head is 9px above seated neighbours, and glyphs have no tail/backing, so they read as a separate strip/legend."
  artifacts:
    - path: "packages/pixel-office/src/engine/renderer.ts:102-106,189-193"
      issue: "glyph anchored to frame top, not head"
    - path: "packages/pixel-office/src/index.ts:67-76"
      issue: "desk rows put first-row glyphs across the wall edge"
    - path: "packages/pixel-office/src/status/status-mapping.ts:43-50"
      issue: "stuck statuses all stand (IDLE)"
    - path: "packages/pixel-office/src/constants.ts:24-32"
      issue: "BUBBLE_ICON_GAP_PX / CHARACTER_SITTING_OFFSET_PX"
  missing:
    - "Anchor the glyph to the visible head top per pose with a 1-2px gap"
    - "Keep glyphs off the wall edge (re-check once G-05-1e seats land)"
    - "Optional 1-2px tail"
  debug_session: ".planning/debug/glyph-anchoring.md"
- gap_id: G-05-1d
  truth: "During a handoff the sender stops at a defined interaction position (e.g. one tile beside/in front of the receiver) and stays visible"
  status: failed
  reason: "User reported (Medium): sender appears hidden behind the receiver - looks like sprite collision"
  severity: minor
  test: 1
  root_cause: "handoff-choreography walks the sender to the receiver's own seat tile; NO_BLOCKED_TILES is empty so findPath accepts the occupied tile; the sender snaps to the same (x,y) as the receiver, the zY tie resolves by insertion order so the receiver covers the sender (only legs show), and both glyphs centre on the same x and stack."
  artifacts:
    - path: "packages/pixel-office/src/handoff/handoff-choreography.ts:124"
      issue: "walk target is the receiver's occupied seat"
    - path: "packages/pixel-office/src/handoff/handoff-choreography.ts:38-40"
      issue: "NO_BLOCKED_TILES empty"
    - path: "packages/pixel-office/src/engine/renderer.ts:195,203"
      issue: "zY tie broken by insertion order"
  missing:
    - "Defined interaction tile: free neighbour of the receiver (front row first), with other seats passed as blocked tiles to findPath"
    - "Re-check checkHandoffArrivals / retireHandoff arrival and walk-home logic"
  debug_session: ".planning/debug/handoff-sender-overlap.md"
- gap_id: G-05-1e
  truth: "The office renders basic desks/workstations, floor tiles/walls and walking lanes; idle agents snap to desk/chair positions with clear paths between"
  status: failed
  reason: "User reported (Medium + Low): bare grey floor reads as a debug canvas; characters feel scattered rather than occupying workstations"
  severity: major
  test: 1
  root_cause: "Plan 05-01 intentionally trimmed the fork's office-layout system (layoutSerializer, furnitureCatalog, seatPlacement, floorTiles/wallTiles pipelines, renderer furniture pass) with human approval ('re-add once a later plan needs it'); no later plan re-added it, so renderTileGrid only paints WALL_COLOR/FALLBACK_FLOOR_COLOR. Desks are bare coordinates packed 18 per row from (1,3) chosen for glyph headroom, with no blocked tiles or aisles; TYPE applies the 6px chair offset with no chair drawn. Not a user scope decision: no success criterion mentioned furniture, UI-SPEC pinned #808080, and the D-05 licence audit deferred the fork's furniture/floor packs."
  artifacts:
    - path: "packages/pixel-office/src/engine/renderer.ts:56-72,175-205"
      issue: "solid-colour tile grid; no furniture pass in renderScene"
    - path: "packages/pixel-office/src/index.ts:25-39,73-76,117-144"
      issue: "plain bordered tilemap; unfurnished packed desk grid"
    - path: "packages/pixel-office/src/types.ts:5-14"
      issue: "layout/seat types trimmed"
    - path: "packages/pixel-office/src/handoff/handoff-choreography.ts:38-40"
      issue: "no blocked tiles"
    - path: ".planning/phases/05-pixel-office-renderer/05-UI-SPEC.md:106"
      issue: "pins #808080 floor"
    - path: "references/ASSET-LICENSES.md"
      issue: "sections 3-4: new assets need audit + JIK-A-4 credit"
  missing:
    - "Small fixed layout: layout JSON + getBlockedTiles/layoutToSeats ported from the fork's layoutSerializer + a zY-sorted furniture pass"
    - "Build-time decode of MetroCity Interior floors/walls/furniture into SpriteData (reuse decode-metrocity-sprites.mjs approach); fork DESK/PC/CHAIR only after section 4 audit"
    - "Chair-derived seats in clustered pods with aisles; sitting offset only on chair tiles"
    - "Real blocked tiles for findPath; add a furniture/layout truth to the phase success criteria"
  debug_session: ".planning/debug/office-bare-floor.md"
- gap_id: G-05-2
  truth: "Waiting-for-CEO glyph stays high-contrast in grayscale and colour-deficiency views (strong outline/background or more distinctive silhouette); every state reads from shape + animation, not colour"
  status: failed
  reason: "User reported (Medium, Low/Medium): orange ? gets muddy in grayscale and some CVD views; lean on shape + animation over colour"
  severity: minor
  test: 2
  root_cause: "bubble-permission.json is a bare amber '?' whose only outline #8a5a00 (gray 94) sits between wall (60) and floor (128): 1.50:1 vs floor, 1.83:1 vs wall; the stem base and dot are mostly outline colour, so in grayscale/CVD views they vanish (25/49 pixels weak). Waiting hourglass has a secondary weakness (1px blue body 1.27:1 vs floor). bubbleSprites.test.ts checks shape distinctness only, not contrast."
  artifacts:
    - path: "packages/pixel-office/src/sprites/bubble-permission.json"
      issue: "mid-tone outline, no backing"
    - path: "packages/pixel-office/src/sprites/bubble-waiting.json"
      issue: "low-contrast body"
    - path: "packages/pixel-office/src/sprites/bubbleSprites.test.ts:61-81"
      issue: "no contrast assertion"
  missing:
    - "Re-author '?' within 11x13 with a near-black continuous 1px outline, stem/dot in fill colour (optional light plate not matching the discussing badge); same treatment for the hourglass"
    - "Add a test: every glyph's outline/plate >=3:1 contrast vs floor and wall; no colour-only state signal"
  debug_session: ".planning/debug/ceo-glyph-contrast.md"

## Deferred Follow-Ups

- test: 3
  idea: "Add a MetroCity credit (JIK-A-4) on a future landing / about-the-stream page. The itch page says credits are not required but appreciated."
  deferred_at: 2026-09-22
- test: 3
  idea: "The supplied packs (Interior furniture sheets, MetroCity 2.0 hair/suits, 2.1 buildings, vehicles) are available for later scenes and animations. The Interior sheets are a candidate source for the desks and floor tiles in G-05-1e."
  deferred_at: 2026-09-22
