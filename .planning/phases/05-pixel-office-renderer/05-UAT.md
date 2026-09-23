---
status: complete
phase: 05-pixel-office-renderer
source: [05-VERIFICATION.md]
started: 2026-09-23T21:30:00Z
updated: 2026-09-23T11:52:20Z
round: 4
supersedes: "round 3 (2026-09-23, 3 tests: 1 passed, 2 cosmetic issues) — see git history for 05-UAT.md"
---

## Current Test

[testing complete]

## Tests

### 1. Stream-scale readability and seated-vs-standing (closes round 3 tests 1 and 2)

Open the frame the verifier captured at HEAD (session scratchpad `verif-shots/handoff.png`,
1280x720), or run the office live at your OBS source size with a blocked agent, a waiting agent
and a handoff mid-sequence. Glance for one second.

expected: The hourglass reads as an hourglass without relying on its blue; the blocked sign is separable from it at a glance; the handoff line reads as a sentence (`hands off to …`), not a debug banner; glyphs sit clear of their owners' heads; seated agents read as sitting while the aisle sender reads as standing.
why_human: Legibility at viewing scale is a judgment. Automated inspection ran first — the live probe (TRUTH 0-7) passed end to end and the captured frame shows every change round 3 requested.
result: pass
note: "User: hourglass reads by silhouette; blocked vs waiting distinct; handoff reads as an action; glyphs clear of sprites; seated vs standing distinct. Truncated destination (`live-proo…`) acceptable for now — deferred as UI polish."

### 2. Disconnect banner when the feed drops

expected: A `role="status"` banner appears at the top of the page; the office does not freeze silently.
result: pass
evidence: "Automated (orchestrator, 2026-09-23): Playwright against vite with a routed /ws/browser socket. Banner count 0 while connected; server-side close → banner visible with text 'Disconnected from the office feed — what you see is the last known state, not live.'; requestAnimationFrame kept ticking at 61 frames/s after the close. Screenshot: session scratchpad disconnect.png."

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Deferred Follow-Ups

- test: 1
  idea: "Handoff bubble truncates the destination name (`live-proo…`) — use display names, adaptive bubble width, or a shorter handoff format."
  deferred_at: 2026-09-23
