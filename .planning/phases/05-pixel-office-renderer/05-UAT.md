---
status: testing
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-23T14:45:00Z
updated: 2026-09-23T14:45:00Z
round: 3
supersedes: "round 2 (2026-09-22, 4 tests: 3 passed, 1 issue) — see git history for 05-UAT.md"
---

## Current Test

number: 1
name: Stream-scale readability at OBS source size
expected: |
  Each stuck agent and the KIND of stuck is identifiable; the hourglass reads as an
  hourglass without relying on its blue; the handoff line is readable, sits clear of
  desks and monitors, and does not read as a debug banner.
awaiting: user response

## Tests

### 1. Stream-scale readability at OBS source size

Open the office at your OBS source size (1280x720 or 1920x1080) with agents in blocked,
waiting_for_ceo and waiting_for_agent, plus a handoff mid-sequence. Glance for one second.

expected: Each stuck agent and the KIND of stuck is identifiable; the hourglass reads as an hourglass without relying on its blue; the handoff line is readable, sits clear of desks and monitors, and does not read as a debug banner.
why_human: Legibility at viewing scale is a judgment. The harness proves geometry only (scale 4/6, 1.25 px head gap, bubble off every desk and glyph). This is round 2's test 1, which came back `issue` — the CEO has not seen a frame since the eight polish/gap fixes landed.
result: [pending]

### 2. Seated vs standing at a glance

Look at a populated office where at least one agent is blocked or waiting at its own desk
while a handoff sender waits in the aisle.

expected: The agent at its desk clearly reads as sitting (the desk hides its lower body) and the aisle sender clearly reads as standing.
why_human: "Reads as sitting" is the exact judgment round 2's polish item 3 raised; the automated test proves only a >= 8-row difference in visible body rows.
result: [pending]

### 3. Opaque footer band at sub-minimum viewports

Resize the browser below 960x528 (e.g. 800x480) and scroll the office.

expected: The attribution footer is legible on its own WALL_COLOR band (this part is now automated and passing), and the band does not hide anything you need — confirm you are content that the bottom ~19 px of the canvas cannot be scrolled clear of it.
why_human: Review finding WR-03. Analysis shows only grid row 10 (bottom wall — no seats, no standing spots, no head-anchored glyph) is permanently covered, so it is not classified as a blocker. Whether an opaque band over the canvas is acceptable at sub-minimum viewports is a product call. One-line fix (`paddingBottom` on the scroll container) if not.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
