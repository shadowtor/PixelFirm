---
phase: 06-ceo-dashboard-approval-workflow
plan: 10
subsystem: ui
tags: [react, shadcn, sonner, alert-dialog, playwright, vitest, tdd, ceo-dashboard, csrf]

requires:
  - phase: 06-09
    provides: "DetailPane, QuestionsForm, answerDrafts in CeoApp, buildAnswers/allAnswered/actionLabel"
  - phase: 06-04
    provides: "POST /ceo/api/tasks/:taskId/resume (202/404/409/503), requireCsrf"
  - phase: 06-13
    provides: "POST /ceo/api/decisions/:decisionId (202/400/404/409/503), note required for the three note actions"
provides:
  - "apps/web/src/ceo/ActionBar.tsx: ActionBar({ request, note, onNoteChange, answers, answersReady, closedCopy, onSubmit })"
  - "apps/web/src/ceo/HistoryTable.tsx: HistoryTable({ state, now })"
  - "apps/web/src/ceo/api.ts: postDecision(decisionId, body), postResume(taskId) -> { ok: true } | { ok: false, status, reason }"
  - "apps/web/src/ceo/view-model.ts: noteRequired, validateNote, inProgressLabel, successToast, relativeTime, noLongerPendingCopy, historyBadge"
  - "CeoApp: History tab, noteDrafts per decision, sent/mine/conflicts tracking, held no-longer-pending item, sonner Toaster"
affects: [06-11, 06-12]

actuals:
  tokens: 14392      # chars/4 over the realized apps/ + e2e/ diff (57568 chars)
  tasks: 2
  commits: 4
plan_head_before: 67bbd1f03b682a527144b93e6aa083cd9e8a205b

tech-stack:
  added: []
  patterns:
    - "Submit logic lives in CeoApp (submitDecision); ActionBar only owns its submitting/error/invalid UI state, so a bar that unmounts mid-POST cannot lose the toast"
    - "A decision leaves the queue on the 202 (sent set) or on the live decision_made, whichever comes first; ids in flight or sent from this page (mine ref) move the selection on, anything else that stops being pending is held with the alert"

key-files:
  created:
    - apps/web/src/ceo/ActionBar.tsx
    - apps/web/src/ceo/HistoryTable.tsx
  modified:
    - apps/web/src/ceo/CeoApp.tsx
    - apps/web/src/ceo/api.ts
    - apps/web/src/ceo/view-model.ts
    - apps/web/src/ceo/view-model.test.ts
    - e2e/ceo-dashboard.spec.ts

key-decisions:
  - "A decision decided elsewhere or expired while open stays selected with the no-longer-pending alert and the draft note (read-only) until the CEO clicks another item. Only this page's own decisions move the selection to the next item"
  - "A 409 that arrives before the live event shows 'This decision was already made by another session just now.' (or the expired copy for error 'expired'); the live decision_made then fills in the real decider and time"
  - "postDecision/postResume return the server's error string as reason (for example 'worker offline'); a non-string error (the 400 zod flatten) falls back to 'HTTP 400'"
  - "The note is sent trimmed and only when non-empty; answers are sent only with approve on a clarifying question"
  - "Resume task sits in the Action cell next to the Expired badge, so the table keeps the six UI-SPEC columns"

patterns-established:
  - "RED evidence for vitest (repeat of 06-09): tap-flat run, counters counted from that run's ok/not ok lines, camelCase exitCode/targetTest with the full src/...test.ts > name"

requirements-completed: [CEO-03, CEO-05]

coverage:
  - id: D1
    description: "Five actions per pending decision POSTing JSON with X-PixelFirm-CSRF; Send answers disabled until every question is answered and posts answers"
    requirement: CEO-03
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#Send answers stays disabled until every question is answered, then posts the answers with no dialog"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#Reject posts at once with no dialog, carrying a typed note"
        status: pass
    human_judgment: false
  - id: D2
    description: "Required note for Request changes, More research, Discuss: no request, focus to note, aria-invalid, error copy"
    requirement: CEO-03
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts#noteRequired / validateNote"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#Request changes with an empty or whitespace note sends nothing and asks for a note"
        status: pass
    human_judgment: false
  - id: D3
    description: "Approve confirmation dialog for gated calls: UI-SPEC copy, same tool badge and input pre, focus on Keep waiting, focus back to Approve"
    requirement: CEO-03
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#Approve on a gated call confirms against the exact call, with focus starting on Keep waiting"
        status: pass
    human_judgment: false
  - id: D4
    description: "Submitting/success/503/409/expired states; no keyboard path to a decision; buttons stay enabled while the feed reconnects"
    requirement: CEO-03
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts#inProgressLabel / successToast, relativeTime / noLongerPendingCopy"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (submitting, 503, 409, expired, Enter, feed-drop, decided-elsewhere tests, 7)"
        status: pass
    human_judgment: false
  - id: D5
    description: "History: latest 50 closed decisions newest first with six columns and badges; Resume task for resumable expired rows; skeleton/empty/error; tabs keep selection and note"
    requirement: CEO-05
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts#historyBadge"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (06-10 Task 2 tests, 7)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual polish of the action bar, approve dialog and History table at 1280 and 375 px"
    verification:
      - kind: other
        ref: "Playwright screenshots at 1280 and 375 px (scratchpad only, not committed)"
        status: pass
    human_judgment: true
    rationale: "Screenshots were checked against the UI-SPEC by eye; whether it looks right is a judgement call"

duration: 32min
completed: 2026-09-24
status: complete
---

# Phase 6 Plan 10: CEO Actions and History Summary

**Every pending decision on `/ceo` now has Approve (or Send answers), Request changes, More research, Discuss and Reject, posting CSRF-headed JSON to the decisions API. The three note actions insist on a real note. Gated approvals go through a "Keep waiting"-focused confirmation that repeats the exact call. The History tab lists the last 50 closed decisions and can resume a task that a worker restart blocked.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-09-24T06:38:32Z
- **Completed:** 2026-09-24T07:10:51Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 7

## Accomplishments

- **api.ts.** `postDecision` and `postResume` send a same-origin POST with `Content-Type: application/json` and `X-PixelFirm-CSRF: 1`. Resume sends `{}`. Each returns `{ ok: true }` or `{ ok: false, status, reason }`, where reason is the server's error string.
- **ActionBar.** Sticks to the bottom of the detail pane (`--card`, top border, 16px padding). It holds the "Note to agent" textarea (3 rows, grows to 8, helper text and placeholder), then Approve / Send answers (accent, full width below 768px), Request changes, More research and Discuss (outline), and Reject (outline with a red border and red hover fill, right-aligned). Buttons are 44px tall below 768px and 36px from 768px up. While a request is in flight, everything is disabled and the clicked button shows a spinner and its in-progress label. A failure keeps the note and shows "Decision not sent: {reason}. The agent is still waiting. Try again." No key handler exists anywhere in `src/ceo`, and Enter in the note only inserts a newline.
- **Approve confirmation.** On gated calls, Approve is the trigger for a shadcn alert-dialog: "Approve this action?", "{agent} will run exactly this call. Nothing else is approved.", the tool badge and the same input pre, then "Keep waiting" / "Approve and run". Radix focuses Cancel on open and returns focus to Approve on close. Send answers and Reject submit directly.
- **CeoApp.** Note drafts are kept per decision. `submitDecision` removes the item on a 202 (the `sent` set) and toasts through sonner. A 409 is recorded in `conflicts`. An item that stops being pending but was not decided from this page is held: the pane shows the no-longer-pending alert and the read-only note, and the action buttons go away. The Tabs now have `Pending (N)` and `History`.
- **HistoryTable.** Shows `decisionHistory(state, 50)` in a shadcn table. When shows `toLocaleString()` with the relative time in `title`. Decision and Note are truncated to one line with the full text in `title`. Badges: Approved (green outline), Rejected (red fill, white text), Changes requested / More research / Discuss (neutral outline), Expired (muted, dashed). "Resume task" shows only while `isResumable` holds and this page has not already resumed the task. Before the first snapshot the table shows 5 skeleton rows. With no closed decisions it shows the empty copy, and a feed failure shows the loading error with Retry.

## Task Commits

1. **Task 1 RED:** `db6b0b0` test(06-10): failing tests for the action bar
2. **Task 1 GREEN:** `60173b4` feat(06-10): action bar with required notes, approve confirmation and honest submit states
3. **Task 2 RED:** `c737cbc` test(06-10): failing tests for History and Resume task
4. **Task 2 GREEN:** `a7e5d5a` feat(06-10): History tab over the audit events with Resume task for expired requests

## TDD Gate Compliance

- Task 1 RED: `npx vitest run src/ceo/view-model.test.ts --reporter=tap-flat`, exit 1, 21 passing and 7 failing. All 7 failures were assertions against stubs. Target `src/ceo/view-model.test.ts > noteRequired / validateNote > requires a note for request changes, more research and discuss only` returned **RED_EVIDENCE_OK (target_test_failed)**. In the e2e run, 11 tests failed (10 new, plus the rewritten decided-elsewhere test) and 27 passed.
- Task 2 RED: same command, exit 1, 28 passing and 2 failing. Target `src/ceo/view-model.test.ts > historyBadge > maps each action to its label and tone` returned **RED_EVIDENCE_OK (target_test_failed)**. In the e2e run, all 7 new tests failed.
- Every GREEN commit follows its RED commit.

## Verification

- `pnpm --filter web test`: 5 files, 61 tests passed.
- `pnpm --filter web typecheck`: exit 0.
- `pnpm --filter web build && node scripts/check-office-bundle.mjs`: "office bundle clean: 2 static chunk(s), Tailwind only in assets/CeoApp-*.css".
- `npx playwright test e2e/ceo-dashboard.spec.ts e2e/office-disconnect.spec.ts`: 46 passed.
- `grep -rn -E "onKey|keydown|addEventListener\(\"key|dangerouslySetInnerHTML" apps/web/src/ceo`: no output, exit 1 (prohibition and T-06-10-02).
- Acceptance: request count is 0 after an empty-note click and after Enter; the Send answers body is `{ action: "approve", answers: {...} }` with `x-pixelfirm-csrf: 1`; `:focus` is "Keep waiting" when the dialog opens; History shows 50 rows for 60 records with the newest first; the resume URL ends `/ceo/api/tasks/task-70/resume` and the toast reads "Task resumed. dee will ask again."
- Browser check: Playwright screenshots at 1280 and 375 px of the action bar (default, required-note error, submit error), the approve dialog and the History table. Two fixes came out of this check (deviations 2 and 3 below).

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Spec conflict] 06-14's "decided elsewhere selects the next item" test replaced**
- **Found during:** Task 1 RED
- **Issue:** The 06-14 e2e test expected the next item to be selected when the open item was decided elsewhere. This plan's must-have (and UI-SPEC "Live updates") says the pane shows the no-longer-pending alert and keeps the draft note until the CEO moves on.
- **Fix:** The test now asserts the alert, that the buttons are gone and the note is kept, and that clicking the next item moves on. Decisions made from this page still auto-select the next item.
- **Files modified:** e2e/ceo-dashboard.spec.ts, apps/web/src/ceo/CeoApp.tsx
- **Commit:** db6b0b0, 60173b4

**2. [Rule 1 - Bug] The sticky action bar left a 24px strip of scrolled content below it**
- **Found during:** Task 1 browser screenshot
- **Issue:** The detail section's `pb-6` insets the sticky edge, so content showed through under the bar.
- **Fix:** `-bottom-6` on the bar.
- **Commit:** 60173b4

**3. [Rule 2 - UI-SPEC Color] The required-note error turned the label #D62828**
- **Found during:** Task 1 browser screenshot
- **Issue:** shadcn's `Field data-invalid` colours its text `text-destructive`, and the UI-SPEC does not allow destructive as text on the dark background.
- **Fix:** The Field no longer gets `data-invalid`. The textarea's `aria-invalid` keeps the red border, and the error text is #FF8A80.
- **Commit:** 60173b4

**4. [Rule 3 - Test] The live-region locator matched sonner's region too**
- **Found during:** Task 1 GREEN
- **Issue:** The Toaster adds its own `aria-live="polite"` section, so the 06-14 test's `[aria-live="polite"]` matched two elements (strict mode).
- **Fix:** The locator is now `div[aria-live="polite"]`.
- **Commit:** 60173b4

**5. [Note] Copy the UI-SPEC does not define**
- A 409 that arrives before the live event uses "another session" as the decider and "just now" as the time. The live event then replaces both with the real values.
- A failed resume shows "Resume not sent: {reason}. The task is still blocked. Try again.", following the submit-error pattern.
- The color table lists Expired as a destructive badge, but the History tab rule says muted and dashed. The History tab rule was followed.
- sonner registers its own alt+T shortcut, which only focuses the notifications region. It cannot trigger a decision.

**Total deviations:** 4 auto-fixed (2 Rule 1, 1 Rule 2, 1 Rule 3), 1 note. **Impact:** no scope creep. The office route is untouched and the bundle check is clean.

## Issues Encountered

- A long bash heredoc with nested quotes failed to parse, so the e2e edits were applied through Python scripts in the scratchpad instead. This had no effect on the result.

## User Setup Required

None.

## Next Phase Readiness

- 06-11 can drive all five actions and Resume against a real session. The UI already reflects the server rules: a required note, 409 for a repeat or late decision, and 503 for worker offline (nothing recorded).

---
*Phase: 06-ceo-dashboard-approval-workflow*
*Completed: 2026-09-24*

## Self-Check: PASSED
