# Phase 3: Worker, Git Adapter & GSD Adapter - Pattern Map

**Mapped:** 2026-09-19
**Files analyzed:** 12
**Analogs found:** 9 / 12 (3 have no direct analog — new architectural shape, RESEARCH.md sketches apply instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/worker/src/env.ts` | config | request-response (fail-fast validation) | `apps/api/src/env.ts` | exact |
| `apps/worker/src/ws-client.ts` | service | event-driven (reconnect/backoff) | `apps/api/src/routes/ws-auth.test.ts` (client-side `connect()` usage) | role-match |
| `apps/worker/src/poll-loop.ts` | service | streaming/event-driven (poll-diff) | none (new shape) | no analog |
| `apps/worker/src/event-emitter.ts` | service | event-driven → request-response (POST) | `apps/api/src/routes/events.ts` (consumer side) | role-match |
| `apps/worker/src/index.ts` | entrypoint/config | request-response | `apps/api/src/server.ts` | role-match |
| `packages/git-adapter/src/worktree.ts` | utility | transform (subprocess → parsed record) | none (new shape; execa not yet used anywhere) | no analog |
| `packages/git-adapter/src/commit.ts` | utility | transform | none (new shape) | no analog |
| `packages/git-adapter/src/process-liveness.ts` | utility | transform | none (new shape) | no analog |
| `packages/gsd-adapter/src/state-md.ts` | utility | file-I/O → transform | none (gray-matter not used yet; closest shape is Zod-parse-then-transform in `event-schema`) | partial |
| `packages/gsd-adapter/src/phase-files.ts` | utility | file-I/O | none | no analog |
| `packages/gsd-adapter/src/role-mapping.ts` | utility | transform (pure mapping table) | `packages/company-core/src/reducer.ts` (dispatch-table-by-key pattern) | role-match |
| `packages/event-schema/src/payloads/index.ts` (MODIFIED — add `git.*`/`gsd.*`/`worker.heartbeat`) | model/schema | transform (validation) | itself (extend existing file, same pattern) | exact |
| `apps/api/src/routes/ws.ts` (MODIFIED — add heartbeat/message handling) | route | event-driven | itself + `apps/api/src/routes/events.ts` (validate-then-insert pattern to reuse) | exact |
| `packages/company-core/src/reducer.ts` (MODIFIED — add handlers for new event types) | service | transform (event reduction) | itself, existing handler entries | exact |

## Pattern Assignments

### `apps/worker/src/env.ts` (config, fail-fast validation)

**Analog:** `apps/api/src/env.ts` (read in full, 13 lines)

Copy verbatim structure — Zod object schema, `.parse(process.env)` at module load, comment explaining "fail fast at import time instead of runtime crash on first request":

```typescript
// apps/api/src/env.ts:1-13
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CREDENTIAL_PEPPER: z.string().min(1),
  BOOTSTRAP_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = EnvSchema.parse(process.env);
```

For the worker, replace keys with `WORKER_REPO_PATH` (or read from `--repo` CLI arg — D-04 discretion on precedence), `WORKER_TOKEN`, `CONTROL_PLANE_URL`. Keep the "fail fast, no @fastify/env-style dependency" comment style — same Don't-Hand-Roll reasoning applies (a handful of keys doesn't justify a config library).

---

### `apps/worker/src/ws-client.ts` (service, event-driven reconnect/backoff)

**Analog:** `apps/api/src/routes/ws-auth.test.ts` lines 37-39 (client construction) + credential format from `apps/api/src/auth/credentials.ts` lines 9-13

**Connection pattern** (lines 37-39):
```typescript
function connect(headers?: Record<string, string>) {
  return new WebSocket(`${baseUrl}/ws`, { headers });
}
```
Worker's real client does the same `new WebSocket(url, { headers: { Authorization: \`Bearer ${token}\` } })` call against `CONTROL_PLANE_URL + "/ws"`.

**Credential format to construct/reuse** (verbatim, `credentials.ts:9-13`):
```typescript
export function issueCredential(workerId: string): { token: string; secretHash: string } {
  const secret = randomBytes(32).toString("hex");
  const secretHash = createHmac("sha256", env.CREDENTIAL_PEPPER).update(secret).digest("hex");
  return { token: `${workerId}.${secret}`, secretHash };
}
```
Worker does NOT call this — it just holds a pre-issued `WORKER_TOKEN` env var already in `{workerId}.{secret}` shape (issued once via `POST /admin/workers`, per RESEARCH.md Code Examples). Never pass it as a CLI arg (visible via `Get-CimInstance Win32_Process`, per Security Domain) — env var only.

**Reconnect/backoff:** No analog exists in the codebase (Don't Hand-Roll explicitly rejects `p-retry`). Hand-roll per D-03's fully specified algorithm: 1s initial, doubling, cap 30s, 20-50% jitter. Close/error handling mirrors the `ws` library's own `on("close")`/`on("error")` events already referenced in `apps/api/src/routes/ws.ts` line 15 (`socket.on("close", () => {})`).

---

### `apps/worker/src/event-emitter.ts` (service, diff-then-POST)

**Analog:** `apps/api/src/routes/events.ts` (the consumer side this file's output must satisfy) lines 1-53

The worker-side emitter is the mirror image of this file's server-side validation — no need to duplicate validation logic worker-side (the server re-validates), but the worker MUST construct payloads matching `CompanyEventSchema`'s shape exactly (see envelope fields it constructs: `id`, `type`, `version`, `occurredAt`, `companyId`, etc.).

**Ingestion contract to satisfy** (lines 15-19, verbatim):
```typescript
const parsed = CompanyEventSchema.safeParse(request.body);
if (!parsed.success) {
  return reply.code(400).send({ error: parsed.error.flatten() });
}
```
Worker POSTs to `/events` with `Authorization: Bearer {token}` header (same as `ws-client.ts`), one HTTP call per emitted delta. Reuse this existing tested path for git/gsd/heartbeat events alike — do not build a second WS-message validate/insert path (RESEARCH.md Open Question 1 recommendation, Don't Hand-Roll table).

---

### `apps/worker/src/index.ts` (entrypoint)

**Analog:** `apps/api/src/server.ts` lines 1-47

Copy the "importable/inject-able for tests, self-starting when run directly" pattern (lines 41-47):
```typescript
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildServer().listen({ port: env.PORT, host: "0.0.0.0" });
}
```
Worker's `index.ts` should similarly export a `buildWorker()`-equivalent function (wires env, ws-client, poll-loop, adapters) that's importable for integration tests, with the same `import.meta.url` guard for the "run directly" case. Use `pathToFileURL` for the same cross-platform (Windows-safe) reason noted in the comment at lines 42-44.

---

### `packages/git-adapter/src/{worktree,commit}.ts` (utility, transform)

**No analog in codebase** — `execa` is not used anywhere yet; this is genuinely new subprocess-wrapping code. Follow RESEARCH.md Pattern 1 and Pattern 3 sketches directly:

```typescript
// RESEARCH.md Pattern 1 sketch — commit.ts shape
import { execa } from "execa";

async function readHead(repoPath: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "HEAD"], { cwd: repoPath });
  return stdout.trim();
}
```

For `worktree.ts`, parse `git worktree list --porcelain` output per RESEARCH.md Pattern 3: split full stdout on `\n\n`, then each record's lines on the first space. Verified real output format documented there — use as the parsing test fixture.

**Security pattern to copy regardless of no direct analog:** always pass args as an array (never string-interpolate), matching the `execa("git", ["rev-parse", "HEAD"], { cwd })` shape above — this is `execa`'s own default-safe behavior (RESEARCH.md Security Domain, command-injection mitigation).

---

### `packages/git-adapter/src/process-liveness.ts` (utility, transform)

**No analog.** Follow RESEARCH.md Pitfall 1's mandated approach exactly: coarse "any `claude.exe`/`claude` process alive anywhere" via `execa("powershell", ["-Command", "Get-CimInstance Win32_Process -Filter \"Name='claude.exe'\""])` on Windows / `ps` on POSIX, combined with a repo-specific proxy (git HEAD/status or `.planning/STATE.md` mtime change since last poll tick). Never attempt cwd/cmdline matching — verified unreliable this session.

---

### `packages/gsd-adapter/src/state-md.ts` (utility, file-I/O + transform)

**Partial analog:** no direct codebase precedent for YAML/frontmatter parsing, but follow the same "small pure transform function" shape used throughout `packages/company-core/src/reducer.ts`'s handlers (each handler is a pure `(state, event) => newState` function with no side effects beyond reading its inputs).

```typescript
// RESEARCH.md Pattern 4 — status vocabulary this file must normalize against,
// quoted verbatim from gsd-core's state-document.cjs:637-664
exports.STATUS_EXACT_TOKENS = Object.freeze({
    paused: 'paused', stopped: 'paused',
    executing: 'executing', 'in progress': 'executing', 'ready to execute': 'executing',
    planning: 'planning', 'ready to plan': 'planning', 'planning complete': 'planning',
    discussing: 'discussing', verifying: 'verifying',
    completed: 'completed', done: 'completed', complete: 'completed',
    'phase complete': 'completed', 'phase complete — ready for verification': 'verifying',
    'all phases complete': 'completed', 'milestone complete': 'completed',
    unknown: 'unknown',
});
```

Use `gray-matter` to parse the frontmatter block, then normalize `status` through this table. Must handle the missing-`current_phase` case as a first-class "new project" state (Pitfall 3) — do not throw/return undefined.

---

### `packages/gsd-adapter/src/phase-files.ts` (utility, file-I/O)

**No analog.** New file-listing/presence-check code — plain `fs.readdirSync`/`fs.existsSync` against `.planning/phases/NN-*/` per the file-naming convention verified in RESEARCH.md Pattern 4 (`NN-CONTEXT.md`, `NN-##-PLAN.md`/`SUMMARY.md`, `NN-VERIFICATION.md`, `NN-REVIEW.md`).

---

### `packages/gsd-adapter/src/role-mapping.ts` (utility, pure transform)

**Analog:** `packages/company-core/src/reducer.ts` lines 11-147 — the dispatch-table-by-key pattern.

Copy the "typed lookup object keyed by a discriminant, pure functions, no `Date.now()`/`Math.random()`/mutable module state" shape:

```typescript
// packages/company-core/src/reducer.ts:11-13 — pattern to mirror
const handlers: {
  [K in CompanyEvent["type"]]?: (state: ProjectionState, event: Extract<CompanyEvent, { type: K }>) => ProjectionState;
} = { /* ... */ };
```

For `role-mapping.ts`, build an equivalent lookup table keyed by `(status, file-presence signals)` → GSD-01 category, per RESEARCH.md Pattern 4's table (new project/research/requirements/planning/execution/verification/review/approval/deployment). Same purity constraint: input-determined output only, no hidden state.

---

### `packages/event-schema/src/payloads/index.ts` (MODIFIED — additive)

**Analog:** itself — this file's own existing 12-member pattern (lines 1-38, read in full).

**Exact pattern to replicate for each new payload:**
```typescript
// packages/event-schema/src/payloads/index.ts:13, 33 — existing git payload + union entry
const GitCommitCreatedPayload = z.object({ sha: z.string(), message: z.string() });
// ...
z.object({ ...BaseEnvelope.shape, type: z.literal("git.commit_created"), payload: GitCommitCreatedPayload }),
```

Add new payload constants (`WorkerHeartbeatPayload`, `GitWorktreeObservedPayload`, `GsdPhaseObservedPayload` — see RESEARCH.md Code Examples for sketched shapes) and append new `z.object({ ...BaseEnvelope.shape, type: z.literal("..."), payload: ... })` entries to the array in `CompanyEventSchema`.

**Hard constraints (verbatim comment at lines 17-22, must still hold after edit):**
```typescript
// Composed via spread, never chained `.extend()` (Pitfall 2: quadratic typecheck
// cost as the union grows). Every payload is a plain z.object() (never
// z.looseObject()) so unrecognized extra keys are stripped rather than passed
// through to the reducer (Tampering mitigation, T-01-01).
```
Never use `.extend()` chaining; never use `z.looseObject()`.

---

### `apps/api/src/routes/ws.ts` (MODIFIED — add heartbeat/message handling)

**Analog:** itself (current 18-line stub) + `apps/api/src/routes/events.ts` lines 15-19 for the validate-then-insert pattern to reuse inside the new message handler.

**Current stub to extend** (verbatim, lines 12-16):
```typescript
(socket) => {
  // No broadcast logic yet — deferred to Phase 3+ per RESEARCH's
  // architecture diagram. This handler only proves the auth gate works.
  socket.on("close", () => {});
},
```

Per RESEARCH.md Pattern 5 and Open Question 1 recommendation: keep the WS connection purely as the "worker present" channel (open/close state + heartbeat timing), and do NOT duplicate event validation/insert logic inside `socket.on("message")` — route received `worker.heartbeat` events (or any events sent over WS instead of `POST /events`, per Claude's Discretion) through the exact same `CompanyEventSchema.safeParse` + `db.insert(events).onConflictDoNothing()` call already in `events.ts` lines 15-38, imported and called, not copy-pasted.

Add: an in-memory `Map<workerId, { lastHeartbeatAt: Date; socketOpen: boolean }>` (module-level, single-process — no Redis per STACK.md), updated on `socket.on("message")` and `socket.on("close"/"error")`, with a `setInterval` timeout check implementing D-03's online/stale/offline thresholds.

---

### `packages/company-core/src/reducer.ts` (MODIFIED — add handlers for new event types)

**Analog:** itself — existing handler entries, e.g. `git.commit_created` (lines 124-132):
```typescript
"git.commit_created": (state, event) => {
  const taskId = event.taskId;
  const existing = taskId ? state.tasks[taskId] : undefined;
  if (!taskId || !existing) return state;
  return {
    ...state,
    tasks: { ...state.tasks, [taskId]: { ...existing, status: "committed" } },
  };
},
```
New handlers for `git.worktree_observed`, `gsd.phase_observed`, `worker.heartbeat` follow the identical shape: pure function, spread-not-mutate, no-op (`return state`) on missing required IDs, added to the `handlers` object — never as a build-time-exhaustive switch (comment at lines 149-151 explains why).

## Shared Patterns

### Authentication (reuse unchanged)
**Source:** `apps/api/src/auth/worker-auth.ts` (lines 1-49), `apps/api/src/auth/credentials.ts` (lines 1-24)
**Apply to:** `apps/worker/src/ws-client.ts`, `apps/worker/src/event-emitter.ts` — both send `Authorization: Bearer {workerId}.{secret}`. No new auth code on either side; worker just holds the pre-issued token as an env var.

### Env validation (fail-fast Zod parse at module load)
**Source:** `apps/api/src/env.ts` (full file, 13 lines)
**Apply to:** `apps/worker/src/env.ts`

### Discriminated-union additive schema growth
**Source:** `packages/event-schema/src/payloads/index.ts` lines 17-22 (comment) + lines 23-36 (union structure)
**Apply to:** every new `git.*`/`gsd.*`/`worker.heartbeat` payload — spread composition only, plain `z.object()` only.

### Pure dispatch-table transforms (no side effects, no hidden state)
**Source:** `packages/company-core/src/reducer.ts` lines 11-147
**Apply to:** `packages/company-core/src/reducer.ts` new handlers, `packages/gsd-adapter/src/role-mapping.ts`

### Reuse tested ingestion path, never duplicate validate+insert
**Source:** `apps/api/src/routes/events.ts` lines 15-38
**Apply to:** `apps/api/src/routes/ws.ts`'s new message handler — import and call, don't reimplement.

### execa subprocess safety (no shell, array args)
**Source:** RESEARCH.md Security Domain (execa's documented default-safe behavior; no in-repo precedent since execa is new this phase)
**Apply to:** every `packages/git-adapter` file and `process-liveness.ts`

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/worker/src/poll-loop.ts` | service | streaming/event-driven | No polling/diff-loop code exists anywhere in the codebase yet — first phase to introduce this shape. Use RESEARCH.md Pattern 1 sketch directly. |
| `packages/git-adapter/src/{worktree,commit,process-liveness}.ts` | utility | transform | `execa` unused elsewhere in repo; git plumbing is new this phase. Use RESEARCH.md Patterns 1 & 3 and Pitfall 1 directly. |
| `packages/gsd-adapter/src/{state-md,phase-files}.ts` | utility | file-I/O | `gray-matter`/`.planning/` file scanning unused elsewhere. Use RESEARCH.md Pattern 4 and Pitfalls 2-3 directly. |

## Metadata

**Analog search scope:** `apps/api/src/**`, `packages/event-schema/src/**`, `packages/company-core/src/**` (entire existing codebase — only 2 workspace apps/packages exist prior to this phase)
**Files scanned:** 11 (env.ts, ws.ts, events.ts, worker-auth.ts, credentials.ts, ws-auth.test.ts, server.ts, admin-workers.ts, payloads/index.ts, reducer.ts, projections.ts)
**Pattern extraction date:** 2026-09-19
