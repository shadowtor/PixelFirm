---
status: testing
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-22T17:25:00Z
updated: 2026-09-22T17:25:00Z
---

## Current Test

number: 1
name: Legibility at stream scale
expected: |
  You can tell which agent is stuck and which kind of stuck, and read the handoff line.
awaiting: user response

## Tests

### 1. Legibility at stream scale
Open the office at the scale you will stream at (OBS source size) with agents in blocked, waiting_for_ceo and waiting_for_agent, plus a handoff in progress; glance for one second without zooming.
expected: You can tell which agent is stuck and which kind of stuck, and read the handoff line.
result: [pending]

### 2. Grayscale and colourblind view
View the same through a grayscale filter and a deuteranopia/protanopia simulator.
expected: Blocked/waiting still reads from glyph shape and frozen animation.
result: [pending]

### 3. MetroCity provenance
Compare a rendered character with the fork's webview-ui/public/assets/characters/char_0.png at commit 3537e140 and the MetroCity art on itch.io.
expected: The figure matches (ASSET-LICENSES.md section 1, link 2).
result: [pending]

### 4. Row-3 dialogue attribution
Watch a handoff whose receiver sits on desk row 3 (desks 0-17).
expected: Decide whether a top-wall line clamped to x = 0 with glyphs over its bottom rows is acceptable, or move desks to row 4 (36 desks).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
