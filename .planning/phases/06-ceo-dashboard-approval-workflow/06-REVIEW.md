---
phase: 06-ceo-dashboard-approval-workflow
reviewed: 2026-09-24T00:00:00Z
depth: standard
files_reviewed: 82
files_reviewed_list:
  - .dockerignore
  - apps/api/Dockerfile
  - apps/api/drizzle/0004_ceo_decision_once.sql
  - apps/api/src/auth/ceo-auth.ts
  - apps/api/src/auth/csrf.ts
  - apps/api/src/env.ts
  - apps/api/src/routes/ceo.ts
  - apps/api/src/routes/events.ts
  - apps/api/src/routes/ws-browser.ts
  - apps/api/src/routes/ws.ts
  - apps/api/src/server.ts
  - apps/api/src/ws/browser-connections.ts
  - apps/api/src/ws/worker-connections.ts
  - apps/api/src/ws/worker-reconcile.ts
  - apps/web/Dockerfile
  - apps/web/nginx.conf
  - apps/web/src/App.tsx
  - apps/web/src/ceo/ActionBar.tsx
  - apps/web/src/ceo/CeoApp.tsx
  - apps/web/src/ceo/DetailPane.tsx
  - apps/web/src/ceo/DiffView.tsx
  - apps/web/src/ceo/HistoryTable.tsx
  - apps/web/src/ceo/QuestionsForm.tsx
  - apps/web/src/ceo/QueueList.tsx
  - apps/web/src/ceo/api.ts
  - apps/web/src/ceo/ceo-feed.ts
  - apps/web/src/ceo/view-model.ts
  - apps/web/src/components/kibo-ui/choicebox/index.tsx
  - apps/web/src/components/kibo-ui/status/index.tsx
  - apps/web/src/lib/utils.ts
  - apps/web/src/main.tsx
  - apps/web/vite.config.ts
  - apps/worker/src/decisions.ts
  - apps/worker/src/env.ts
  - apps/worker/src/index.ts
  - packages/claude-adapter/src/claude-code-runtime.ts
  - packages/claude-adapter/src/decision-mapping.ts
  - packages/claude-adapter/src/decision-request.ts
  - packages/claude-adapter/src/index.ts
  - packages/claude-adapter/src/signal-detection.ts
  - packages/company-core/src/decisions.ts
  - packages/company-core/src/index.ts
  - packages/event-schema/src/downlink.ts
  - packages/event-schema/src/index.ts
  - packages/event-schema/src/payloads/index.ts
  - packages/git-adapter/src/diff.ts
  - packages/git-adapter/src/index.ts
  - packages/orchestration-adapter/src/types.ts
  - packages/pixel-office/src/ceo/ceo-queue.ts
  - packages/pixel-office/src/constants.ts
  - packages/pixel-office/src/engine/characters.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/layout/officeLayout.ts
  - scripts/check-office-bundle.mjs
  - scripts/verify-ceo-approval-live.mjs
  - scripts/verify-pixel-office-live.mjs
  - e2e/ceo-dashboard.spec.ts
  - e2e/ceo-staging.spec.ts
  - apps/api/src/auth/ceo-auth.test.ts
  - apps/api/src/routes/ceo-decisions.test.ts
  - apps/api/src/routes/ceo-reconcile.test.ts
  - apps/api/src/routes/ws-browser.test.ts
  - apps/api/src/ws/browser-connections.test.ts
  - apps/web/src/App.test.tsx
  - apps/web/src/ceo/ceo-feed.test.ts
  - apps/web/src/ceo/view-model.test.ts
  - apps/worker/src/decisions.test.ts
  - apps/worker/src/env.test.ts
  - apps/worker/src/index.integration.test.ts
  - packages/claude-adapter/src/claude-code-runtime.test.ts
  - packages/claude-adapter/src/decision-mapping.test.ts
  - packages/claude-adapter/src/decision-request.test.ts
  - packages/claude-adapter/src/signal-detection.test.ts
  - packages/company-core/src/decisions.test.ts
  - packages/company-core/src/reducer.test.ts
  - packages/event-schema/src/payloads/index.test.ts
  - packages/git-adapter/src/diff.test.ts
  - packages/pixel-office/src/ceo/ceo-queue.test.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/index.test.ts
  - packages/pixel-office/src/layout/officeLayout.test.ts
findings:
  critical: 2
  warning: 16
  info: 5
  total: 23
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-09-24
**Depth:** standard
**Files Reviewed:** 82
**Status:** issues_found

## Summary

Reviewed the Phase 6 CEO approval path end to end: classifier and SDK gate, worker broker and resume, control-plane decision/resume routes, downlink and reconcile, Access/CSRF auth, the private feed filter, the dashboard, and the deploy artifacts.

The auth layer is solid. `requireCeo` verifies the Access JWT in-process (RS256, iss/aud, email pinned). The dev bypass needs the flag, a loopback TCP peer (not `request.ip`), and a non-production `NODE_ENV`, and the Dockerfile sets `NODE_ENV=production`. CSRF needs an exact Origin, a custom header and a JSON content type. Fastify's `hookIterator` stops at `reply.sent`, so `requireOrigin` not returning `reply` is safe. The downlink is a closed zod schema, approve always returns the parked input by reference, and PRIVATE filtering is applied on both the snapshot and the live relay.

The two blockers are in the gate itself:

1. The classifier only inspects commands for a tool literally named `Bash`. The bundled CLI also ships `PowerShell` and `Monitor`, both of which run shell commands, and neither is classified.
2. `readDiff` runs repo-configured programs inside the worker process with the full worker environment, including `WORKER_TOKEN`. I reproduced this locally with `core.fsmonitor` and with a `filter.*.clean` driver.

Most warnings are liveness and integrity gaps: a parked call can hang forever with nothing visible, the audit trail can be wrong, and the diff shown to the CEO can be misleading. None of them auto-approve anything.

## Critical Issues

### CR-01: Shell-running tools other than `Bash` bypass the CEO gate entirely

**File:** `packages/claude-adapter/src/signal-detection.ts:90-116` (consumed at `packages/claude-adapter/src/claude-code-runtime.ts:289-290` and `:398`)
**Issue:** `classifySignal` applies `CEO_GATED_BASH_PATTERNS` only when `toolName === "Bash"`. Any other tool falls through to `return null`, and `canUseTool` then returns `allow`. The PreToolUse hook uses the same classifier, so it does not "ask" either. The bundled CLI (`claude-agent-sdk-win32-x64@0.3.278/claude.exe`) contains:
- a `PowerShell` tool. It is enabled by `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`, which the agent can set through `.claude/settings*.json` `env`; see WR-03. It is also used when Git Bash is missing. The worker host here is win32.
- a `Monitor` tool whose input has a free-form `command` field (`sdk-tools.d.ts` `MonitorInput.command`: "Shell command or script").

So `PowerShell({command: "git push origin main"})` or `Monitor({command: "git push origin HEAD:main", ...})` runs with no CEO decision. `RemoteTrigger` (run or create a remote agent) is also unclassified and runs entirely outside this gate. This is fail-open on unknown tools. It is not the accepted "narrow" MCP rule, which covers only `mcp__*` names.
**Fix:** Classify on the input shape as well as the name, and explicitly disallow the tools the gate cannot reason about:
```ts
// signal-detection.ts
const SHELL_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);
if (SHELL_TOOLS.has(toolName)) {
  if (typeof fields.command !== "string") return null;
  const command = fields.command.replaceAll("\\", "/");
  ...
}
// claude-code-runtime.ts query options
disallowedTools: ["RemoteTrigger", "CronCreate", "ScheduleWakeup"],
```
Add a test for each shell tool name with a push-to-main command.

### CR-02: `readDiff` runs repo-configured programs in the worker process, and they inherit `WORKER_TOKEN`

**File:** `packages/git-adapter/src/diff.ts:13, 34, 43, 68, 72`
**Issue:** `BASE_ARGS` (`--no-ext-diff --no-textconv --no-color`) blocks only `diff.external` and textconv. `git diff <base>` against the working tree still:
- runs `core.fsmonitor`, if it is set to a hook path;
- runs `filter.<name>.clean` for any path whose `.gitattributes` names a filter.

I reproduced both on this machine with git 2.55. The hook and the clean filter each wrote a secret env var to a file during `git diff --no-ext-diff --no-textconv --no-color HEAD --`.

execa inherits `process.env`, so these programs get `WORKER_TOKEN`. `STRIPPED_ENV_KEYS` (claude-code-runtime.ts:79-88) exists precisely so the agent can never read that token. The agent can set either config through an ungated `git config ...` Bash call or a Write to `.gitattributes`. The runtime then runs `readDiff` for the agent on its very next gated call (claude-code-runtime.ts:318). With the token the agent can:
- open `/ws` as the worker, which replaces the registered socket (worker-connections.ts:11-13) and takes over decision delivery;
- send a hello with a fresh bootId, which expires every open request;
- post forged `task.status_changed` / `ceo.approval_requested` / `ceo.approval_expired` events.

Caveat: a same-uid agent can also read the parent's environment on Linux through `/proc/$PPID/environ`, so the env strip alone was never a hard boundary. This finding is about the module's own stated Pitfall-10 guarantee, which does not hold.
**Fix:** Neutralise the config and scrub the environment for every git call in this module. The same env scrub belongs in listWorktrees and the poll loop.
```ts
const BASE_ARGS = ["--no-ext-diff", "--no-textconv", "--no-color"];
const SAFE_CONFIG = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "WORKER_TOKEN"));
execa("git", [...SAFE_CONFIG, "diff", ...BASE_ARGS, ...], { cwd, env: gitEnv, extendEnv: false });
```
There is no single flag that disables attribute filters. Either compare index to tree only, or run git with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1` and a scrubbed env, so any filter that does run gets no secret. Add a fail-first test mirroring the existing diff.external one.

## Warnings

### WR-01: Destructive-op patterns miss common equivalent spellings

**File:** `packages/claude-adapter/src/signal-detection.ts:57-58, 62`
**Issue:** `/\brm\s+-rf\b/` does not match `rm -fr`, `rm -r -f`, `rm -rfv` (there is no `\b` between `f` and `v`), or `rm --recursive --force`. `DROP\s+(TABLE|DATABASE)` misses `DROP SCHEMA ... CASCADE` and `TRUNCATE`. `\bgit\s+reset` misses `git -C <dir> reset --hard`. `git clean -fdx` is not gated at all. None of these are in the signed-off residual list in the header comment.
**Fix:** Use `/\brm\s+(?:-\S*\s+)*-\w*(?:r\w*f|f\w*r)\w*\b|\brm\b[^|;&]*--recursive/i`, extend the DB pattern to `DROP\s+(TABLE|DATABASE|SCHEMA)|\bTRUNCATE\b`, allow `git\b[^|;&]*\breset\b[^|;&]*--hard`, and add `\bgit\b[^|;&]*\bclean\b[^|;&]*-\w*f`. Add a test row for each spelling.

### WR-02: Deploy-hook gating covers WebFetch but not `curl` in Bash

**File:** `packages/claude-adapter/src/signal-detection.ts:46, 59, 105-110`
**Issue:** `DEPLOY_HOOK_URL` (webhook, /hook(s)/) is checked only for `WebFetch`, which sends GET without custom auth. The practical trigger is `curl -X POST https://…/webhooks/…` or `/hooks/…` from Bash, and the Bash patterns check only `\bdeploy\b`. The header comment describes the residual as a URL containing none of deploy, webhook or /hook(s)/, which implies the rule applies to all fetch paths.
**Fix:** In the Bash branch, also test `DEPLOY_HOOK_URL` against any `https?://\S+` in a command that contains `curl|wget|Invoke-WebRequest|iwr|http`.

### WR-03: Gate-paths omit the files that control the agent and git

**File:** `packages/claude-adapter/src/signal-detection.ts:32-42`; `packages/claude-adapter/src/claude-code-runtime.ts:259-278`
**Issue:** `settingSources` is omitted, which per sdk.d.ts means all sources are loaded, so the worktree's `.claude/settings.json` and `.claude/settings.local.json` apply on every resume or send. The agent can Write those files ungated and add:
- command `hooks`, which run shell commands outside `canUseTool`;
- `env`, for example `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` (see CR-01) or `CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS`, which re-injects a key the runtime strips on purpose;
- possibly `disableAllHooks`, which could switch off the PreToolUse "ask" that stops settings allow rules from pre-approving gated calls.

The same applies to `.mcp.json` (new MCP servers), `.git/config` (see CR-02) and `.git/hooks/*` (run by an ungated `git commit`). These are direct writes, not the accepted "indirect writes" residual.
**Fix:** Add `(?:^|/)\.claude/`, `\.mcp\.json`, `(?:^|/)\.git/(?:config|hooks/)`, and `\.gitattributes` to `PRODUCTION_CONFIG_PATTERNS`. Also gate `git config` writes in Bash.

### WR-04: A decision request that fails to post leaves the call parked forever, and nobody can see it

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:319-343`; `packages/claude-adapter/src/event-emitter.ts` (`postEvent`)
**Issue:** `postEvent` never throws and returns nothing. It swallows network errors, the 10s timeout, 4xx (for example a 400 from a payload the schema rejects) and 5xx. `canUseTool` then calls `awaitDecision` regardless. The dashboard has no row, and `reconcileWorker` cannot expire a request that was never stored. The watchdog is suspended (`parkedCount > 0`), so the task hangs until the process restarts. The decision-request.ts header already names this as the failure to avoid.
**Fix:** Have `postEvent` return `response.ok` and fail closed when the request is not accepted:
```ts
const accepted = await postPrivate(taskId, "ceo.approval_requested", ...);
if (!accepted) return { behavior: "deny", message: "The CEO could not be reached; the tool call was not run." };
```

### WR-05: A fast decision can arrive before the broker registers the parked call, and the broker drops it

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:319-343`; `apps/worker/src/decisions.ts:74-76`
**Issue:** The request is posted and awaited first, and only then is `awaitDecision` registered. The control plane broadcasts the request to the dashboard before it returns 202 to the worker (events.ts:123-126). A decision POSTed in that window reaches `handleDownlink` while `pending` has no entry, and the broker ignores it silently. The route has already returned 202 and recorded `ceo.decision_made`. The call then stays parked until a same-bootId reconnect redelivers the decision, which may never happen on a healthy socket. This is unlikely with a human CEO, but the automated live proof or a slow `/events` response (up to 10s) widens the window.
**Fix:** Register first, then post, then await:
```ts
const decisionPromise = options.awaitDecision(parked.decisionId, signal);
await postPrivate(taskId, "ceo.approval_requested", ...);
decision = await decisionPromise;
```

### WR-06: The diff shown to the CEO can hide exactly what a gated push sends

**File:** `packages/git-adapter/src/diff.ts:43-46, 66-74`; `packages/claude-adapter/src/claude-code-runtime.ts:57-64`; `apps/web/src/ceo/DetailPane.tsx:61-68`
**Issue:** There are three problems:
- With no upstream (a fresh feature branch), the base is `HEAD`. A gated `git push origin HEAD:main` then shows only uncommitted changes, usually none, while the push sends every local commit.
- Untracked files never appear.
- Any failure, including a diff over the 8 MiB `maxBuffer`, becomes "no diff" (`readDiffOrNothing`).

In all three cases the dashboard shows "No file changes attached to this request." That reads as "this change is empty" on the approval most likely to deploy (CEO-02, D-09).
**Fix:** With no upstream, diff against `origin/HEAD` or the default branch's merge-base. Include `git ls-files --others --exclude-standard` in the file list. On error, return a `{ error: "diff unavailable" }` marker so the UI can say "Diff could not be read". Do not show the no-changes copy in that case.

### WR-07: Invisible and bidi Unicode in tool input makes the "Runs on approve" view misleading

**File:** `apps/web/src/ceo/DetailPane.tsx:24-26`; `apps/web/src/ceo/ActionBar.tsx:151-153`
**Issue:** `toolInput` is `JSON.stringify(input)`, which escapes only C0 control characters. U+202E/U+2066-2069 (bidi overrides), U+200B-U+200F and U+FEFF render raw inside the `<pre>`. A prompt-injected agent can make the displayed command read differently from what runs (the "Trojan Source" technique). React text nodes stop XSS, not this.
**Fix:** Before rendering, replace such characters with visible escapes:
```ts
const visible = (s: string) => s.replace(/[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
```
Consider refusing to park inputs that contain them, in the same place as the 16,000-character refusal.

### WR-08: Reconcile writes a false "expired" audit record when only the outcome post was lost

**File:** `apps/api/src/ws/worker-reconcile.ts:64-118`; `packages/claude-adapter/src/claude-code-runtime.ts:365-372`
**Issue:** A request counts as "closed" only through `ceo.decision_applied` or `ceo.approval_expired`, and the runtime posts both with the swallow-all `postPrivate`. Suppose one POST fails (a network blip), the approved call runs, and the worker later restarts. The next hello then:
- appends `ceo.approval_expired {reason: "worker_restarted"}`, so the dashboard says the request expired because the worker restarted before the CEO decided;
- appends `task.status_changed blocked`, even if the task has since completed;
- offers Resume.

That is a wrong audit trail (CEO-05) and a wrong task state.
**Fix:** Retry outcome events until acknowledged (a small persisted outbox), or have reconcile skip the `blocked` transition when a newer `task.status_changed` exists for the task. Also word the expiry copy as "outcome not confirmed" when a `ceo.decision_made` exists.

### WR-09: "running" is emitted when one parked call resolves, even if others are still parked

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:310, 365-366, 374-376`
**Issue:** The runtime counts concurrent parked calls (`parkedCount`) but sets `record.status = "running"` and emits it as soon as any one decision is applied. If two calls are parked (the counter exists because this is expected), the first decision walks the agent out of the CEO room and marks the task running while the dashboard still shows a pending decision.
**Fix:** Emit `running` only when `parkedCount` reaches 0 after the decrement, and move the status emit into `finally` behind that check.

### WR-10: A stream error leaves the task in `waiting_for_review` or `running` indefinitely

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:536-540`
**Issue:** When the Claude subprocess dies mid-park, the parked call's signal aborts, `ceo.approval_expired {aborted}` is posted, and the for-await throws into a catch that only logs. The runtime never emits a terminal or `blocked` status. The office keeps the agent in the CEO queue (`waiting_for_ceo`) forever, and the control-plane status is stale. Phase 6 makes this visible because the agent physically waits in the CEO room.
**Fix:** In the catch, when `isCurrent()`, set `record.status = "blocked"` (or `"failed"`) and `await emitStatus(taskId, record.status)`.

### WR-11: After a restart, the env task re-runs from scratch alongside the CEO's resume in the same worktree

**File:** `apps/worker/src/index.ts:56-61`; `apps/worker/src/env.ts:81`; `apps/worker/src/decisions.ts:109-132`
**Issue:** On every boot, `startWorker` starts `env.task` again: a fresh session with the original prompt and `worktreePath: env.repoPath`. The taskId is new unless `WORKER_TASK_ID` is set. Reconcile blocks the old task, and a CEO Resume then calls `restoreTask` and `resumeTask` for the old taskId in the same directory. Two Claude sessions edit the same worktree at once. If `WORKER_TASK_ID` is set, `restoreTask` throws "task is running" instead, and the CEO's resume silently does nothing: the route still returns 202 and records "resumed".
**Fix:** Persist started task ids (or require an explicit `WORKER_TASK_ID`) and skip `startTask` when the control plane reports that task as blocked. Or make the env task a one-shot the operator clears.

### WR-12: The resume route records "resumed" before a send that can throw or be dropped, with no redelivery

**File:** `apps/api/src/routes/ceo.ts:234-248`; `packages/event-schema/src/downlink.ts:24`
**Issue:** `ceo.task_resume_requested` is inserted first. Then `sendToWorker` calls `WorkerDownlinkSchema.parse`, which throws on an `agentId` over 200 characters (`sourceAgentId` is uncapped in the envelope) and turns the request into a 500. Separately, if the socket closes between the connectivity check and the send, `sendToWorker` returns `false` and the route still answers 202. Reconcile redelivers decisions but never resumes. In both cases the next attempt gets 409 "already resumed", and `isResumable` hides the button for good.
**Fix:** Parse and validate the downlink message before inserting. Insert only when `sendToWorker(...)` returns `true`, or return 503 without inserting when it returns `false`.

### WR-13: `ceo.approval_requested.decisionId` is not unique, and the decision route picks an arbitrary row

**File:** `apps/api/src/routes/ceo.ts:69-75`; `apps/api/drizzle/0004_ceo_decision_once.sql:7-9`; `apps/api/src/routes/events.ts:59-62`
**Issue:** Any valid worker credential can post a `ceo.approval_requested` that reuses another request's `decisionId`. The worker picks the id itself. The route's lookup uses `.limit(1)` with no `ORDER BY`, so which row, and therefore which `workerId`, receives the CEO's decision is unspecified. The dashboard fold keeps the first-seen row, so what the CEO sees and where the decision goes can diverge. Combined with CR-02, the agent can hold a worker credential.
**Fix:** Add `'ceo.approval_requested'` to the `events_ceo_decision_once` partial index, so a duplicate becomes a quiet conflict. Add `.orderBy(events.occurredAt)` to the lookup.

### WR-14: `/ceo` is served with no anti-framing header

**File:** `apps/web/nginx.conf:15-19`
**Issue:** There is no `X-Frame-Options` or `Content-Security-Policy: frame-ancestors`. Whether a hostile page can frame an authenticated dashboard and clickjack "Approve and run" depends on the Access cookie's SameSite setting, which is set in the Cloudflare app config, not in code. This is defence in depth for the most sensitive button in the product.
**Fix:** In `location /`, add `add_header Content-Security-Policy "frame-ancestors 'none'" always;` and `add_header X-Frame-Options DENY always;`. They are needed there because `add_header` in a location replaces the inherited headers.

### WR-15: `.dockerignore` lets local agent config, including a token in a permission rule, into the api image

**File:** `.dockerignore:1-12`; `apps/api/Dockerfile:8`
**Issue:** The API image does `COPY . .` and ships the whole context. `.claude/` is not excluded, and the local `.claude/settings.local.json` contains a hex token inline in an allowed Bash command. `.claude/worktrees/`, `test-results/`, `references/` and `Brief.md` are included too. Coolify builds from git, where that file is ignored, but a local `docker build` bakes it in.
**Fix:** Add `.claude`, `**/.claude`, `test-results`, `playwright-report`, `references`, `Brief.md` and `e2e` to `.dockerignore`.

### WR-16: The `diff.test.ts` merge-base test runs under vitest's 5s default timeout

**File:** `packages/git-adapter/src/diff.test.ts:88-105`
**Issue:** There is no vitest config in `packages/git-adapter`, so the test uses the default `testTimeout` of 5000 ms. The test does about 15 sequential git process spawns: init, 2x config, add, commit, clone, 2x config, add, commit, then `readDiff`'s rev-parse, merge-base and two diffs. On Windows under full parallel load each spawn can take hundreds of ms, which explains why it passes in isolation and times out in the full run. Yes, the timeout is too tight.
**Fix:** Use `describe("readDiff", { timeout: 30_000 }, () => { ... })`, or add a `vitest.config.ts` with `test: { testTimeout: 30_000 }` for this package.

## Info

### IN-01: Coolify MCP `action`-argument gap (user decision pending)

**File:** `packages/claude-adapter/src/signal-detection.ts:47, 112-114`
**Issue:** The coolify MCP groups operations behind one tool with an `action` argument (for example `deploy`, `delete`, `restart`). The narrow rule checks only the tool name, so `mcp__coolify__<tool>({action: "deploy"})` is not gated unless the tool name itself contains a destructive word.
**Fix:** If accepted later: for `mcp__*` tools, also test `DESTRUCTIVE_MCP_NAME` against a string `input.action`.

### IN-02: Answers are keyed by full question text, but the dashboard shows it truncated

**File:** `packages/claude-adapter/src/decision-request.ts:127`; `packages/claude-adapter/src/decision-mapping.ts:54-62`
**Issue:** `copyQuestions` cuts `question` to 2000 characters, and the dashboard keys answers by that text. `validateAnswers` then compares against the untruncated parked text, finds a mismatch, and denies with `ANSWERS_MISMATCH`, so a long question can never be answered. Duplicate question texts or option labels also collapse.
**Fix:** Key answers by question index on the wire and map back to the parked text in the worker. Or refuse to park a question over 2000 characters.

### IN-03: Diff display inaccuracies

**File:** `apps/web/src/ceo/DiffView.tsx:28`; `apps/web/src/ceo/view-model.ts:73-81`; `packages/git-adapter/src/diff.ts:34-41`
**Issue:** The truncation copy always says "cut at 400 lines", even when the 64 KiB byte cap did the cutting. Renames appear in numstat as `a => b` or `{a => b}/c`, and paths with non-ASCII characters come out quoted. Neither matches the `b/` path from `splitDiffByFile`, so those rows expand to nothing.
**Fix:** Use `--numstat -z --no-renames` (or `-c core.quotePath=false`) and derive the copy from which cap triggered.

### IN-04: `restoreTask` silently accepts a known paused or terminal task, which `handleResume` then resumes

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:665-674`; `apps/worker/src/decisions.ts:123-131`
**Issue:** When a task is known and not running, `restoreTask` returns without error, and `handleResume` calls `resumeTask`. So a task that was cancelled (its parked call expires as `aborted`, which makes it resumable in the UI) would be restarted by a CEO Resume. Nothing calls `cancelTask` today, so this is latent.
**Fix:** Throw from `restoreTask` for `cancelled`, `completed` and `failed`.

### IN-05: A resumed task stays "blocked" in the control plane until its next status event

**File:** `packages/claude-adapter/src/claude-code-runtime.ts:516-521`
**Issue:** The `init` message sets `running` in memory only. After a CEO Resume, the office and dashboard keep showing the task as `blocked` until it parks again or finishes.
**Fix:** On `init`, when the prior status was `blocked` or `paused`, call `await emitStatus(taskId, "running")`.

---

_Reviewed: 2026-09-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
