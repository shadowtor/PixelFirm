---
status: complete
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-22T17:25:00Z
updated: 2026-09-22T07:59:26Z
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
  artifacts: []
  missing: []
- gap_id: G-05-1a
  truth: "At native 320x176 the state icons are still distinguishable from each other (small-scale glyph variants or a minimum UI scale)"
  status: failed
  reason: "User reported (High): at native size the status glyphs are effectively unreadable; state icons must still be distinguishable even if text is not"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-05-1b
  truth: "Handoff text is a compact label/speech bubble near the participants, not a wide banner overlapping the office"
  status: failed
  reason: "User reported (High): the Handing off... black banner takes a very large amount of space and reads as a debug banner"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-05-1c
  truth: "Status glyphs are visibly anchored to their agent, centred above the sprite, not reading as a detached legend"
  status: failed
  reason: "User reported (Medium): red/orange/blue icons look detached from the characters"
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-05-1d
  truth: "During a handoff the sender stops at a defined interaction position (e.g. one tile beside/in front of the receiver) and stays visible"
  status: failed
  reason: "User reported (Medium): sender appears hidden behind the receiver - looks like sprite collision"
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-05-1e
  truth: "The office renders basic desks/workstations, floor tiles/walls and walking lanes; idle agents snap to desk/chair positions with clear paths between"
  status: failed
  reason: "User reported (Medium + Low): bare grey floor reads as a debug canvas; characters feel scattered rather than occupying workstations"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-05-2
  truth: "Waiting-for-CEO glyph stays high-contrast in grayscale and colour-deficiency views (strong outline/background or more distinctive silhouette); every state reads from shape + animation, not colour"
  status: failed
  reason: "User reported (Medium, Low/Medium): orange ? gets muddy in grayscale and some CVD views; lean on shape + animation over colour"
  severity: minor
  test: 2
  artifacts: []
  missing: []

## Deferred Follow-Ups

- test: 3
  idea: "Add a MetroCity credit (JIK-A-4) on a future landing / about-the-stream page. The itch page says credits are not required but appreciated."
  deferred_at: 2026-09-22
- test: 3
  idea: "The supplied packs (Interior furniture sheets, MetroCity 2.0 hair/suits, 2.1 buildings, vehicles) are available for later scenes and animations. The Interior sheets are a candidate source for the desks and floor tiles in G-05-1e."
  deferred_at: 2026-09-22
