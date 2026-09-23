---
status: complete
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-23T14:45:00Z
updated: 2026-09-23T15:35:00Z
round: 3
supersedes: "round 2 (2026-09-22, 4 tests: 3 passed, 1 issue) — see git history for 05-UAT.md"
verdict: "No functional blockers. Implementation accepted; four visual-polish items requested before the UI is considered finished."
---

## Current Test

[testing complete]

## Tests

### 1. Stream-scale readability at OBS source size

Open the office at your OBS source size (1280x720 or 1920x1080) with agents in blocked,
waiting_for_ceo and waiting_for_agent, plus a handoff mid-sequence. Glance for one second.

expected: Each stuck agent and the KIND of stuck is identifiable; the hourglass reads as an hourglass without relying on its blue; the handoff line is readable, sits clear of desks and monitors, and does not read as a debug banner.
why_human: Legibility at viewing scale is a judgment. The harness proves geometry only (scale 4/6, 1.25 px head gap, bubble off every desk and glyph).
evidence: Live frames captured at 1280x720 (handoff.png, cohort.png, states.png) from the real stack — Postgres, api, web, worker events over /ws/browser.
result: issue
reported: "Improve the waiting/hourglass status sprite so its silhouette remains immediately identifiable at stream resolution. Replace the current handoff text such as `live-proof-… → live-proo…` with a proper compact handoff/action bubble. Avoid truncating both names into debug-looking identifiers. Ensure status icons have a little separation from the character sprite, around another 2–4 px or equivalent."
severity: cosmetic
note: "Accepted as non-blocking — the states themselves ARE distinguishable; this is legibility polish at stream scale."

### 2. Seated vs standing at a glance

Look at a populated office where at least one agent is blocked or waiting at its own desk
while a handoff sender waits in the aisle.

expected: The agent at its desk clearly reads as sitting (the desk hides its lower body) and the aisle sender clearly reads as standing.
why_human: "Reads as sitting" is the exact judgment round 2's polish item 3 raised; the automated test proves only a >= 8-row difference in visible body rows.
evidence: handoff.png — seated pair show head-and-shoulders only; the aisle sender shows full body including legs.
result: issue
reported: "Slightly increase the visual distinction between a standing/handoff agent and seated agents."
severity: cosmetic
note: "Accepted as non-blocking — the distinction exists and is visible; the ask is to widen it."

### 3. Opaque footer band at sub-minimum viewports

Resize the browser below 960x528 (e.g. 800x480) and scroll the office.

expected: The attribution footer is legible on its own WALL_COLOR band, and the band does not hide anything you need.
why_human: Review finding WR-03 — whether an opaque band over the canvas is acceptable at sub-minimum viewports is a product call.
evidence: |
  Measured per-row from live frames rather than estimated. At 1280x720 and 1920x1080 the
  footer text sits entirely BELOW the canvas (canvas ends y=703; text at y=705..714) — zero
  overlap. At 800x480 the strip beneath the footer is the canvas's own bottom wall row,
  already #3A3A5C, which is why it reads as seamless. Seats are on grid rows 4 and 8; no
  seat, standing spot or head-anchored glyph falls in the covered band at any scroll
  position. The footer wraps to two lines at 800px wide (~21px of text) — not previously
  measured; WR-03's analysis had assumed a single ~19px line.
result: pass
reported: "Keep the footer behaviour as-is for now. The viewport behaviour, footer wrapping, desk alignment, contrast and 1280x720 / 1920x1080 rendering otherwise look fine."

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-05-1a
  truth: "The waiting/hourglass status sprite's silhouette is immediately identifiable at stream resolution, without relying on its blue"
  status: failed
  reason: "User reported: Improve the waiting/hourglass status sprite so its silhouette remains immediately identifiable at stream resolution."
  severity: cosmetic
  test: 1
  artifacts: []
  missing: []

- gap_id: G-05-1b
  truth: "A handoff renders as a compact handoff/action bubble, not two truncated identifiers reading as a debug banner"
  status: failed
  reason: "User reported: Replace the current handoff text such as `live-proof-… → live-proo…` with a proper compact handoff/action bubble. Avoid truncating both names into debug-looking identifiers."
  severity: cosmetic
  test: 1
  artifacts: []
  missing: []
  context: "Current MAX_DIALOGUE_TITLE_CHARS is 12, applied to BOTH names, producing `x… → y…`. Any redesign must preserve the phase's pure-consumer property (no Math.random / Date.now / timers in packages/pixel-office/src) and the deterministic template-based dialogue contract (SC3)."

- gap_id: G-05-1c
  truth: "Status icons sit ~2-4 px further from the character sprite than they do today"
  status: failed
  reason: "User reported: Ensure status icons have a little separation from the character sprite, around another 2–4 px or equivalent."
  severity: cosmetic
  test: 1
  artifacts: []
  missing: []
  context: "Current gap is 1.25 px above the owner's head (live-proved, TRUTH 4). Raising it must keep the glyph owner-bound and must not push it off-canvas for row-0 occupants."

- gap_id: G-05-2a
  truth: "A standing/handoff agent is more visually distinct from a seated agent than it is today"
  status: failed
  reason: "User reported: Slightly increase the visual distinction between a standing/handoff agent and seated agents."
  severity: cosmetic
  test: 2
  artifacts: []
  missing: []
  context: "Today the only separation is visible body rows (>= 8 rows difference, desk occludes the seated lower body)."

## Deferred Follow-Ups

- test: 3
  idea: "Keep the footer behaviour as-is for now, but make sure it can eventually be hidden for production/stream presentation."
  deferred_at: 2026-09-23
  note: "A hideable-for-stream footer is a new capability, not a defect. Must not regress SC4 / OFFICE-02 — the attribution is currently unconditional and ungated by design, so any hide affordance needs an explicit licence-compliance decision first."

- test: 0
  idea: "I would not hold up the project for desk decoration or visual variety yet. That belongs in a later office-polish/customisation phase rather than this renderer verification."
  deferred_at: 2026-09-23
  note: "Explicitly out of scope for Phase 5. Route to a future office-polish/customisation phase."
