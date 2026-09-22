---
phase: 05-pixel-office-renderer
plan: 16
subsystem: pixel-office live proof / UI contract
tags: [gap-closure, live-proof, playwright, canvas, dialogue, WR-06]
status: complete
requires: [05-13, 05-14]
provides:
  - "TRUTH 5: handoff dialogue observed on a real canvas, owner-bound, cleared after the sequence"
  - "Harness refuses to run against a server it did not start (WR-06 closed at the root)"
  - "05-UI-SPEC.md matches the shipped renderer"
affects: [scripts/verify-pixel-office-live.mjs, 05-UI-SPEC.md]
tech-stack:
  added: []
  patterns: ["node:net TCP port preflight before any side effect"]
key-files:
  created: []
  modified:
    - scripts/verify-pixel-office-live.mjs
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md
key-decisions:
  - "WR-06 fixed in the harness: TCP preflight on API/web ports before container reset; startServer always spawns (ensureServer deleted)"
  - "Tracer human-check (dialogue legibility at stream scale) deferred to end-of-phase verification, as the plan marks it non-blocking"
requirements-completed: [HANDOFF-01, HANDOFF-02, OFFICE-01, OFFICE-03]
duration: 7 min
completed: 2026-09-22
plan_head_before: c65b8b769904c618d9d80c2154d6412d6e805210
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
coverage:
  - deliverable: "Harness refuses foreign servers before any side effect"
    human_judgment: false
    verification:
      - kind: command
        ref: "node -e (hold 5177, spawn harness, assert refusal and no reset line)"
        status: pass
  - deliverable: "TRUTH 5 live dialogue pixels + TRUTH 1-4 re-run"
    human_judgment: false
    verification:
      - kind: command
        ref: "node scripts/verify-pixel-office-live.mjs"
        status: pass
      - kind: command
        ref: "netstat -ano | grep LISTENING | grep -E ':(3000|5177) ' (empty)"
        status: pass
  - deliverable: "Dialogue legible at stream scale and reads as the walking agent's"
    human_judgment: true
    rationale: "Judgment item from the plan's human-check; mechanically painted pixels do not prove legibility (open prohibition)"
  - deliverable: "05-UI-SPEC.md dialogue contract and corrected rows"
    human_judgment: false
    verification:
      - kind: command
        ref: "grep gates in 05-16-PLAN.md Task 2 verify/acceptance"
        status: pass
---

# Phase 5 Plan 16: Live dialogue pixel proof + WR-06 harness refusal Summary

The live proof now reads the handoff dialogue back off a real headless-Chromium canvas on the real relay path (box present, contains the speaker's column centre, entirely above its sprite, carries text, gone once the sender is home), and the harness refuses to run at all while anything holds the API or web port.

## Timing

- Start: 2026-09-22T02:10:26Z, end ~2026-09-22T02:17Z (7 min)
- Tasks: 2, files modified: 2

## Accomplishments

- `portTaken(port)` (node:net, IPv4 + IPv6 loopback) preflight right after `assertHarnessOwnedTarget()`, before the container reset; `startServer` replaces `ensureServer` (reuse path deleted). `ponytail:` comment names the probe-to-spawn race ceiling.
- `scanCanvas(page, xRange, textAboveY)` returns `dialogueHits`, `dialogueMinX/MaxX/MinY/MaxY`, `dialogueTextPx`; `DIALOGUE_BOX_COLOR`, `BUBBLE_ICON_GAP_PX`, `BUBBLE_ICON_HEIGHT_PX` read from constants.ts at run time.
- TRUTH 1 baseline now also asserts zero dialogue-box px; TRUTH 5 asserts during and after the handoff.
- 05-UI-SPEC.md: Typography dialogue contract (incl. A2 grid interpretation), two Color rows, Copywriting length rule, UI Considerations 7/1/0, asset table lists the three 05-07 glyphs, known-gap bullets marked resolved, dated `Superseded by 05-16` note. Checker Sign-Off untouched; 05-CONTEXT.md untouched.

## Proof output (verbatim)

Refusal check (port 5177 held):
```
[live-proof] Error: refusing to reuse a server this harness did not start — port(s) 5177 already accept connections.
```
No `resetting the test Postgres` line; exit non-zero; check command exit 0.

Live run:
```
[live-proof] office open: canvas 320x176 (scale 1) — sprite=0
[live-proof] baseline canvas 320x176: sprite=588 blocked=0 handoff=0 dialogue=0
[live-proof] TRUTH 1 PASS — 588 sprite pixels painted from live events on an already-open page
[live-proof] TRUTH 2 PASS — 68 blocked-bubble pixels, no navigation between the event and the scan
[live-proof] dialogue scan: 2639 dialogue-box px + 971 text px at x 0..282, y 0..12 (speaker centre x 56, sprite top 24, glyph slot top 9)
[live-proof] TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion
[live-proof] TRUTH 5 PASS — 2639 dialogue-box px + 971 text px at x 0..282, y 0..12, above the speaker's sprite (top 24), cleared after the sequence
[live-proof] TRUTH 4 PASS — 68 blocked-glyph px at y 58..67, inside live-proof-seat-18's own headroom (56 < y < 72) and in no other agent's
LIVE PROOF: PASS
```
Box y 0..12 matches the plan's predicted row-3 geometry. Box starts at x 0 because the line (capped 23-char task id and 19-char agent id) is ~283 px wide and gets clamped onto the 320 px canvas; it still contains the speaker's centre (x 56). No WR-04 colour failure surfaced in TRUTH 1/2/4. Post-run: no listeners on 3000/5177.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ac852ef | Harness refuses foreign servers; TRUTH 5 dialogue pixels |
| 2 | 6bf9731 | UI-SPEC dialogue contract and resolved rows |

## Deviations from Plan

**1. [Rule 1 - Bug] Reworded a pre-existing comment that tripped the `page.reload` acceptance grep**
- Found during: Task 1 acceptance. `grep -c 'page.reload'` matched the comment "with a page reload" (regex dot matches the space); there was no `page.reload()` call.
- Fix: comment now reads "by reloading the page". Count is 0. Commit ac852ef.

**2. [Rule 2 - Stale contract] Updated the Typography Label row** to say the canvas dialogue line is also rendered text (it previously called the footer the only rendered text). Commit 6bf9731.

**Total deviations:** 2 auto-fixed (1 bug, 1 stale contract). **Impact:** neither changes behaviour.

## Deferred / Judgment Items

- Tracer human-check: can a viewer read the dialogue at stream size, and does it read as the walking agent's? Not done here. The plan marks it non-blocking and `human_verify_mode` is end-of-phase, so it goes to phase verification along with 05-VERIFICATION.md's human items 1-4. The 283 px clamped box at 11 px on a 320 px native canvas is worth looking at when you check this.
- The Copywriting "Error state" row still says "Unresolved this phase". The plan only covered the UI Considerations error row, so this one was left as is.

## Next

This is the last Phase 5 plan: 16 of 16 summaries now exist. Phase complete, ready for verification.

## Self-Check: PASSED
- scripts/verify-pixel-office-live.mjs and 05-UI-SPEC.md exist and are modified; commits ac852ef and 6bf9731 are present in `git log`.
