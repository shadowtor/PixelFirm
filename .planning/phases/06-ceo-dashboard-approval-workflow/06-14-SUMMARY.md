---
phase: 06-ceo-dashboard-approval-workflow
plan: 14
subsystem: ui
tags: [react, shadcn, kibo-ui, websocket, playwright, vitest, tdd, ceo-dashboard]

requires:
  - phase: 06-08
    provides: "lazy /ceo chunk, shadcn/Kibo components, ceo.css, check-office-bundle.mjs"
  - phase: 06-05
    provides: "GET /ceo/api/me -> { email, devBypass }"
  - phase: 06-06
    provides: "/ceo/ws snapshot + ceo.* relay; applyDecisionEvent/pendingQueue/foldDecisions in company-core"
provides:
  - "apps/web/src/ceo/api.ts: fetchMe() -> { ok: true, email, devBypass } | { ok: false, status, reason }"
  - "apps/web/src/ceo/ceo-feed.ts: connectCeoFeed({ onSnapshot, onEvent, onStatus }) -> { close() }, FeedStatus Live/Reconnecting/Offline"
  - "apps/web/src/ceo/view-model.ts: waitedLabel, isLongWait, kindLabel, documentTitle, nextSelection, detailMeta"
  - "apps/web/src/ceo/QueueList.tsx: QueueList"
  - "apps/web/src/ceo/CeoApp.tsx: shell, auth gate, header, pending queue, detail heading + meta line"
  - "e2e/ceo-dashboard.spec.ts: 11 browser tests plus fixtures/harness (fakeMe, fakeFeed, requested, decided, snapshot, eventFrame) for 06-09/06-10 to extend"
affects: [06-09, 06-10]

actuals:
  tokens: 10461      # chars/4 over the realized diff, code commits only
  tasks: 2
  commits: 5
plan_head_before: 0f783872a5486ddd1012d35fd64275a1c11dbf8a

tech-stack:
  added: []
  patterns:
    - "Dashboard state = DecisionsState: snapshot replaces it, each live event goes through applyDecisionEvent, the queue is pendingQueue(state)"
    - "Selection keyed on the joined pending ids; previous ids kept in a ref so nextSelection can pick the neighbour of the item that left"
    - "e2e fakes /ceo/api/me with page.route and /ceo/ws with page.routeWebSocket, and builds snapshots with the real foldDecisions"

key-files:
  created:
    - apps/web/src/ceo/api.ts
    - apps/web/src/ceo/ceo-feed.ts
    - apps/web/src/ceo/ceo-feed.test.ts
    - apps/web/src/ceo/view-model.ts
    - apps/web/src/ceo/view-model.test.ts
    - apps/web/src/ceo/QueueList.tsx
    - e2e/ceo-dashboard.spec.ts
  modified:
    - apps/web/src/ceo/CeoApp.tsx
    - apps/web/src/ceo/ceo.css

key-decisions:
  - "Feed status starts at Reconnecting until the first open. A feed close before any snapshot shows the load error ('the live feed disconnected'), but the socket keeps retrying and a later snapshot replaces the error with the queue"
  - "Offline is reported once 30 s pass without a successful reopen, and it stays Offline through later failed retries. Any open resets both the backoff and the status to Live"
  - "The agent name in the queue, meta line and live announcement is the event's sourceAgentId: the private feed has no agent display names"
  - "The queue column uses native overflow-y-auto rather than shadcn ScrollArea, so the column element is itself the scroll container the e2e asserts"

patterns-established:
  - "RED evidence for vitest: tap-flat run, counters transcribed from that run, targetTest is the full TAP name including the file prefix"

requirements-completed: [CEO-02]

coverage:
  - id: D1
    description: "Same-origin /ceo/ws client: snapshot replaces state, events re-validated, Live/Reconnecting/Offline, 1 s doubling backoff to 30 s, no query string"
    requirement: CEO-02
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/ceo-feed.test.ts (7 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Auth failure, dev-bypass banner, skeleton loading, empty state, load error with Retry, header title/status/email"
    requirement: CEO-02
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (Task 1 tests, 6)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The office route requests nothing under /src/ceo/ and its build has no Tailwind or CeoApp static import"
    requirement: CEO-02
    verification:
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts#loading the office route requests nothing under /src/ceo/ (D-08)"
        status: pass
      - kind: automated_ui
        ref: "pnpm --filter web build && node scripts/check-office-bundle.mjs"
        status: pass
      - kind: e2e
        ref: "e2e/office-disconnect.spec.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live FIFO pending queue: kind labels, accent wait after 10 min, Round n chip, auto-selection, next-on-leave, aria-live arrivals, title count, independent queue scroll, detail h2 + meta line"
    requirement: CEO-02
    verification:
      - kind: unit
        ref: "apps/web/src/ceo/view-model.test.ts (11 tests)"
        status: pass
      - kind: e2e
        ref: "e2e/ceo-dashboard.spec.ts (Task 2 tests, 4)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual polish of the dashboard at desktop, tablet and mobile widths"
    verification:
      - kind: other
        ref: "Playwright screenshots at 1280, 900 and 375 px (scratchpad only, not committed)"
        status: pass
    human_judgment: true
    rationale: "The screenshots were checked against the UI-SPEC by eye. Whether the result looks right is a judgement call"

duration: 19min
completed: 2026-09-24
status: complete
---

# Phase 6 Plan 14: CEO Dashboard Shell and Live Pending Queue Summary

**The `/ceo` page now checks sign-in through `/ceo/api/me` and follows the private `/ceo/ws` feed using the same `applyDecisionEvent` step the server folds with. It shows the pending decisions oldest first, keeps the selection stable, announces new arrivals and puts the count in the page title. The loading, empty, error, auth-failure and dev-bypass states match the UI-SPEC copy exactly, and the office route still loads nothing from `src/ceo/`.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-24T05:44:17Z
- **Completed:** 2026-09-24T06:03Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 9

## Accomplishments

- **Feed client (`ceo-feed.ts`).** Opens `ws(s)://<host>/ceo/ws` with no query string. It parses frames the same way `ws-client.ts` does and drops any event that fails `CompanyEventSchema`. It reconnects after 1 s, doubling to a 30 s cap, and reports Live, Reconnecting, then Offline after 30 s. `close()` cancels every timer.
- **Shell (`CeoApp.tsx`).** Fetches `me` first. A 401 or 403 shows only the auth-failure copy. Any other failure, or a feed that drops before the first snapshot, shows "Couldn't load decisions: {reason}. Check the API is running, then retry." with a Retry button that starts everything over. The header is 56px: "CEO desk", the accent pending badge (hidden at 0), Kibo Status with the status word, and the decider email. The dev-bypass banner, the "Pending (N)" tab, 3 skeleton rows plus the title-and-3-block detail skeleton, and the empty state are all in.
- **Queue (`QueueList.tsx` + `view-model.ts`).** One `<button>` per thread, with `aria-current="true"` on the selected one. Each shows agent · kind badge (the gated pattern in mono) · waited time (accent after 10 min), the title clamped to 2 lines, and a "Round n" chip. The first item is auto-selected. When the selected item leaves, the next one is chosen, else the previous one. New arrivals never take the selection and are announced as "New decision from {agent}: {title}".
- **Layout.** The queue column scrolls on its own: 360px at >= 1024px, 300px at 768-1023px, full width below 768px, where the detail opens with "Back to queue". The detail pane shows the title as the h2 and the meta line `{agent} · {task title} · {project} · waiting {duration} · #{id8}`.
- Continuous animations (the skeleton pulse and the Status ping) stop under `prefers-reduced-motion`.

## Task Commits

1. **Task 1 RED:** `d57d184` test(06-14): failing tests for the /ceo feed client and dashboard shell states
2. **Task 1 GREEN:** `a8e460c` feat(06-14): /ceo shell with auth gate, live feed status and loading/empty/error states
3. **Task 2 RED:** `cff5e32` test(06-14): failing tests for the pending queue view model and live queue e2e
4. **Task 2 GREEN:** `a57f249` feat(06-14): live FIFO pending queue with selection, arrival announcements and title count
5. **Fix:** `34a3867` fix(06-14): render the gated pattern name in mono inside the kind badge

## TDD Gate Compliance

- Task 1 RED: `npx vitest run src/ceo/ceo-feed.test.ts --reporter=tap-flat`, exit 1, 0 passing and 7 failing, all on assertions against the stub. Target `src/ceo/ceo-feed.test.ts > connectCeoFeed > reports Live, Reconnecting, then Offline after 30 s without reconnecting` returned **RED_EVIDENCE_OK (target_test_failed)**. The e2e run before the components: 6 failed, and 1 passed (the office-route guard, which was already true).
- Task 2 RED: `npx vitest run src/ceo/view-model.test.ts --reporter=tap-flat`, exit 1, 0 passing and 11 failing. Target `src/ceo/view-model.test.ts > kindLabel > names the gated pattern after the first ': ' for every gate format` returned **RED_EVIDENCE_OK (target_test_failed)**. The e2e run: the 4 new tests failed and the 7 existing ones passed.
- The records came from vitest `tap-flat` with the `# tests/# pass/# fail` counters counted from that same run's `ok`/`not ok` lines, using camelCase `exitCode`/`targetTest`. `targetTest` has to be the full TAP name including the `src/ceo/...test.ts >` prefix. Without the prefix the checker reports `no_target_test_failure`.
- Every GREEN commit comes after its RED commit.

## Verification

- `pnpm --filter web test`: 5 files, 42 tests passed.
- `pnpm --filter web typecheck`: exit 0.
- `pnpm --filter web build && node scripts/check-office-bundle.mjs`: "office bundle clean: 2 static chunk(s), Tailwind only in assets/CeoApp-*.css". The second static chunk is Rolldown's `rolldown-runtime` helper, split out now that CeoApp shares modules (event-schema, company-core) with the entry. It holds no dashboard code, and the manifest shows `index.html -> [rolldown-runtime]` with CeoApp as a dynamic import only.
- `npx playwright test e2e/ceo-dashboard.spec.ts e2e/office-disconnect.spec.ts`: 12 passed.
- `grep dangerouslySetInnerHTML apps/web/src/ceo`: no matches (T-06-14-01).
- Browser check: Playwright screenshots at 1280, 900 (dev bypass on) and 375 px, including the mobile detail view. These caught the amber "Back to queue" link, which is fixed below.

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] e2e fixture timestamps floored to the wrong minute**
- **Found during:** Task 2 GREEN e2e run
- **Issue:** fixtures at exactly N minutes ago rendered "29 min" instead of "30 min", because the browser clock runs a few ms behind the Node clock that built them.
- **Fix:** `minutesAgo` now places each fixture 30 s into its minute. The change is in the test only.
- **Commit:** a57f249

**2. [Rule 2 - UI-SPEC] "Back to queue" rendered in amber**
- **Found during:** Task 2 browser screenshot check
- **Issue:** the shadcn `link` button variant uses `text-primary`. The UI-SPEC reserves amber for six uses and says links are foreground and underlined.
- **Fix:** `text-foreground underline` on that button.
- **Commit:** a57f249

**3. [Rule 2 - UI-SPEC] The gated pattern name was not in mono**
- **Found during:** review against the UI-SPEC "Kind badge" line before writing this SUMMARY
- **Fix:** a small `KindBadge` in QueueList wraps the text after " · " in `font-mono`. The badge's text content is unchanged, so the e2e exact-text assertions still hold.
- **Commit:** 34a3867

**4. [Rule 2 - Accessibility] Continuous motion under reduced motion**
- **Issue:** the Kibo Status ping and the skeleton pulse animate forever. The UI-SPEC limits motion and turns it off under `prefers-reduced-motion`.
- **Fix:** one `@media (prefers-reduced-motion: reduce)` rule in ceo.css.
- **Commit:** a8e460c

**5. [Note] Small additions to the planned exports**
- `fetchMe`'s failure branch also carries `reason`, which feeds the load-error copy.
- `view-model.ts` also exports `detailMeta`, the pure meta-line builder. The e2e checks it by exact string.

**Total deviations:** 4 auto-fixed (1 Rule 1, 3 Rule 2), 1 note. **Impact:** no scope creep. The office route is untouched.

## Issues Encountered

- The first RED run hung: the backoff test's `while` loop never ended against the stub, which opens no new socket. The loop is now capped at 60 s of fake time, and the hung vitest processes were killed.
- `pnpm` ran fine for the spawned Vite server, so the `npx --yes pnpm@12.4.2` fallback was not needed.

## User Setup Required

None.

## Next Phase Readiness

- 06-09 adds the detail sections under the h2 and meta line in the `Decision detail` region. `selected.record` / `selected.earlier` are already in scope in CeoApp.
- 06-10 adds the History tab next to `Pending (N)` and puts `postDecision`/`postResume` in `api.ts`. Every POST must send `Content-Type: application/json` with a `{}` body at minimum, the exact Origin and `X-PixelFirm-CSRF: 1`.
- The e2e harness (`fakeMe`, `fakeFeed`, `requested`, `decided`, `snapshot`, `eventFrame`, `threeEvents`) is ready to extend.

---
*Phase: 06-ceo-dashboard-approval-workflow*
*Completed: 2026-09-24*

## Self-Check: PASSED
