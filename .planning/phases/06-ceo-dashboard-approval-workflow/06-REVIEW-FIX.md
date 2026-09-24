---
phase: 06-ceo-dashboard-approval-workflow
fixed_at: 2026-09-25T00:00:00Z
review_path: .planning/phases/06-ceo-dashboard-approval-workflow/06-REVIEW.md
iteration: 3
findings_in_scope: 19
fixed: 19
skipped: 0
status: all_fixed
---

> **Iteration 2 (2026-09-25):** the user answered the four open decisions. WR-11 and IN-01 are now fixed, WR-03 was refined, and WR-01 was confirmed with no code change. See "Iteration 2 — user decisions" at the end. The iteration-1 sections below are left as written.
>
> **Iteration 3 (2026-09-25):** IN-01 now covers every Coolify MCP call. Reads pass, and everything else is gated, which fails closed. This replaces the "Not gated" list in iteration 2's IN-01 section. See "Iteration 3" at the end.

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

## Skipped Issues (iteration 1; WR-11 was fixed in iteration 2)

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

## Iteration 2 — user decisions

The user answered in chat on 2026-09-25. Each change was test-first: I ran the new tests, saw them fail, then applied the fix. There is one commit per finding.

### WR-01: "Keep gated" (no code change)

`DROP SCHEMA`, `TRUNCATE` and `git clean -f` stay gated, as committed in 27442bb. The user confirmed they belong to the signed-off "destructive filesystem/DB/git" category.

### WR-03: "Allow bare reads"

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`
**Commit:** ca0a2a7
**Status:** fixed: requires human verification (classifier logic)
**Applied fix:** A `git config` call is now a read only in these forms:
- scope/display options (`--global`, `--system`, `--local`, `--worktree`, `--show-origin`, `--show-scope`, `--name-only`, `--null`/`-z`, `--includes`, `--file`/`-f <path>`, `--type <t>`), then either an explicit read op (`--get*`, `--list`, `-l`, `get`, `list`) or one bare key that ends the command;
- the command may end with a newline, `;`, `|`, `&` or `)`.

Everything else is gated:
- a key plus a value
- `--add`, `--unset*`, `--replace-all`, `--rename-section`, `--remove-section`, `--edit`/`-e`, `set`, `unset`
- a key that is quoted or contains `$`, a backtick or parentheses
- a redirect after the key
- any `git config` under `-c` or `--config-env`, read or not. This check is case-sensitive so that `git -C <dir> config <key>` stays a read.

**Iteration-1 hole, also fixed here:** the old rule accepted a read op anywhere in the command. Git accepts options after arguments, and I confirmed on git 2.55 that these commands write:
- `git config core.pager x --list` wrote `core.pager=x`;
- `git config core.fsmonitor list` wrote the value `list`.

Both were ungated before. Read ops must now come first, after the options. One side effect: rarer read forms such as `git config --default x --get k` now park. That errs closed.

### WR-11: option (a) "Local started-task record"

**Files modified:** `apps/worker/src/env.ts`, `env.test.ts`, `index.ts`, `index.test.ts` (new), `started-tasks.ts` (new), `started-tasks.test.ts` (new), `scripts/verify-ceo-approval-live.mjs`
**Commit:** f339085
**Status:** fixed: requires human verification (restart behaviour)
**Applied fix:**
- **Task id is required:** `WORKER_TASK_PROMPT` now requires `WORKER_TASK_ID`, and the generated-uuid fallback is gone.
- **The record:** `claimTaskStart` keeps `started-tasks.json`, a JSON list of task ids, in `WORKER_STATE_DIR`. The default is `~/.pixelfirm/worker`. `loadEnv` rejects a state dir inside the worker repo.
- **Atomic write:** the record is written to a temp file and renamed into place. This happens before `startTask`, so a crash between the two loses the start instead of risking a second one.
- **Unreadable record:** a record that is not a list of strings throws. That fails the boot before any timer starts.
- **On restart:** a task id already in the record is not started again. The worker logs that it should be resumed from /ceo.
- **Test:** the new `index.test.ts` boots the worker twice with the same state dir and asserts that `startTask` ran once. I confirmed it fails against the old `index.ts`.
- **Live script:** it already set a unique `WORKER_TASK_ID` for each run. It now also passes a per-run temp `WORKER_STATE_DIR`, which is removed in `finally`, so it never writes to `~/.pixelfirm`. I did not run the live script. I only checked it with `node --check`.
- **Known limits:**
  - There is no lock between two worker processes that share a state dir.
  - The record only grows, by one id per operator launch.
  - The agent runs as the same OS user, so it could still write to `~/.pixelfirm` through an absolute path. The record is outside the worktree, but that does not make it tamper-proof.

### IN-01: "Gate them"

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`
**Commit:** 45f00d4
**Applied fix:**
- **The three tools:** `mcp__coolify__service`, `mcp__coolify__application` and `mcp__coolify__env_vars` are gated on every action except `list`, `get` and `list_containers`. A missing or unknown action is gated too.
- **How I got the action lists:** from the installed `@masonator/coolify-mcp` 3.5.1 schema.
  - `application`'s enum has no read action at all, so every call parks.
  - `service` parks everything except `list_containers`, including `start_application` and `update`.
  - `env_vars` parks everything except `list`.
- **Any MCP tool:** the review's generic rule was also added. An MCP tool is gated when its string `action` contains a destructive word. This catches `mcp__coolify__control` `stop`/`restart` and `mcp__coolify__database` `delete`.
- **Reason text:** `MCP tool: <name> (action: <action>)`.

**Not gated. Say if you want these too:**
- `mcp__coolify__control` with `action: "start"`;
- `mcp__coolify__bulk_env_update`, a separate tool whose name has no destructive word;
- the `create`/`update` actions of other coolify tools such as `database`, `storages` and `scheduled_tasks`.

They stay in the signed-off "innocuously named MCP tool" residual. The header comment now says so.

### Iteration 2 verification

All gates ran in the **main checkout** (`workflow.use_worktrees: false`, branch `main`), with local Postgres on port 5434.

- `pnpm -r --if-present typecheck`: **pass**. All six packages are clean.
- `pnpm -r --no-bail --if-present test`: I ran it **twice** and both runs passed with identical counts:

| Package | Result |
|---|---|
| event-schema | 53/53 |
| gsd-adapter | 19/19 |
| company-core | 60/60 |
| pixel-office | 231/231 |
| web | 62/62 |
| api | 126/126 |
| git-adapter | 18/18 |
| claude-adapter | 170 passed, 3 skipped (the live-claude integration tests) |
| worker | 46/46 |

  The iteration-1 `ws-browser` snapshot flake did not recur. It was addressed separately in 210f9ce and ab07acf.
- `~/.pixelfirm` does not exist after both runs, so no test wrote to the default state dir.
- I did not push, deploy, run the live script or commit this report.

## Iteration 3 — IN-01 widened to every Coolify MCP call

The user decided in chat on 2026-09-25: "reading is always fine, only edit/delete". So any Coolify MCP call that changes something now waits for the CEO, and read-only calls go through without asking. I wrote the tests first and watched 35 of them fail, then applied the fix. It is one commit.

### IN-01: gate every Coolify call that is not a known read

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`, `signal-detection.test.ts`
**Commit:** 28e9e45
**Status:** fixed: requires human verification (classifier logic)
**Applied fix:**
- **It is an allowlist.** Any tool matching `mcp__*coolify*__<tool>` is let through in only two cases. Either `<tool>` is one of the 22 read-only tools, or it is one of the 18 tools that take an `action` argument and the call's `action` is on that tool's read list. Everything else is gated:
  - an unknown tool;
  - a missing, unknown, non-string or wrong-case action;
  - an `action` passed to a tool that takes none (for example `deploy` with `action: "list"`).
  The lists are kept in a `Map`, so an unexpected tool name such as `constructor` also parks.
- **Where the lists come from:** I loaded the installed `@masonator/coolify-mcp` 3.5.1 (`npx` cache), created a `CoolifyMcpServer` and read back its registered tools. Read tools are those with `readOnlyHint: true`, plus the fleet-only `list_instances`. Each action list is the tool's `zod` enum. The test table has all 127 tool/action pairs. A script compared it with the package's registrations and found no differences.
- **Newly gated:**
  - `bulk_env_update`, `validate_server`, `control` `start`, `deployment` `cancel`
  - every create/update/move action
  - `database_backups` / `storages` backup actions, `scheduled_tasks` `run_once`, `hetzner` `create_server`, `system` `enable_api`/`disable_api`, `tags` `attach`/`detach`, `cloud_tokens` `validate`
- **Newly ungated:** reads that the destructive-word rule used to catch because their names contain "deploy": `list_deployments`, and `deployment` `get` / `list_for_app`.
- **Other MCP tools:** unchanged. The Coolify check runs first and returns a result. Any other MCP tool still falls through to the destructive-word rule on its name and its `action`.
- **Reason text:**
  - action tools: `MCP tool: <name> (action: <action>)`;
  - other gated tools: `MCP tool: <name>`, the same as before for `mcp__coolify__deploy`.

**Calls I had to make a judgement on (say if you disagree):**
- **Gated:**
  - `validate_server`: it is not annotated read-only, and Coolify's server validation can install Docker on the host.
  - `cloud_tokens` `validate`: it is a POST to the Coolify API. I did not check whether it changes anything, so it fails closed.
- **Ungated:**
  - `server_domains` is annotated read-only in 3.5.1, even though the request mentioned it next to the write tools.
  - `environments` `verify_app` only makes GETs.
  - `get_application` / `get_database` / `get_service` / `env_vars` `list` with `reveal: true` return credentials in plaintext. That is still a read, so it is ungated under this decision.
- **Version drift:** a Coolify MCP that adds a read tool or read action later will park it until the list is updated. That errs closed. The older 2.19.4 package in the `npx` cache was not used. Any tool name it has that 3.5.1 lacks is gated.

### Iteration 3 verification

All gates ran in the **main checkout** (`workflow.use_worktrees: false`, branch `main`), with local Postgres on port 5434.

- `pnpm --filter claude-adapter typecheck`: **pass**.
- `pnpm -r --no-bail --if-present test`: I ran it **once** and it **passed**:

| Package | Result |
|---|---|
| event-schema | 53/53 |
| gsd-adapter | 19/19 |
| company-core | 60/60 |
| pixel-office | 231/231 |
| web | 62/62 |
| api | 126/126 |
| git-adapter | 18/18 |
| claude-adapter | 279 passed, 3 skipped (the live-claude integration tests; the rise from 170 is the new Coolify table) |
| worker | 46/46 |

- `~/.pixelfirm` does not exist after the run.
- I did not push, deploy or commit this report.

---

_Fixed: 2026-09-24 (iteration 1), 2026-09-25 (iterations 2 and 3)_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
