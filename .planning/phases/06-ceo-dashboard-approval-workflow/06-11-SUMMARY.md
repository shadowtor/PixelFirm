---
phase: 06-ceo-dashboard-approval-workflow
plan: 11
subsystem: live-proof
status: complete
tags: [live-proof, playwright, claude-agent-sdk, ceo-gate, pretooluse, watchdog, privacy]

requires:
  - phase: 06-04
    provides: "worker WORKER_TASK_* env, decision broker, awaitDecision park in canUseTool"
  - phase: 06-07
    provides: "CEO room (cols 20-22, rows 1-11) and waiting glyph on the office canvas"
  - phase: 06-10
    provides: "/ceo action bar (Send answers, Approve -> Approve and run, Reject)"
provides:
  - "scripts/verify-ceo-approval-live.mjs: zero-mock live proof of the CEO approval workflow (env CEO_LIVE_SHOTS, refused inside the repo)"
  - "06-11-live-evidence.md: passing run of record with three complete audit chains, A1 and A2 settled"
affects: [06-12]

actuals:
  tokens: 10164      # chars/4 over the realized diff (40657 chars: script + evidence)
  tasks: 2
  commits: 2
plan_head_before: af69cee79023090ae07a56741ec11ed6a2207ac8

tech-stack:
  added: []
  patterns:
    - "Live harness samples the CEO room only after the agent's walk arrives, bounded by a deadline derived from WALK_SPEED_PX_PER_SEC"
    - "Privacy backstop reads the private strings back from the stored ceo.approval_requested payloads, then searches every /ws/browser frame and the office DOM for them (raw and JSON-escaped)"

key-files:
  created:
    - scripts/verify-ceo-approval-live.mjs
    - .planning/phases/06-ceo-dashboard-approval-workflow/06-11-live-evidence.md
  modified: []

key-decisions:
  - "A1 holds live: a PreToolUse 'ask' routes an allow-listed Bash(node -e *) call to canUseTool in SDK mode; no PreToolUse-park fallback applied"
  - "A2 holds live: a canUseTool park with a string prompt survived a 125 s hold past the 100 s watchdog with no blocked status; no streaming-prompt fallback applied"

duration: 17min
completed: 2026-09-24
---

# Phase 6 Plan 11: CEO approval live proof Summary

**A real Claude Code session under the real worker had its AskUserQuestion answered, one allow-listed deploy probe approved after a 125 s hold and another rejected, all from /ceo in Chromium. All three audit chains are complete, and no decision text reached the office route.**

## Performance

- **Duration:** about 17 min (07:22 to 07:39 UTC)
- **Started:** 2026-09-24T07:22:00Z
- **Completed:** 2026-09-24T07:39:08Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `scripts/verify-ceo-approval-live.mjs` starts everything itself and mocks nothing. It resets the test Postgres, starts the API with dev bypass and the web dev server on 127.0.0.1:5197, issues a worker credential, creates a disposable temp repo with a `Bash(node -e *)` allow rule, and starts the worker with a scripted prompt. It then drives /ceo while recording every office frame.
- Live result (run 3, the run of record, exit 0): approved probe content `hello`, rejected probe never ran, and three `requested -> decision_made (dev-bypass@pixelfirm.invalid) -> decision_applied` chains (allowed, allowed, denied). The hold lasted 125 011 ms with no blocked status. The agent was in the CEO room for the whole hold and gone 4.1 s after the last decision. None of the 7 private strings appeared in the 28 office frames or the office DOM.
- Research Assumptions A1 and A2 are settled as holding, so `claude-code-runtime.ts` is unchanged and no fallback test was needed.

## Task Commits

1. **Task 1: write the live proof script:** `b24072b` (feat)
2. **Task 2: run the live proof, record the evidence:** `ce06038` (test; includes the harness timing fix below)

## Files Created/Modified

- `scripts/verify-ceo-approval-live.mjs`: the live proof (CEO_LIVE_SHOTS guard at module load, port preflight, DB reset, temp repo, Playwright drive, DB read-back, JSON summary, teardown with taskkill /T and temp repo removal)
- `.planning/phases/06-ceo-dashboard-approval-workflow/06-11-live-evidence.md`: versions, decision table, A1/A2 findings, screenshot paths, earlier runs, verbatim JSON summary

## Decisions Made

- No fallback applied. A1 and A2 both held in the live run, so the plan's conditional runtime changes (PreToolUse park, streaming prompt) were not made.
- The CEO gate scope was not widened (orchestrator note). The probes use the existing `\bdeploy\b` Bash pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The harness sampled the CEO room before the agent could walk there**
- **Found during:** Task 2, run 1
- **Issue:** the first hold sample ran 1.7 s after decision 2 appeared on /ceo and read 0 sprite pixels, because the agent was still walking from its desk (the screenshot shows it mid-floor with its glyph). All later samples read 3 069 to 3 222 px. Run 1 exited 1 on "agent in the CEO room while pending". Its other 15 checks passed, including A1, A2, the audit chains and privacy.
- **Fix:** the script now waits for the agent to arrive. The wait is bounded by `WALK_DEADLINE_MS`, which comes from the engine's `WALK_SPEED_PX_PER_SEC` and the map size (14 334 ms). After arrival every sample must show sprite pixels, and a missed arrival fails the check. The assertion was not relaxed. The office screenshot was also moved one sample later (after run 2) so it shows the agent at its slot rather than in the doorway.
- **Files modified:** scripts/verify-ceo-approval-live.mjs
- **Commit:** ce06038

### Notes

- `CEO_LIVE_SHOTS` pointed at the session scratchpad, per project memory. The in-repo guard is unchanged.
- Plain `pnpm` spawned fine. The `npx --yes pnpm@12.4.2` fallback named in the plan was not needed.
- The API and worker get generated throwaway secrets passed in explicitly. `apps/api/.env` is never read.

**Total deviations:** 1 auto-fixed (Rule 1, harness only). **Impact:** no product code changed.

## Issues Encountered

- None beyond the run-1 timing bug above. The agent followed the scripted prompt in all three runs.

## Verification

- `node --check scripts/verify-ceo-approval-live.mjs`: OK
- `node scripts/verify-ceo-approval-live.mjs` (CEO_LIVE_SHOTS in scratchpad): exit 0, `"ok": true` (runs 2 and 3)
- `pnpm --filter claude-adapter test`: 94 passed, 3 skipped, 0 failed

## Human check (from the plan's verify block)

Open `06-11-live-evidence.md` and the screenshots it lists (outside the repo):
- `...\scratchpad\ceo-live-run3\office-ceo-room-hold.png` should show the agent in the CEO room with the amber question-mark glyph and no decision text on the canvas.
- `...\scratchpad\ceo-live-run3\ceo-pending-queue.png` should show /ceo with the pending item, its context and the Changes section.

Whether this reads well on stream is a matter of taste that automation cannot judge.

## Next Phase Readiness

- CEO-01 to CEO-05 were all seen in a real session. 06-12 can rely on A1 and A2 as proven.

## Self-Check: PASSED

- FOUND: scripts/verify-ceo-approval-live.mjs
- FOUND: .planning/phases/06-ceo-dashboard-approval-workflow/06-11-live-evidence.md
- FOUND: b24072b
- FOUND: ce06038
