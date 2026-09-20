---
phase: 03-worker-git-adapter-gsd-adapter
reviewed: 2026-09-20T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - apps/api/src/auth/worker-auth.ts
  - apps/api/src/routes/admin-workers.ts
  - apps/api/src/routes/connection-lifecycle.test.ts
  - apps/api/src/routes/events.ts
  - apps/api/src/routes/ws.ts
  - apps/api/src/ws/connection-status.test.ts
  - apps/api/src/ws/connection-status.ts
  - apps/worker/package.json
  - apps/worker/src/env.test.ts
  - apps/worker/src/env.ts
  - apps/worker/src/event-emitter.ts
  - apps/worker/src/index.integration.test.ts
  - apps/worker/src/index.ts
  - apps/worker/src/poll-loop.test.ts
  - apps/worker/src/poll-loop.ts
  - apps/worker/src/ws-client.test.ts
  - apps/worker/src/ws-client.ts
  - apps/worker/tsconfig.json
  - packages/company-core/src/projections.ts
  - packages/company-core/src/reducer.test.ts
  - packages/company-core/src/reducer.ts
  - packages/event-schema/src/payloads/index.test.ts
  - packages/event-schema/src/payloads/index.ts
  - packages/git-adapter/package.json
  - packages/git-adapter/src/commit.test.ts
  - packages/git-adapter/src/commit.ts
  - packages/git-adapter/src/index.ts
  - packages/git-adapter/src/no-mutating-git.test.ts
  - packages/git-adapter/src/process-liveness.ts
  - packages/git-adapter/src/worktree.test.ts
  - packages/git-adapter/src/worktree.ts
  - packages/git-adapter/tsconfig.json
  - packages/gsd-adapter/package.json
  - packages/gsd-adapter/src/index.ts
  - packages/gsd-adapter/src/phase-files.ts
  - packages/gsd-adapter/src/role-mapping.test.ts
  - packages/gsd-adapter/src/role-mapping.ts
  - packages/gsd-adapter/src/state-md.ts
  - packages/gsd-adapter/src/state-md.test.ts
  - packages/gsd-adapter/tsconfig.json
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

Reviewed the worker process, its `git-adapter`/`gsd-adapter` dependencies, and the API-side worker-auth/connection-status/events surface added in this phase. The auth and connection-status pieces are well-reasoned (constant-time credential comparison, dummy-hash timing normalization, "absence of signal is never presence" thresholds), and the unit/integration test coverage is unusually thorough for the happy paths described in the plan comments.

Two blockers were found by tracing call chains across the module boundaries the plan comments call out as important:

1. The reconnect logic in `ws-client.ts` double-schedules a reconnect (and double-increments the backoff attempt counter) whenever a connection failure emits both `error` and `close` — the realistic real-world failure mode (control plane unreachable) — which the test suite doesn't exercise because its only reconnect test uses a clean server-forced close.
2. `startWorker()` never derives a real `phaseId` for the poll loop (it's hardcoded `undefined`), and `gsd-adapter`'s own `readStateMd()` already parses `current_phase` from `STATE.md` but that value is discarded rather than threaded through — so in production `gsd.phase_observed` can never report anything other than `new_project` or `unknown`, permanently dead-lettering the `execution`/`planning`/`verification`/`review` categories that are this phase's core GSD-01 deliverable.

## Critical Issues

### CR-01: Reconnect logic double-schedules on simultaneous `error`+`close`, corrupting backoff and creating duplicate connections

**File:** `apps/worker/src/ws-client.ts:73-86`
**Issue:** `connect()` registers **both** a `"close"` and an `"error"` listener that each call `scheduleReconnect`:

```ts
ws.on("close", scheduleReconnect);
ws.on("error", scheduleReconnect);
```

For the `ws` library, a connection failure (refused connection, handshake rejection, DNS failure, network unreachable — i.e. exactly the scenario reconnect-with-backoff exists for) emits `"error"` **and then** `"close"` for the same failure. Both handlers fire `scheduleReconnect()`, which does:

```ts
function scheduleReconnect(): void {
  onClose?.();
  if (stopped) return;
  const delay = computeBackoffDelay(attempt++);
  reconnectTimer = setTimeout(connect, delay);
}
```

Each call increments `attempt` and creates a new `setTimeout`. Only the *second* timer is retained in the `reconnectTimer` variable — the first is silently overwritten (its reference is lost) but keeps running and will independently call `connect()` later, producing a second, unintended WebSocket connection. This also means a single real disconnect advances the backoff counter by 2 instead of 1, and `stop()` can only `clearTimeout` the timer it currently holds a reference to, so the leaked first timer's `connect()` call cannot reliably be prevented if it fires in the same tick `stop()` is called.

The existing test (`ws-client.test.ts:92-117`, "reconnects after a server-forced socket close") only forces a **clean** close via `socket.close()`, which does not emit `"error"` in `ws` — so this path is never exercised.

**Fix:** Only schedule from one of the two events (they are not independent for connection failures):
```ts
function connect(): void {
  if (stopped) return;
  ws = connectWorker(controlPlaneUrl, token);
  ws.on("open", () => {
    attempt = 0;
    onOpen?.(ws as WebSocket);
  });
  // "error" is always followed by "close" for ws — only listen once to avoid
  // double-scheduling a reconnect for a single failure.
  ws.on("close", scheduleReconnect);
  ws.on("error", () => {
    /* swallow: "close" will still fire and drive the reconnect */
  });
}
```
Add a regression test that forces the underlying socket to emit both `error` and `close` (e.g. connect to a closed port) and assert `attempt`/open-count only advances once per failure.

### CR-02: `phaseId` is never derived from `STATE.md`'s already-parsed `current_phase`, so GSD-01 category/role observation is permanently stuck at `new_project`/`unknown` in production

**File:** `apps/worker/src/index.ts:23-30`, `packages/gsd-adapter/src/index.ts:25-36`, `packages/gsd-adapter/src/state-md.ts:33-54`
**Issue:** `startWorker()` calls `startPollLoop` with `phaseId: undefined` unconditionally:

```ts
const pollLoop = startPollLoop({
  repoPath: env.repoPath,
  planningDir: join(env.repoPath, ".planning"),
  phaseId: undefined,
  ...
});
```

`observeGsdState(planningDir, phaseId, roadmapPhaseCompleted)` only calls `scanPhaseDir` (and therefore only lets `mapToGsdCategory` see a non-null `phaseFiles`) when `phaseId` is truthy:

```ts
const phaseFiles = phaseId ? await scanPhaseDir(planningDir, phaseId) : null;
```

Since `phaseId` is always `undefined`, `phaseFiles` is always `null`. Looking at `mapToGsdCategory`'s branches, every branch except the first (`new_project`) and the final fallback (`unknown`/`unknown`) requires `phaseFiles` to be truthy — they can never execute. So in production `gsd.phase_observed` can only ever report `category: "new_project"` or `category: "unknown"`, never `planning`, `execution`, `verification`, `review`, or `deployment` — even though the code to compute all of those already exists and is unit-tested in `role-mapping.test.ts`.

The frustrating part: `readStateMd()` already parses the exact value needed (`current_phase`) into `StateMdResult.currentPhase`, but that value is discarded — `observeGsdState` calls `readStateMd` internally and never surfaces `currentPhase` back to its caller, and `index.ts`'s `startPollLoop` invocation has no path to obtain it at all. The in-code comment ("phaseId left undefined for now... no ROADMAP-checkbox-reading integration is wired here") only calls out `deployment`/`approval` as an accepted gap, but the actual gap is far broader: essentially the entire category/role signal this phase was built to deliver never fires.

**Fix:** Thread `current_phase` (zero-padded to the `NN` directory-prefix format `scanPhaseDir` expects, e.g. `String(currentPhase).padStart(2, "0")`) from `readStateMd` back out to the poll loop, and re-read it each tick (the phase can change mid-run) instead of freezing it at startup as `undefined`:
```ts
// gsd-adapter/src/index.ts
export async function observeGsdState(planningDir: string, phaseIdOverride: string | undefined, roadmapPhaseCompleted: boolean) {
  const stateResult = await readStateMd(planningDir);
  const phaseId = phaseIdOverride ?? (stateResult?.currentPhase !== undefined
    ? String(stateResult.currentPhase).padStart(2, "0")
    : undefined);
  ...
}
```
and drop the `phaseId: undefined` from `apps/worker/src/index.ts`'s call (or have `poll-loop.ts` simply stop passing a `phaseId` at all and let `gsd-adapter` derive it every tick).

## Warnings

### WR-01: `phaseId` is interpolated unescaped into `new RegExp(...)`

**File:** `packages/gsd-adapter/src/phase-files.ts:41-42`
**Issue:**
```ts
const planRegex = new RegExp(`^${phaseId}-\\d+-PLAN\\.md$`);
const summaryRegex = new RegExp(`^${phaseId}-\\d+-SUMMARY\\.md$`);
```
`phaseId` is spliced directly into a regex source string with no escaping. Today this is masked because `apps/worker/src/index.ts` always calls `observeGsdState` with `phaseId: undefined` (see CR-02), so this branch never actually executes against attacker/producer-controlled input in the current build. But the moment CR-02 is fixed and `phaseId` starts coming from `STATE.md`'s `current_phase` (or, later, a control-plane-supplied value), a phase id containing regex metacharacters would either throw (`SyntaxError: Invalid regular expression`) and crash the poll loop's gsd-observation branch, or silently match unintended files.
**Fix:** Escape the interpolated value, e.g. via a small helper:
```ts
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const planRegex = new RegExp(`^${escapeRegExp(phaseId)}-\\d+-PLAN\\.md$`);
```

### WR-02: Worker-emitted `git.worktree_observed` events never carry `taskId`, so the reducer's handler for them can never fire in production

**File:** `apps/worker/src/event-emitter.ts:11-26`, `apps/worker/src/poll-loop.ts:72-81`, `packages/company-core/src/reducer.ts:148-166`
**Issue:** `buildEnvelope(companyId, type, payload, visibility)` has no parameter for `taskId` (a top-level, optional `BaseEnvelope` field per `packages/event-schema/src/envelope.ts:15`), and `poll-loop.ts`'s call site never supplies one:
```ts
await postEvent(controlPlaneUrl, token, buildEnvelope(companyId, "git.worktree_observed", payload));
```
`reducer.ts`'s `git.worktree_observed` handler requires both a `taskId` and a matching existing task record to do anything:
```ts
"git.worktree_observed": (state, event) => {
  const taskId = event.taskId;
  const existing = taskId ? state.tasks[taskId] : undefined;
  if (!taskId || !existing) return state;
  ...
}
```
Since real worker traffic never sets `taskId` at all, this handler is unreachable dead code for every event the worker actually emits — the WORKTREE-01 task enrichment (`repo`/`branch`/`worktreePath`/`headSha`/`sessionId` on a task record) can only ever be exercised by hand-built test fixtures (`reducer.test.ts`), never by the real pipeline.
**Fix:** Either extend `buildEnvelope`/`postEvent` call sites to accept and forward a `taskId` once a session→task correlation mechanism exists, or — if that correlation genuinely doesn't exist yet in this phase — add an explicit comment at the `reducer.ts` handler and/or `poll-loop.ts` call site documenting that this is a deliberately deferred, currently-unreachable code path, so a future reader doesn't mistake current test coverage for production coverage.

### WR-03: `/events` accepts any `CompanyEventSchema` event type from any authenticated worker credential — no per-credential type allow-list

**File:** `apps/api/src/routes/events.ts:9-19`
**Issue:** `authenticateWorker` only proves "this is a valid, non-revoked worker credential" — it does not scope what event *types* that credential is allowed to submit. The route then accepts and persists **any** event that parses against the full 15-member `CompanyEventSchema` discriminated union:
```ts
const parsed = CompanyEventSchema.safeParse(request.body);
```
A worker process is only supposed to originate `worker.heartbeat`, `git.worktree_observed`, and `gsd.phase_observed` events, but nothing stops an authenticated worker token (or an attacker who obtains one — e.g. via a compromised worker host) from POSTing a `ceo.approval_requested`, `company.started`, or `agent.handoff_requested` event, all of which mutate the shared projection state via `reducer.ts`. Given this phase's own security comments elsewhere in the codebase are careful about tampering (`T-03-01`, `T-02-06`, `T-02-07`), this looks like a gap rather than an intentional decision, though it predates Phase 3 (the route itself, minus the heartbeat branch, already existed).
**Fix:** Add a type allow-list keyed by credential kind (or at minimum by the fact that the credential came from the worker-issuance path) before the `safeParse`, e.g.:
```ts
const WORKER_ALLOWED_TYPES = new Set(["worker.heartbeat", "git.worktree_observed", "gsd.phase_observed"]);
if (!WORKER_ALLOWED_TYPES.has((request.body as { type?: string })?.type ?? "")) {
  return reply.code(403).send({ error: "event type not permitted for this credential" });
}
```

## Info

### IN-01: POSIX Claude-process liveness check uses an unanchored substring match

**File:** `packages/git-adapter/src/process-liveness.ts:23-27`
**Issue:**
```ts
const { stdout } = await execa("ps", ["-eo", "comm,args"]);
return stdout.toLowerCase().split("\n").some((line) => line.includes("claude"));
```
Any process whose command or arguments merely contain the substring "claude" (e.g. a path like `/home/claude-user/...`, an unrelated script named `claude-metrics.sh`, or even this worker process's own invocation if launched from a directory containing "claude") counts as "Claude Code is alive", feeding directly into the `active` signal computed in `poll-loop.ts`. The Windows branch is properly scoped to `claude.exe`/`node.exe` with a `-like '*claude*'` command-line filter on top of an exact process-name match, but the POSIX branch has no equivalent anchoring.
**Fix:** Tighten the POSIX match to the process name column specifically (first field of `comm,args`), e.g. `line.split(/\s+/)[0] === "claude"`, or at least require a word boundary (`/\bclaude\b/`) rather than a raw substring.

---

_Reviewed: 2026-09-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
