---
phase: 06-ceo-dashboard-approval-workflow
plan: 09
subsystem: ui
tags: [react, shadcn, kibo-ui, playwright, vitest, tdd, ceo-dashboard, xss]

requires:
  - phase: 06-14
    provides: "CeoApp shell, pending queue, view-model.ts, e2e harness (fakeMe, fakeFeed, requested, decided, snapshot)"
  - phase: 06-03
    provides: "ceo.approval_requested payload: toolName, toolInput, questions, context, recommendation, links, diff"
provides:
  - "apps/web/src/ceo/DetailPane.tsx: DetailPane({ item, now, questions? }), UI-SPEC detail sections 1-8"
  - "apps/web/src/ceo/DiffView.tsx: DiffView({ diff }), per-file collapsible unified diff"
  - "apps/web/src/ceo/QuestionsForm.tsx: QuestionsForm({ decisionId, questions, selections, onChange })"
  - "apps/web/src/ceo/view-model.ts: safeLink, splitDiffByFile, diffLineKind, truncationCopy, actionLabel, buildAnswers, allAnswered, Question, Selections"
  - "CeoApp answerDrafts: Record<decisionId, Selections>, the state 06-10's Send answers reads"
affects: [06-10]

actuals:
  tokens: 10767      # chars/4 over the realized apps/ + e2e/ diff
  tasks: 2
  commits: 4
plan_head_before: d26964c4c5fe769024c78c241ed4422edc97cfe7

tech-stack:
  added: []
  patterns:
    - "Detail sections are a [heading, body] list rendered with a Separator between each, so optional sections (Runs on approve, Questions, Context, Links, Earlier) drop out without gaps"
    - "Choicebox/checkbox cards are wrapped in .ceo-choice; one unlayered ceo.css rule gives the checked card the accent border and a neutral fill"

key-files:
  created:
    - apps/web/src/ceo/DetailPane.tsx
    - apps/web/src/ceo/DiffView.tsx
    - apps/web/src/ceo/QuestionsForm.tsx
  modified:
    - apps/web/src/ceo/CeoApp.tsx
    - apps/web/src/ceo/view-model.ts
    - apps/web/src/ceo/view-model.test.ts
    - apps/web/src/ceo/ceo.css
    - e2e/ceo-dashboard.spec.ts

key-decisions:
  - "safeLink returns the raw string as href when new URL(raw).protocol is http: or https:, otherwise { text }. Unparseable strings and every other scheme render as mono text"
  - "Changes rows come from diff.files (with numstat counts). Each row's body is the splitDiffByFile chunk for that path; a file cut off by truncation keeps its row but has no body"
  - "Context is hidden when the request has none (UI-SPEC defines empty copy only for recommendation and diff)"
  - "Answer selections are stored per question text as { labels, other? }. buildAnswers joins picked labels in option order, then the trimmed Other text, with ', ' (matches validateAnswers). allAnswered is true only when every question has a non-empty answer"
  - "The selected choice card keeps shadcn's amber radio/checkbox indicator but not its 10% amber fill, which is not one of the six UI-SPEC accent uses"

patterns-established:
  - "RED evidence for vitest: tap-flat run, counters counted from that run's ok/not ok lines, camelCase exitCode/targetTest with the full src/…test.ts > name"

requirements-completed: [CEO-02]

coverage:
  - id: D1
    description: "Runs on approve (tool badge + exact parked toolInput in a 240px mono pre) for gated calls only"
    requirement: CEO-02
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#a gated call shows Runs on approve with the tool badge and the exact parked input"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#a question has no Runs on approve section"
        status: pass
    human_judgment: false
  - id: D2
    description: "Context and recommendation as plain text, recommendation empty copy, links hidden when absent, only http/https anchors with target _blank rel noopener noreferrer"
    requirement: CEO-02
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts#safeLink"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (context/recommendation/links tests, 3)"
        status: pass
      - kind: automated_ui
        ref: "grep -rn dangerouslySetInnerHTML apps/web/src/ceo (exit 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Changes: per-file collapsible rows, first expanded above 3 files, tinted +/- lines, 480px cap, truncation alert, no-diff copy"
    requirement: CEO-02
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts#splitDiffByFile, diffLineKind, truncationCopy"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (diff tests, 4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Earlier in this thread: collapsed, each round's action badge, timestamp, title and note"
    requirement: CEO-02
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#a Discuss round 2 shows a collapsed Earlier in this thread with round 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "No sideways scroll from a 600-char tool input (1024px) or a long path (375px)"
    requirement: CEO-02
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#a 600-character single-line tool input never scrolls the page sideways"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#at 375px a long file path and tool input stay inside the viewport"
        status: pass
    human_judgment: false
  - id: D6
    description: "AskUserQuestion: Choicebox / checkbox cards, Other textarea, previews while selected, unclamped 3000-char description, selections kept per decision, answers shaped for validateAnswers"
    requirement: CEO-02
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts#buildAnswers (3 tests)"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (Task 2 tests, 5)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual polish of the detail pane and question cards at 1280 and 375 px"
    verification:
      - kind: other
        ref: "Playwright screenshots at 1280 and 375 px (scratchpad only, not committed)"
        status: pass
    human_judgment: true
    rationale: "Screenshots were checked against the UI-SPEC by eye; whether it looks right is a judgement call"

duration: 22min
completed: 2026-09-24
status: complete
---

# Phase 6 Plan 09: CEO Detail Pane and Question Answering Summary

**Every pending decision on `/ceo` now shows, under its title and meta line, the exact parked call that runs on approve, the agent's questions as Choicebox or checkbox cards, the context, the recommendation, safe links, a per-file diff and earlier Discuss rounds. All agent text renders as React text nodes, and only http/https links become anchors.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-24T06:09:07Z
- **Completed:** 2026-09-24T06:31Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 8

## Accomplishments

- **DetailPane.** Title (h2, never truncated) and the 06-14 meta line, then h3 sections separated by 24px and a `Separator`: Runs on approve (gated calls only: mono tool badge, toolInput in a mono pre capped at 240px), Questions, Context, Recommendation (card or "The agent did not give a recommendation."), Links (hidden when none), Changes, Earlier in this thread. Keyed on decisionId so collapsible state resets per item.
- **DiffView.** One collapsible row per file: mono path with truncate and `title`, `+added` in #2A9D8F, `-removed` in #FF8A80. The first row is expanded when there are more than 3 files. The body is a mono pre (480px cap, pre-wrap, wrap-anywhere) with one element per line, tinted for adds and deletes, keeping the `+`/`-`. A truncated diff shows the truncation copy (line cap 400, the worker's `readDiff` default) in an alert above the rows. No diff shows "No file changes attached to this request."
- **QuestionsForm.** Per question: header chip, question text, then a Kibo Choicebox (single select) or checkbox cards (multiSelect), each card with label (600) and description (12px muted), plus "Other (write your own answer)", which reveals a textarea. A preview renders as plain text in a mono pre under its card only while that option is selected. Question and option text wrap in full.
- **Answers.** `buildAnswers` / `allAnswered` produce the exact shape `validateAnswers` accepts. CeoApp keeps selections in `answerDrafts` keyed by decisionId, so switching queue items keeps them.

## Task Commits

1. **Task 1 RED:** `c36b1cb` test(06-09): failing tests for the detail pane helpers and sections
2. **Task 1 GREEN:** `7554bb6` feat(06-09): detail pane with runs-on-approve, context, recommendation, links, diff and earlier rounds
3. **Task 2 RED:** `acd4f18` test(06-09): failing tests for answering an AskUserQuestion
4. **Task 2 GREEN:** `24fa38d` feat(06-09): answer AskUserQuestion with Choicebox, checkbox cards, Other and previews

## TDD Gate Compliance

- Task 1 RED: `npx vitest run src/ceo/view-model.test.ts --reporter=tap-flat`, exit 1, 11 passing and 7 failing, all on assertions against stubs. Target `src/ceo/view-model.test.ts > safeLink > keeps every other scheme, and non-URLs, as text only` returned **RED_EVIDENCE_OK (target_test_failed)**. The e2e run before the components: 10 new tests failed, 12 passed (the 11 existing ones plus "a question has no Runs on approve section", which is true by absence).
- Task 2 RED: same command, exit 1, 18 passing and 3 failing. Target `src/ceo/view-model.test.ts > buildAnswers > keys answers by exact question text, joining multi-select labels in option order` returned **RED_EVIDENCE_OK (target_test_failed)**. The e2e run: the 5 new tests failed, the 22 existing ones passed.
- Records used the vitest tap-flat output with `# tests/# pass/# fail` counted from that same run's `ok`/`not ok` lines, camelCase `exitCode`/`targetTest`.
- Every GREEN commit follows its RED commit.

## Verification

- `pnpm --filter web test`: 5 files, 52 tests passed.
- `pnpm --filter web typecheck`: exit 0.
- `pnpm --filter web build && node scripts/check-office-bundle.mjs`: "office bundle clean: 2 static chunk(s), Tailwind only in assets/CeoApp-*.css".
- `npx playwright test e2e/ceo-dashboard.spec.ts`: 28 passed. `e2e/office-disconnect.spec.ts`: 1 passed.
- `grep -rn "dangerouslySetInnerHTML" apps/web/src/ceo`: no output, exit 1 (T-06-09-01).
- Browser check: Playwright screenshots at 1280 and 375 px of a gated item (600-char input, links, 4-file truncated diff), a question item with selections, and a round-2 item with earlier rounds expanded. They caught both fixes below.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A long file path widened the detail pane past a 375px viewport**
- **Found during:** Task 2 browser screenshot at 375 px
- **Issue:** the pane row in CeoApp (`flex min-h-0 flex-1 gap-8`) had the default `min-width: auto`, so the nowrap min-content width of a truncated diff path pushed the whole detail wider than the screen. The page itself does not scroll, so the right side of the tool input and diff was clipped.
- **Fix:** `min-w-0` on that row. New e2e test "at 375px a long file path and tool input stay inside the viewport", which fails without the fix and passes with it.
- **Files modified:** apps/web/src/ceo/CeoApp.tsx, e2e/ceo-dashboard.spec.ts
- **Commit:** 24fa38d

**2. [Rule 2 - UI-SPEC] Selected choice cards got an amber fill**
- **Found during:** Task 2 browser screenshot
- **Issue:** shadcn's `FieldLabel` tints a checked card with `bg-primary/10` (amber) and uses only a 20% amber border. UI-SPEC accent item 6 is the selected card's border.
- **Fix:** one `.ceo-choice` rule in ceo.css sets a full accent border and a neutral `--card` fill.
- **Commit:** 24fa38d

**3. [Note] Small additions**
- `actionLabel` in view-model.ts, for the earlier-round badge. 06-10's History badges can reuse it.
- The earlier-rounds collapsible trigger reads "Show round 1" / "Show rounds 1-n". The UI-SPEC has no copy for it.
- The e2e fixture's 3000-character option description is longer than the schema's 2000 cap. Snapshots are not re-validated in the browser, and the test is about no clamping, so it stays as the plan specified.
- `{ answers, allAnswered }` is not computed in CeoApp yet: nothing reads it until 06-10's Send answers button. That button calls `buildAnswers`/`allAnswered` on `answerDrafts[selectedId]`.

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2), 1 note. **Impact:** no scope creep. The office route is untouched.

## Issues Encountered

- A heredoc-driven multi-file edit failed in bash quoting; redone with the Edit tool. No effect on the result.

## User Setup Required

None.

## Next Phase Readiness

- 06-10 adds the action bar under DetailPane. For question items: "Send answers" is disabled until `allAnswered(questions, answerDrafts[id] ?? {})`, and posts `buildAnswers(...)` as `answers`.
- 06-10's History badges can use `actionLabel`.

---
*Phase: 06-ceo-dashboard-approval-workflow*
*Completed: 2026-09-24*

## Self-Check: PASSED
