---
phase: 06-ceo-dashboard-approval-workflow
fixed_at: 2026-09-24T23:59:00Z
review_path: .planning/phases/06-ceo-dashboard-approval-workflow/06-REVIEW.md
iteration: 1
findings_in_scope: 18
fixed: 17
skipped: 1
status: partial
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-09-24
**Source review:** .planning/phases/06-ceo-dashboard-approval-workflow/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 18 (2 Critical, 16 Warning; Info excluded, IN-01 deliberately untouched)
- Fixed: 17
- Skipped: 1 (WR-11, needs a user decision)

Every fix was test-first where practical. Each new test was run and seen failing before the fix, then passing after it. The exceptions are WR-14 and WR-15, which were checked in Docker instead (see below).

## Fixed Issues

### CR-01: Shell-running tools other than `Bash` bypass the CEO gate entirely

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`, `claude-code-runtime.ts`, `claude-code-runtime.test.ts`, `decision-request.ts`
**Commit:** ad3d873
**Applied fix:** `classifySignal` now runs the command patterns for `Bash`, `PowerShell` and `Monitor`. The reason text reads `<Tool> command matched ...`. `query()` gets `disallowedTools: ["RemoteTrigger"]`, because a remote agent's tool calls never reach `canUseTool`. I did not disallow `CronCreate` or `ScheduleWakeup`: their prompts run in the same session, so the gate still sees their tool calls. The decision title now shows the command for any shell tool, not only Bash.

### CR-02: `readDiff` runs repo-configured programs in the worker process, and they inherit `WORKER_TOKEN`

**Files modified:** `packages/git-adapter/src/git-env.ts` (new), `diff.ts`, `diff.test.ts`, `worktree.ts`, `commit.ts`
**Commit:** 5e90e1b
**Applied fix:** Every git process in git-adapter now runs with `extendEnv: false` and an environment that drops any key matching `token|secret|passw|credential|api_?key|^anthropic_`. The diff calls also pass `-c core.fsmonitor=false`. The new fail-first test configures an fsmonitor hook and a `filter.*.clean` driver. It first confirms that a plain `git diff` passes `WORKER_TOKEN` to both, then confirms that `readDiff` does not. Clean filters still run, because no flag disables them, but they no longer see any secret.

### WR-01: Destructive-op patterns miss common equivalent spellings

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`
**Commit:** 27442bb
**Applied fix:** These spellings are now gated:
- recursive forced deletes: `rm -fr`, `rm -r -f`, `rm -rfv`, `rm --recursive --force`, `Remove-Item -Recurse -Force`
- `git clean -f` / `--force`
- `DROP SCHEMA` and `TRUNCATE`
- git global options before the subcommand, such as `git -C dir reset --hard` and `git -c k=v rebase`
- the PowerShell forms of config writes: `Set-Content`, `Add-Content`, `Out-File`, `Copy-Item`, `Move-Item`, `New-Item`

Near misses stay ungated: `rm -r`, `rm -f`, `git clean -n`, `git log --grep merge`. **User to confirm:** `DROP SCHEMA`, `TRUNCATE` and `git clean -f` are new operations rather than new spellings. I counted them as inside the signed-off "destructive filesystem/DB/git" category.

### WR-02: Deploy-hook gating covers WebFetch but not `curl` in Bash

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`
**Commit:** bef5c08
**Applied fix:** There is a new `deploy hook` shell pattern. It gates `curl`, `wget`, `http(s)` (httpie), `iwr`, `irm` and `Invoke-WebRequest` / `Invoke-RestMethod` when the URL contains `webhook` or a `/hook(s)` path segment. A URL containing `deploy` was already gated by `publish/deploy`.

### WR-03: Gate-paths omit the files that control the agent and git

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`
**Commit:** 6b122cd
**Applied fix:** The gate-paths list now also covers `.claude/**`, `.mcp.json`, `.gitattributes`, `.git/config`, `.git/worktrees/*/config.worktree`, `.git/hooks/**` and `.git/info/attributes`. That applies to file tools and to shell writes. A new `git config write` pattern gates any `git config` that is not an explicit read (`--get*`, `--list`, `-l`, `get`, `list`). Side effect: a bare read such as `git config user.name` now parks. That errs closed.

### WR-04: A decision request that fails to post leaves the call parked forever, and nobody can see it

**Files modified:** `packages/claude-adapter/src/event-emitter.ts`, `claude-code-runtime.ts`, `claude-code-runtime.test.ts`
**Commit:** 398ea59
**Applied fix:** `postEvent` now returns `response.ok` and still never throws. `canUseTool` denies with "The CEO could not be reached; the tool call was not run." when the control plane did not accept `ceo.approval_requested`.

### WR-05: A fast decision can arrive before the broker registers the parked call, and the broker drops it

**Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`, `claude-code-runtime.test.ts`
**Commit:** 2b07211
**Status:** fixed: requires human verification (race-ordering logic)
**Applied fix:** `awaitDecision` is now registered before the request is posted. It gets `AbortSignal.any([sdkSignal, unpark])`. If the post is not accepted (WR-04), `unpark.abort()` withdraws the broker entry. An early rejection is silenced and handled when the promise is awaited. One existing assertion, that the passed signal is the SDK signal itself, was relaxed to "a live AbortSignal". The existing pauseTask test still proves that the abort reaches the park.

### WR-06: The diff shown to the CEO can hide exactly what a gated push sends

**Files modified:** `packages/git-adapter/src/diff.ts`, `diff.test.ts`, `packages/claude-adapter/src/claude-code-runtime.ts`, `claude-code-runtime.test.ts`, `packages/event-schema/src/payloads/index.ts`, `apps/web/src/ceo/DetailPane.tsx`
**Commit:** ab9bc52
**Applied fix:**
- **Base:** the merge-base with `@{upstream}`, then with `origin/HEAD`, then `HEAD`.
- **Untracked files:** listed from `ls-files --others --exclude-standard` by path with 0/0 counts. Their content is not in `unified`.
- **Unreadable diff:** the runtime sends `diff.unavailable: true`. This is a new optional schema field. The dashboard then says "The diff could not be read, so this request may change files not shown here." instead of "No file changes".

### WR-07: Invisible and bidi Unicode in tool input makes the "Runs on approve" view misleading

**Files modified:** `apps/web/src/ceo/view-model.ts`, `view-model.test.ts`, `DetailPane.tsx`, `ActionBar.tsx`
**Commit:** 5654d1b
**Applied fix:** A new `visibleText()` renders U+061C, U+200B-200F, U+202A-202E, U+2060-2069 and U+FEFF as `\uXXXX`. It is used for `toolInput` in both the detail pane and the approve dialog. I did not add the optional "refuse to park such inputs".

### WR-08: Reconcile writes a false "expired" audit record when only the outcome post was lost

**Files modified:** `apps/api/src/ws/worker-reconcile.ts`, `apps/api/src/routes/ceo-reconcile.test.ts`
**Commit:** 15cc1ec
**Status:** fixed: requires human verification (audit/state logic)
**Applied fix:** On a new bootId, a decided request is skipped (no expiry, no `blocked`) when the task has a `task.status_changed` other than `waiting_for_review` / `blocked` received after the decision. The comparison uses `received_at`, the control plane's own clock, so worker clock skew cannot affect it. If both the status and the outcome posts were lost, it still expires, as before. I did not build the retry outbox.

### WR-09: "running" is emitted when one parked call resolves, even if others are still parked

**Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`, `claude-code-runtime.test.ts`
**Commit:** 6a594ff
**Status:** fixed: requires human verification (state logic)
**Applied fix:** `running` is set and emitted only when the decided call is the last one parked (`parkedCount === 1` before the `finally` decrements it). One remaining edge case: if the last call to resolve expires rather than being decided, the status stays `waiting_for_review`, which is the existing D-02 behaviour.

### WR-10: A stream error leaves the task in `waiting_for_review` or `running` indefinitely

**Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`, `claude-code-runtime.test.ts`
**Commit:** f5aa13e
**Status:** fixed: requires human verification (state logic)
**Applied fix:** The stream `catch` sets and emits `blocked` when the invocation is still current, the status is not terminal, and it is not already `blocked`, so a watchdog abort does not emit twice. The fix exposed a test fixture problem: `chattyQuery` yielded a bare `{type:"assistant"}` that threw inside the runtime and silently ended the stream. I made it SDK-shaped.

### WR-12: The resume route records "resumed" before a send that can throw or be dropped

**Files modified:** `apps/api/src/routes/ceo.ts`, `apps/api/src/routes/ceo-reconcile.test.ts`
**Commit:** 9f3f222
**Status:** fixed: requires human verification (route ordering)
**Applied fix:**
- The `task.resume` frame is now `safeParse`d before anything is written. An invalid frame, such as an `agentId` over 200 characters, returns 409 `not resumable` instead of 500.
- The frame is sent before the event is inserted. If `sendToWorker` returns false, the route returns 503 and records nothing, so a resume can be retried.

### WR-13: `ceo.approval_requested.decisionId` is not unique

**Files modified:** `apps/api/drizzle/0005_ceo_request_once.sql` (new), `apps/api/src/routes/ceo.ts`, plus the migration lists in `ceo-decisions.test.ts`, `ceo-reconcile.test.ts`, `ws-browser.test.ts` and `auth/ceo-auth.test.ts`
**Commit:** 10f5f9f
**Applied fix:** A new partial unique index `events_ceo_request_once` on `payload->>'decisionId'` `WHERE type = 'ceo.approval_requested'`. `/events` already inserts with a bare `onConflictDoNothing`, so a reused id is a quiet duplicate and the first request keeps it. The decision lookup now has `.orderBy(events.receivedAt)`. This is a new migration file, not an edit to 0004, because 0004 is already applied (`IF NOT EXISTS` would skip it). **Deploy:** `apps/api/scripts/migrate.mjs` picks up 0005 on its own. It fails if staging already holds duplicate request ids.

### WR-14: `/ceo` is served with no anti-framing header

**Files modified:** `apps/web/nginx.conf`
**Commit:** e70784b
**Applied fix:** `/ceo*` responses now carry `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`. The headers are driven by a `map` on `$request_uri`. A `location /ceo` block would not work, because `try_files` does an internal redirect to `/index.html` and the headers would be lost. I checked the running config with `nginx:1.27-alpine` in Docker: `/ceo` and `/ceo/history` return both headers, and `/` returns neither. I scoped this to `/ceo` so the office route can still be embedded, for example as a stream overlay. The review suggested all of `location /`.

### WR-15: `.dockerignore` lets local agent config into the api image

**Files modified:** `.dockerignore`
**Commit:** 67ebbbe
**Applied fix:** `.dockerignore` now excludes `.claude`, `**/.claude`, `test-results`, `playwright-report`, `references`, `Brief.md` and `e2e`. `e2e` is not a pnpm workspace member. A throwaway `docker build` listed the context and confirmed none of these reach it.

### WR-16: The `diff.test.ts` merge-base test runs under vitest's 5s default timeout

**Files modified:** `packages/git-adapter/src/diff.test.ts`
**Commit:** e231fc1
**Applied fix:** `describe("readDiff", { timeout: 30_000 }, ...)`. The whole git-adapter suite now passes in the full parallel `pnpm -r test` run (18/18).

## Skipped Issues

### WR-11: After a restart, the env task re-runs from scratch alongside the CEO's resume in the same worktree

**File:** `apps/worker/src/index.ts:56-61` (with `env.ts:81`, `decisions.ts:109-132`)
**Reason:** Needs a user decision on how the env task behaves across restarts, which changes how the operator runs the worker:
- (a) require `WORKER_TASK_ID` and persist the ids of started tasks locally (where?), skipping `startTask` for an id already started;
- (b) make the env task one-shot, with the operator clearing it;
- (c) ask the control plane whether the task is blocked before starting it.

Each option also affects `scripts/verify-ceo-approval-live.mjs`, which uses `WORKER_TASK_PROMPT`. WR-12 has since stopped the route from recording a resume that never reached the worker. The worker-side silent refusal (`restoreTask` throws "task is running") is still unreported to the control plane.
**Original issue:** Every boot starts `env.task` again as a fresh session in the same worktree, while a CEO Resume of the old task can run alongside it. With `WORKER_TASK_ID` set, the resume silently does nothing but is still recorded as "resumed".

## Not implemented (orchestrator instruction)

- **IN-01** (Coolify MCP `action`-argument gating): left alone, as instructed. The user has not decided on it.

## Verification

All gates ran in the **main checkout** (`workflow.use_worktrees: false`, branch `main`). No worktree was created, and the numbers can be reproduced from this tree. Local Postgres was on port 5434.

- `pnpm -r --if-present typecheck`: **pass**. All six packages with a typecheck script are clean: event-schema, orchestration-adapter, claude-adapter, api, web, worker.
- `pnpm -r --no-bail --if-present test`: **one failing test, which I believe predates these fixes.**
  - Passing: event-schema 53/53, gsd-adapter 19/19, company-core 60/60, pixel-office 231/231, web 62/62, git-adapter 18/18, claude-adapter 120 passed / 3 skipped (the integration tests need a live claude), worker 39/39.
  - api: 125/126. The failure is `ws-browser.test.ts > first message is the decisions snapshot`. It is intermittent: the api suite passed 126/126 on one of two back-to-back runs and failed on the other.
  - Cause: the diff between the two sides is only the order of rows with equal `occurred_at`. Both the snapshot query (`ws-browser.ts:57`) and the test's `ceoRows()` sort by `occurred_at` alone, so tied rows come back in arbitrary order. The shared test database holds many rows written in the same millisecond.
  - I did not re-run this suite at the pre-fix commit, so I have not confirmed the failure predates the fixes. My new tests add ceo.* rows to that shared table, so they may make ties more frequent, but none of the fixes changes either sort order.
  - Suggested follow-up: add `events.id` as a tie-breaker in both queries.
- `packages/company-core` has type errors in `src/reducer.test.ts` (lines 258 and 348). None are in files I touched. That package has no typecheck script, so the gate above does not cover it.
- **Test database change:** the RED run of the WR-13 test stored one duplicate `ceo.approval_requested` in the local test database (`localhost:5434/pixelfirm_test`), and that duplicate blocked the new unique index. I deleted that one row, disabling the `events_append_only` trigger around the delete in a single transaction. No other database was touched.
- I did not push, deploy or commit this report.

---

_Fixed: 2026-09-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
