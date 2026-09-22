---
status: testing
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-22T12:20:26Z
updated: 2026-09-22T12:20:26Z
---

## Current Test

number: 1
name: Stream-scale readability (G-05-1a/1b/1c re-check)
expected: |
  At the OBS capture size, state glyphs are readable, sit directly on their owners' heads (not a row along the wall), and the handoff text reads as a small tailed speech bubble under the pair, not a debug banner.
awaiting: user response

## Tests

### 1. Stream-scale readability (G-05-1a/1b/1c re-check)
expected: At OBS capture size, glyphs readable and head-anchored; handoff label is a compact tailed bubble (short "<title> → <name>" text).
result: [pending]

### 2. Grayscale / colour-deficiency legibility (G-05-2 re-check)
expected: Under grayscale and deuteranopia/protanopia filters, the '?' (waiting_for_ceo) and hourglass (waiting_for_agent) glyphs remain distinct by shape with a closed dark outline.
result: [pending]

### 3. Handoff placement on rows 4 and 8 (G-05-1d / G-05-4 re-check)
expected: Trigger a handoff with the receiver at a left-hand seat on row 4, then on row 8. The sender stands beside (not on) the receiver, both fully visible, and the bubble spans the pair under their feet, never starting at x=0 or covering other agents' glyphs.
result: [pending]

### 4. Furnished office reads as an office (G-05-1e re-check)
expected: MetroCity plank floor, wall, 8 desk pods with monitors, bookcase/cabinet/plants/paintings; seated agents sit at desks with lower bodies hidden by the desk; no bare grey floor.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
