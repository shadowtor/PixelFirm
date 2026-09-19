# Phase 3: Worker, Git Adapter & GSD Adapter - Research

**Researched:** 2026-09-19
**Domain:** Local worker process (Node.js) observing a real git repo + GSD `.planning/` state, emitting typed events outbound to an already-built control plane
**Confidence:** HIGH

## Summary

Phase 3 is a pure observation layer: a new `apps/worker` Node process, plus two new packages (`packages/git-adapter`, `packages/gsd-adapter`), poll a user-chosen repo on a ~2-3s interval, diff observed state against last-seen state, and emit `CompanyEvent`s over the same authenticated WS connection Phase 2 already built and tested. Nothing in this phase is net-new architecture — it is new *producers* feeding an existing, already-proven pipeline (`CompanyEventSchema` → `POST /events`/`GET /ws` → Postgres `events` table → `packages/company-core` reducer). The two hardest technical questions were resolved by direct verification this session, not assumption: (1) Windows has no reliable way to attribute a running `claude.exe` process to a specific repo — confirmed by actually querying `Get-CimInstance Win32_Process` on this machine and finding `CommandLine` carries no repo path at all — so D-02's process-liveness signal must be a coarse, repo-agnostic "is any Claude process alive" check combined with recent local file-activity, never a cwd/cmdline match; and (2) GSD's own `STATE.md` status vocabulary (read directly from `gsd-core`'s source) is only 7 tokens (`planning`/`executing`/`verifying`/`paused`/`discussing`/`completed`/`unknown`), which is coarser than GSD-01's 9-category list — the gap must be closed with phase-directory file-presence checks, exactly as D-02 already specifies, not a direct string match.

**Primary recommendation:** Build `apps/worker` as a single long-lived Node process using `execa` for git plumbing + OS process listing, `gray-matter` for `.planning/*.md` frontmatter, and the existing `ws` bearer-token client pattern already proven in `apps/api/src/routes/ws-auth.test.ts`. Reuse the already-built, already-tested `POST /events` ingestion path for every emitted event (git, gsd, and heartbeat) rather than inventing a second validation/insert path over WS; use the WS connection purely as the persistent "is this worker present" channel, with online/stale/offline derived live from heartbeat events + socket open/close state (no new `workers` table column needed).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Change detection mechanism:** Worker detects git and GSD state changes by polling — `git rev-parse HEAD` / `git status --porcelain` (or equivalent plumbing) plus an `fs.stat` on `.planning/state.json`/`STATE.md`, on a short interval (~2-3s). No filesystem watcher (chokidar/fs.watch) in this phase. Chosen over fs-watching because `.git` internals churn heavily during normal git operations (index locks, packed-refs rewrites) causing event storms, and Windows — the primary dev target for this worker — is the least reliable fs-watch backend across platforms. Reversibility: reversible.

**D-02 — GSD state → role/event mapping signals:** The GSD adapter maps `.planning/` file presence + frontmatter status fields (STATE.md's `status:`, phase CONTEXT.md/VERIFICATION.md frontmatter, `NN-##-PLAN.md`/`SUMMARY.md` presence) to WHICH GSD phase/role is assigned — the authoritative signal for phase/role identity. A secondary OS-level process-liveness check (is a `claude`/`gsd-*` process running with a cwd matching the pointed-at repo, via `child_process`) determines WHETHER that role is currently active vs. idle. Neither signal alone is sufficient. No dependency on Claude Code's own transcript/session stream. Reversibility: costly — once Phase 5's agent-state rendering depends on this file+process dual-signal shape, swapping liveness sources means changing the GSD adapter's event-emission contract.

**D-03 — Worker connection lifecycle:** Worker liveness flows through the same event-sourced pipeline as everything else — a heartbeat is an application-level event appended to the Postgres event log (via the existing event-append path), not a protocol-level `ws` ping/pong side-channel. Worker sends a heartbeat event every ~10s. Uses **server receipt time**, not worker-supplied timestamps: `online` = heartbeat received within the last interval; `stale` = 1-2 missed heartbeats while the socket is still open (~10-20s silence); `offline` = either WS `close`/`error` fires (immediate) or 3+ missed heartbeats (~30s dead air with no close event). Worker reconnects with exponential backoff: 1s initial, doubling, capped at 30s, with ~20-50% jitter. Reversibility: reversible.

**D-04 — Repo targeting configuration:** Worker takes exactly one repository path at startup via a CLI arg or env var (e.g. `--repo=<path>` / `WORKER_REPO_PATH`), validated as an existing git worktree before the worker proceeds. One worker process watches exactly one repo — no config file, no in-process multi-repo support in this phase. Multiple repos = multiple worker OS processes. Reversibility: reversible.

### Claude's Discretion

- Exact poll interval value within ~2-3s (D-01) and whether hardcoded or env-configurable.
- Exact process-liveness matching heuristic (D-02) — cwd string match, process name allowlist, or combination — must degrade safely to "idle" (never fabricate "active") on ambiguous matches.
- Exact heartbeat event type name/payload shape (D-03) and where in `packages/event-schema`'s discriminated union it's added (extends the existing 12-member union, additive).
- Whether CLI arg or env var takes precedence when both supplied (D-04), exact flag/var naming.
- Git adapter's exact event payload shape for commit/branch/worktree data — extends `GitCommitCreatedPayload` (currently only `sha`/`message`) or adds new `git.*` types, additive to the existing discriminated union.
- Internal module boundary between `packages/git-adapter`/`packages/gsd-adapter` vs. logic living directly in `apps/worker`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUNTIME-03 | Worker runs wherever Claude Code is authenticated, connects outbound-only, points at any git repo the user chooses | Architecture Patterns (WS client pattern, `apps/worker` structure); D-04 config via `--repo`/`WORKER_REPO_PATH`; Environment Availability confirms git/PowerShell/claude.exe presence on the target Windows machine |
| RUNTIME-04 | Worker online/offline/stale connection status visible in company state | Architecture Patterns Pattern 5 (derive connection status live from heartbeat events + open-socket map, no new persisted column); D-03 thresholds; Pitfall 5 (server-side `ws.ts` currently has zero heartbeat/broadcast logic — must be added) |
| WORKTREE-01 | Each active task records real repo, branch, worktree path, owning agent/session | Architecture Patterns Pattern 3 (`git worktree list --porcelain` parsing, verified format); Code Examples (real porcelain output from this repo and SyncSmith) |
| WORKTREE-02 | System never automatically merges a worktree's branch | Don't Hand-Roll + Validation Architecture (absence test: grep/static-check that no `git merge`/`git rebase` invocation exists in `git-adapter`, since this is a negative claim not a runtime-observable behavior) |
| GSD-01 | GSD adapter observes real GSD workflow state and maps it onto company events/role assignments, preferring observed over guessed | Architecture Patterns Pattern 4 (verified STATE.md status vocabulary from `gsd-core` source); Pitfalls 2 & 3 (vocabulary gap, missing-`current_phase` case); Open Question 3 (approval/deployment mapping ambiguity) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Git repo/worktree/branch observation | Worker process (local, user's workstation) | — | Only the worker has filesystem access to the user's chosen repo; PROJECT.md explicitly forbids the control plane from needing direct filesystem access to worker repos |
| GSD `.planning/` workflow-state observation | Worker process (local) | — | Same constraint — `.planning/` lives on the user's disk, not on the Coolify-hosted control plane |
| OS process-liveness detection (is Claude Code running) | Worker process (local) | — | OS-level introspection is only possible where the process actually runs |
| Event validation + durable storage | API / Control Plane (`apps/api`, existing) | Database (Postgres `events` table, existing) | Already built in Phase 2 (`CompanyEventSchema.safeParse` + `onConflictDoNothing`); this phase is a pure producer into that existing seam |
| Connection status (online/stale/offline) | API / Control Plane | — (derived, not separately persisted — see Pattern 5) | Server receipt time is authoritative per D-03; the worker cannot self-report an objective connection state about itself |
| Role/task/agent state projection | Company State Engine (`packages/company-core`, existing, unchanged this phase) | — | EVENT-03 already assigns this reducer sole ownership of projections; adapters only emit events, never write state directly |
| Worktree/branch/task metadata storage | Database (`events` table `payload` jsonb, existing schema) | Company State Engine (task projection, extended by whichever handler reduces the new git event types) | Event-sourced — no new side-channel table needed this phase |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `execa` | ^10.0.1 [VERIFIED: npm registry, `npm view execa version` this session; legitimacy check OK, 152.7M weekly downloads, github.com/sindresorhus/execa] | Subprocess control for git plumbing (`rev-parse`, `status --porcelain`, `worktree list --porcelain`) and OS process listing (PowerShell/`ps`) | STACK.md already recommends `execa` (or `simple-git`, "pick one, don't use both") for worker subprocess control; `execa` also covers the non-git OS-process-listing need D-02 requires, which `simple-git` (a git-only porcelain wrapper) does not — one dependency serves both jobs |
| `ws` | ^8.21.3 [VERIFIED: npm registry, `npm view ws version`; already a devDependency of `apps/api` and used as the real client library in `apps/api/src/routes/ws-auth.test.ts`, read this session] | Worker's outbound WS client connecting to `GET /ws` | Already the project's chosen WS library (STACK.md); the exact same package is already proven against this exact server route in Phase 2's own test suite — reuse, don't introduce a second WS client library |
| `gray-matter` | ^4.0.3 [VERIFIED: npm registry, `npm view gray-matter version`; legitimacy check OK, 8.6M weekly downloads, github.com/jonschlinkert/gray-matter] | Parses `---\n...\n---` YAML frontmatter blocks in STATE.md / phase CONTEXT.md / VERIFICATION.md | STATE.md's frontmatter includes a nested YAML object (`progress: { total_phases, completed_phases, ... }` — verified by reading `F:/Sidegigs/PixelFirm/.planning/STATE.md:1-17` and `F:/Sidegigs/syncsmith/.planning/STATE.md:1-9` directly this session); a naive line-regex parser breaks the moment a value is nested — `gray-matter`'s YAML engine (via its `js-yaml` dependency) handles this correctly out of the box |
| `zod` | ^4.6.5 [reuse — already pinned in `apps/api/package.json` and `packages/event-schema/package.json`, read this session] | New `git.*`/`gsd.*`/`worker.heartbeat` payload schemas, worker env validation | Same schema/validation library the whole event pipeline already depends on — no new validation framework |
| `event-schema` (workspace) | workspace:* | This phase's new event types extend `CompanyEventSchema`'s existing discriminated union | Already the single source of truth every event in the system validates against |
| `pino` | latest (Fastify's default, already used server-side) | Structured worker logging | STACK.md explicitly recommends reusing Fastify's default logger in the worker too, "useful once you're correlating worker Claude Code sessions with control-plane events" |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none additional) | — | — | Exponential-backoff reconnect (D-03) and the online/stale/offline threshold logic are ~10-15 lines each with an already-fully-specified algorithm — see Don't Hand-Roll for why a retry library is explicitly rejected here |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `execa` | `simple-git` | `simple-git` gives a nicer typed porcelain API for git-only calls, but this phase also needs generic OS-process listing (D-02) that `simple-git` can't do — would still need a second subprocess library, defeating "pick one" |
| `gray-matter` | Hand-rolled regex frontmatter split | Breaks on the nested `progress:` object already present in real STATE.md files (verified this session) — not a safe simplification |
| Hand-rolled backoff | `p-retry` | Flagged `SUS` by the package-legitimacy check this session ("too-new" — its latest publish is 2026-09-01 despite 47M weekly downloads); D-03 already fully specifies the exact backoff algorithm (1s/double/cap 30s/20-50% jitter), so a generic retry-library API adds indirection for zero savings |
| WS message-based event ingestion (new path) | Reuse `POST /events` (existing, tested path) for all emitted events | See Architecture Patterns Pattern 5 — reusing the tested path avoids building and testing a second validate+insert code path for the same event schema |

**Installation:**
```bash
pnpm --filter worker add execa ws gray-matter zod pino event-schema@workspace:*
pnpm --filter worker add -D typescript tsx vitest @types/ws
pnpm --filter git-adapter add execa zod event-schema@workspace:*
pnpm --filter git-adapter add -D typescript vitest
pnpm --filter gsd-adapter add gray-matter zod event-schema@workspace:*
pnpm --filter gsd-adapter add -D typescript vitest
```

**Version verification:** All four new packages (`execa`, `ws`, `gray-matter`, plus `zod`/`event-schema` reused unmodified) were confirmed live against the npm registry this session via `npm view <pkg> version` and the `package-legitimacy check` seam — see Package Legitimacy Audit below. `ws` was already pinned as `^8.21.3` in `apps/api/package.json`'s devDependencies (read this session) — the worker should match that exact range rather than drifting to a different `ws` major.

## Package Legitimacy Audit

| Package | Registry | Age/Publish signal | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `execa` | npm | last publish 2026-07-31 | 152.7M/wk | github.com/sindresorhus/execa | OK | Approved |
| `ws` | npm | last publish 2026-08-07 | 245.4M/wk | github.com/websockets/ws | OK | Approved (already used server-side) |
| `gray-matter` | npm | last publish 2021-04-24 (stable, unmaintained-but-complete) | 8.6M/wk | github.com/jonschlinkert/gray-matter | OK | Approved |
| `js-yaml` (transitive, via `gray-matter`'s default engine) | npm | last publish 2026-09-13 | 269.8M/wk | github.com/nodeca/js-yaml | SUS ("too-new") | Not a direct install — the "too-new" flag is a routine patch release of a 12+-year-old, 270M/wk package; no direct dependency added, no checkpoint needed, informational only |
| `p-retry` | npm | last publish 2026-09-01 | 47.3M/wk | github.com/sindresorhus/p-retry | SUS ("too-new") | REMOVED from recommendation — hand-roll the ~15-line backoff per D-03's exact spec instead (see Don't Hand-Roll) |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `js-yaml` (transitive only, no action needed), `p-retry` (not recommended — hand-roll instead, so no `checkpoint:human-verify` task is needed for it either).

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────── User's Workstation ──────────────────────────────┐
│                                                                                │
│   Chosen git repo (e.g. F:/Sidegigs/syncsmith, D-04's --repo/WORKER_REPO_PATH)│
│        │  git rev-parse HEAD                                                  │
│        │  git status --porcelain                                             │
│        │  git worktree list --porcelain                                      │
│        ▼                                                                      │
│  ┌────────────────┐        .planning/STATE.md, phase NN-*.md frontmatter,    │
│  │  git-adapter    │        fs.stat mtimes, ROADMAP.md checkboxes            │
│  │  (poll ~2-3s)   │◄───────────────┐                                        │
│  └────────┬────────┘         ┌──────┴───────────┐                            │
│           │                  │   gsd-adapter     │                           │
│           │                  │   (poll ~2-3s)    │                           │
│           │                  └──────┬────────────┘                          │
│           │                         │  PowerShell Get-CimInstance             │
│           │                         │  Win32_Process (Windows) / ps (POSIX)   │
│           ▼                         ▼        — coarse "any claude alive?"     │
│      ┌───────────────────────────────────────────┐                          │
│      │              apps/worker (Node)             │                        │
│      │  diff current vs. last-seen snapshot        │                        │
│      │  → emit only CompanyEvent deltas            │                        │
│      │  → heartbeat every ~10s                     │                        │
│      │  → reconnect on close/error, backoff+jitter │                        │
│      └────────────────────┬─────────────────────────┘                       │
│                            │ outbound-only WS, `Authorization: Bearer         │
│                            │ {workerId}.{secret}` (Phase 2, unchanged)        │
└────────────────────────────┼──────────────────────────────────────────────────┘
                             ▼
        ┌────────────────────────────────────────────────────┐
        │     apps/api (control plane, already deployed)      │
        │  GET /ws  → authenticateWorker (existing, unchanged) │
        │    on message: same CompanyEventSchema.safeParse +   │
        │    same db.insert(events).onConflictDoNothing path   │
        │    that POST /events already uses (Phase 2)          │
        │  on socket close/error: mark worker offline           │
        │  heartbeat-timeout timer: mark worker stale/offline   │
        └───────────────────────┬──────────────────────────────┘
                                ▼
              packages/company-core (reducer, unchanged this phase)
                                ▼
              ProjectionState — agents/tasks/... + derived worker connection status
```

### Recommended Project Structure

```
apps/worker/
├── src/
│   ├── index.ts             # entrypoint: parse --repo/WORKER_REPO_PATH, wire adapters, start poll loop
│   ├── env.ts                # Zod-validated WORKER_REPO_PATH/WORKER_TOKEN/CONTROL_PLANE_URL — same fail-fast pattern as apps/api/src/env.ts
│   ├── ws-client.ts          # connect, heartbeat sender, reconnect+backoff+jitter, close/error handling
│   ├── event-emitter.ts      # diffs current vs. last-seen snapshot, sends only new CompanyEvents
│   └── poll-loop.ts          # ~2-3s setInterval driving git-adapter + gsd-adapter reads
packages/git-adapter/
├── src/
│   ├── index.ts
│   ├── worktree.ts            # `git worktree list --porcelain` → parsed worktree records
│   ├── commit.ts              # `git rev-parse HEAD` / `git status --porcelain`
│   └── process-liveness.ts    # coarse OS process check (Windows: PowerShell Win32_Process; POSIX: ps)
packages/gsd-adapter/
├── src/
│   ├── index.ts
│   ├── state-md.ts            # STATE.md frontmatter+body parsing (gray-matter)
│   ├── phase-files.ts         # scans .planning/phases/NN-*/ for CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION presence
│   └── role-mapping.ts        # GSD status+file-presence → company role/event mapping table
```

### Pattern 1: Poll-diff, never fs.watch (D-01)

**What:** Each tick, adapters compute current observable state (HEAD sha, worktree list, STATE.md status, phase-dir file listing) and diff it against an in-memory last-seen snapshot; only emit events for deltas.
**When to use:** Every git/GSD signal in this phase — D-01 explicitly rejects `fs.watch`/`chokidar` because `.git` internals churn heavily (index locks, packed-refs rewrites) and Windows (this project's primary dev target — confirmed this session: `Windows 11 Pro 10.0.26200`) is the least reliable fs-watch backend.
**Example:**
```typescript
// apps/worker/src/poll-loop.ts — sketch; execa's exec-array signature is
// [ASSUMED] stable training knowledge (Context7 lookup for execa failed this
// session — monthly quota exceeded — verify against the pinned 10.0.1 during
// Task 1's first implementation pass).
import { execa } from "execa";

async function readHead(repoPath: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "HEAD"], { cwd: repoPath });
  return stdout.trim();
}
```

### Pattern 2: Worker WS client mirrors the existing test harness exactly

The worker's connection code should be a production version of the exact pattern Phase 2 already proved:
```typescript
// Source: apps/api/src/routes/ws-auth.test.ts:37-39 [VERIFIED: read this session]
function connect(headers?: Record<string, string>) {
  return new WebSocket(`${baseUrl}/ws`, { headers });
}
```
The worker sends `Authorization: Bearer {workerId}.{secret}` using the exact credential format `apps/api/src/auth/credentials.ts:12` already issues (`` `${workerId}.${secret}` ``) [VERIFIED: read this session] — no new auth mechanism.

### Pattern 3: `git worktree list --porcelain` parsing (verified format)

Ran directly against two real repos this session:
```
# F:/Sidegigs/PixelFirm — git worktree list --porcelain [VERIFIED: ran this session]
worktree F:/Sidegigs/PixelFirm
HEAD 0adf40e97a24ed8e7863e44606966d2ef970f7f1
branch refs/heads/main

# F:/Sidegigs/syncsmith — same command [VERIFIED: ran this session]
worktree F:/Sidegigs/syncsmith
HEAD c41f51af54bbf1f9c78c501dac37511169926760
branch refs/heads/main
```
Records are one-attribute-per-line, blank-line-terminated; boolean attributes (`bare`, `detached`) appear as a label with no value only when true; `locked`/`prunable` may carry an optional reason string [CITED: git-scm.com/docs/git-worktree, cross-checked against the verified real output above]. Parse by splitting the full stdout on `\n\n`, then each record's lines on the first space.

### Pattern 4: Reuse GSD's own canonical status vocabulary — don't invent a new one

Quoted verbatim from `gsd-core`'s own source [VERIFIED: `C:\Users\shado\.claude\gsd-core\bin\lib\state-document.cjs:637-664`, read this session]:
```js
exports.STATUS_EXACT_TOKENS = Object.freeze({
    paused: 'paused',
    stopped: 'paused',
    executing: 'executing',
    'in progress': 'executing',
    'ready to execute': 'executing',
    planning: 'planning',
    'ready to plan': 'planning',
    'planning complete': 'planning',
    discussing: 'discussing',
    verifying: 'verifying',
    completed: 'completed',
    done: 'completed',
    complete: 'completed',
    'phase complete': 'completed',
    'phase complete — ready for verification': 'verifying',
    'all phases complete': 'completed',
    'milestone complete': 'completed',
    unknown: 'unknown',
});
```
The normalized vocabulary is exactly 7 tokens: `planning`, `executing`, `verifying`, `paused`, `discussing`, `completed`, `unknown`. The gsd-adapter should treat this as its base signal for STATE.md's coarse lifecycle stage, then layer phase-directory file-presence checks to resolve GSD-01's finer categories that have no direct status token of their own:

| GSD-01 category | Closest STATE.md `status` | Distinguishing file-presence signal (verified naming convention, see below) |
|---|---|---|
| new project | (no status yet) | `.planning/PROJECT.md` absent |
| research | `planning` | phase dir has `NN-RESEARCH.md` but no `NN-##-PLAN.md` yet |
| requirements | `planning` | `.planning/REQUIREMENTS.md` exists but `.planning/ROADMAP.md` doesn't yet |
| planning | `planning` | phase dir has `NN-CONTEXT.md`, no `NN-##-PLAN.md` yet |
| execution | `executing` | `NN-##-PLAN.md` exists, matching `NN-##-SUMMARY.md` absent |
| verification | `verifying` | all `NN-##-PLAN.md` have `NN-##-SUMMARY.md`, `NN-VERIFICATION.md` absent or in progress |
| review | `verifying`→`completed` transition | `NN-VERIFICATION.md` frontmatter `status: passed` exists [VERIFIED: `.planning/phases/02-control-plane-skeleton/02-VERIFICATION.md:4`, read this session], `NN-REVIEW.md` absent |
| approval | no direct GSD-side signal | see Open Question 3 — GSD itself has no CEO-gate concept |
| deployment | `completed` | ROADMAP.md phase checkbox flips `[ ]`→`[x]`, `completed_phases` increments |

The exact GSD file-naming convention referenced above was verified by directly listing two real, already-executed phase directories in this repo [VERIFIED: `ls .planning/phases/01-event-schema-state-engine/` and `.../02-control-plane-skeleton/`, run this session] — both contain `NN-CONTEXT.md`, `NN-DISCUSSION-LOG.md`, `NN-RESEARCH.md`, `NN-PATTERNS.md`, `NN-VERIFICATION.md`, `NN-REVIEW.md`, `NN-SECURITY.md`, `NN-VALIDATION.md`, and one `NN-##-PLAN.md`/`NN-##-SUMMARY.md` pair per plan.

### Pattern 5: Derive connection status live — don't persist a second copy of it

D-03 requires heartbeat to be "an application-level event appended to the Postgres event log," and RUNTIME-04 requires online/stale/offline to be "visible in company state." The lazy-but-correct reading: only the heartbeat *event* needs to be persisted (satisfying D-03 literally); online/stale/offline itself is a **derived read** over (a) the most recent heartbeat event's `receivedAt` per `workerId`, and (b) whether that worker's WS socket is currently open on the API process. This needs zero new columns on the `workers` table [VERIFIED: `apps/api/src/db/schema.ts:24-30`, read this session — table currently has `id`/`secretHash`/`label`/`createdAt`/`revokedAt` only] and is consistent with EVENT-03's existing philosophy that all state is "materialized projections... read-only to downstream consumers" and rebuildable from the event log (EVENT-04) — connection status becomes one more projection over the same log, not a parallel source of truth. A single API process (no horizontal scaling this MVP, per STACK.md's explicit Redis deferral) can safely hold this in an in-memory `Map<workerId, { lastHeartbeatAt: Date; socketOpen: boolean }>`.

### Anti-Patterns to Avoid

- **`fs.watch`/`chokidar` on `.git` or `.planning`:** explicitly rejected by D-01 (git-internals event storms, unreliable Windows backend).
- **Trusting a process's cwd or command line for repo attribution on Windows:** see Pitfall 1 — verified this session to be unreliable; don't reach for a native PEB-reading dependency (`ffi-napi`, `koffi`) just to make this work — that's a large dependency-weight increase for a signal D-02 already permits degrading to "idle" on.
- **Trusting worker-supplied timestamps for connection status:** explicitly rejected by D-03 (clock skew) — always use server receipt time.
- **`z.looseObject()` on any new payload type:** the existing codebase comment is explicit — quoted verbatim [VERIFIED: `packages/event-schema/src/payloads/index.ts:19-22`, read this session]: "Every payload is a plain z.object() (never z.looseObject()) so unrecognized extra keys are stripped rather than passed through to the reducer." New `git.*`/`gsd.*`/`worker.heartbeat` payloads must follow the same rule.
- **Chained `.extend()` on the discriminated union:** same file's comment, quoted verbatim: "Composed via spread, never chained `.extend()` (Pitfall 2: quadratic typecheck cost as the union grows...)." This phase's new members must be added the same way as the existing 12.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Git worktree/branch/HEAD introspection | A custom `.git` internals parser | `git` porcelain subcommands via `execa` | Porcelain output is Git's own stable, documented, forward-compatible contract — verified this session against two real repos (Pattern 3) |
| YAML frontmatter parsing | Regex-based `---\n...\n---` extraction | `gray-matter` | STATE.md's `progress:` block is a nested YAML object (verified, see Standard Stack) — a line-regex parser breaks the moment nesting appears |
| WS reconnect/backoff state machine | `p-retry` or another generic retry library | Hand-roll ~15 lines per D-03's fully-specified algorithm (1s initial, doubling, cap 30s, 20-50% jitter) | D-03 already specifies the exact algorithm; `p-retry` was also flagged `SUS` this session — a generic retry-library API adds indirection for logic that's faster to write exactly to spec than to bend a library's API around |
| Worker credential/auth mechanics | A new auth scheme for the worker's WS connection | Existing `{workerId}.{secret}` Bearer scheme (`apps/api/src/auth/worker-auth.ts`, `credentials.ts` — built and tested in Phase 2) | Already built, already tested (`ws-auth.test.ts`, read this session) — this phase is a pure consumer |
| Event validation + durable insert | A second validate/insert code path over WS | Reuse `CompanyEventSchema.safeParse` + `db.insert(events).onConflictDoNothing()` — the exact logic already in `apps/api/src/routes/events.ts` [VERIFIED, read this session] | One tested, deduped, rate-limited ingestion path for every event type, including the new git/gsd/heartbeat ones — don't duplicate it inside the WS message handler |

**Key insight:** every "hard" problem in this phase (git introspection, YAML parsing, WS reconnect, auth, event validation) already has either an established library or an already-built-and-tested piece of this exact codebase solving it. The actual net-new code this phase writes is thin: diff-and-emit loops, and the GSD status/file-presence mapping table.

## Common Pitfalls

### Pitfall 1: Windows offers no reliable cwd/cmdline signal for "is Claude Code running against MY repo"

**What goes wrong:** Implementing D-02's process-liveness heuristic by reading a process's current working directory, or grepping its command line for the repo path, silently produces false negatives — or worse, false positives if two repos share a path substring.
**Why it happens:** Verified this session by direct execution on this exact Windows 11 machine: `where wmic` found nothing (WMIC has been removed from current Windows 11 builds [CITED: Microsoft Support, "Windows Management Instrumentation Command-line (WMIC) removal from Windows"]); the supported replacement, `Get-CimInstance Win32_Process`, exposes only `ProcessId`/`CommandLine` — there is no cwd field at all. And empirically, five real `claude.exe` processes running on this machine right now [VERIFIED: `Get-CimInstance Win32_Process -Filter "Name='claude.exe'"`, run this session] all show `CommandLine` of just `"C:\Users\shado\.local\bin\claude.exe"` (one with `--resume <session-id>`) — **no repo path appears anywhere in it.** This is a positive falsification of the naive "match cwd/cmdline against repo path" approach, not a guess.
**How to avoid:** Treat process-liveness as a coarse, repo-agnostic signal only ("is at least one `claude.exe`/`claude` process alive anywhere on this machine") and combine it with a repo-specific proxy that IS available cross-platform: whether the repo's git HEAD/status or `.planning/STATE.md` mtime advanced since the last poll tick. "Global process alive" AND "this repo's tracked files changed since the last tick" together approximate "this repo's role is active" without ever fabricating activity — satisfying D-02's own safe-degrade requirement. Implement D-02's "process-liveness matching heuristic" discretion point as this combination, not a cwd/cmdline match.
**Warning signs:** the office (Phase 5+) shows an agent idle the entire time a real session is visibly working in a terminal, or shows "active" for a repo nobody is touching because an unrelated `claude.exe` happens to be open elsewhere.

### Pitfall 2: STATE.md's `status:` field is coarser than GSD-01's 9-category list

**What goes wrong:** Mapping STATE.md's `status` field directly to GSD-01's category list (new project/research/requirements/planning/execution/verification/review/approval/deployment) collapses multiple distinct GSD-01 categories onto the same STATE.md status.
**Why it happens:** Verified this session by reading GSD's own source — the actual normalized vocabulary is only 7 tokens (Pattern 4 above): `planning`, `executing`, `verifying`, `paused`, `discussing`, `completed`, `unknown`. "research", "requirements", "review", "approval", and "deployment" are never STATE.md status values.
**How to avoid:** Use STATE.md's status as the coarse signal, then layer phase-directory file-presence checks (Pattern 4's table) to resolve the finer category, exactly as D-02 already specifies.
**Warning signs:** gsd-adapter code containing `if (status === 'research')` — this branch can never fire.

### Pitfall 3: A project's STATE.md may not carry a `current_phase` key at all

**What goes wrong:** Code that unconditionally reads `frontmatter.current_phase` to know which phase directory to inspect throws/returns undefined on a project that hasn't started its first phase.
**Why it happens:** Verified this session — SyncSmith's real STATE.md frontmatter [VERIFIED: `F:/Sidegigs/syncsmith/.planning/STATE.md:1-9`, read this session] is only:
```yaml
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
```
No `current_phase`/`current_phase_name` key exists, because SyncSmith has 0 completed phases and `ls .planning/phases` [VERIFIED: run this session] returned nothing — no phase directories exist on disk yet. PixelFirm's own STATE.md, by contrast, does carry both [VERIFIED: `F:/Sidegigs/PixelFirm/.planning/STATE.md:1-17`]: `current_phase: 3`, `current_phase_name: Worker, Git Adapter & GSD Adapter`.
**How to avoid:** gsd-adapter must treat "no phase started yet" as a first-class, valid state mapping to GSD-01's "new project" category — not an error path.
**Warning signs:** This exact case is guaranteed to be hit immediately when this phase is demoed against SyncSmith — see Open Question 4.

### Pitfall 4: `apps/api/src/routes/ws.ts` currently has zero broadcast/heartbeat handling

**What goes wrong:** Assuming server-side connection-status tracking already exists because the WS *auth gate* is already built.
**Why it happens:** Verified this session — the entire handler body [VERIFIED: `apps/api/src/routes/ws.ts:12-16`] is:
```typescript
(socket) => {
  // No broadcast logic yet — deferred to Phase 3+ per RESEARCH's
  // architecture diagram. This handler only proves the auth gate works.
  socket.on("close", () => {});
},
```
No message handler, no heartbeat timer, no broadcast. This phase must add all of it server-side in `apps/api`, not just the worker side.
**How to avoid:** Plan explicit tasks for `apps/api`'s WS message handler (parse heartbeat/git/gsd events, track last-seen-at per `workerId`, derive online/stale/offline) — this is not solely a `apps/worker` phase.

### Pitfall 5: A revoked worker credential doesn't close an already-open socket (Phase 2 gap, inherited)

**What goes wrong:** Assuming credential revocation immediately drops a live connection. Phase 2's own test suite [VERIFIED: `apps/api/src/routes/ws-auth.test.ts:130-136`, read this session] only proves revocation blocks a **new** connection attempt (`it("rejects a new connection attempt with the same credential after revocation")`) — it never asserts an already-open socket gets closed.
**Why it happens:** `authenticateWorker` runs in `preValidation`, once, at connection time — there's no ongoing re-check against `revokedAt` for a socket that's already past that gate.
**How to avoid:** Decide explicitly in this phase's planning whether to add active-session termination on revocation (a small V3 Session Management gap) or defer it (acceptable for now since no UI drives revocation until Phase 6's CEO dashboard) — see Open Question 2 and Security Domain.

## Code Examples

### Reusing the existing credential format
```typescript
// Source: apps/api/src/auth/credentials.ts:9-13 [VERIFIED, read this session]
export function issueCredential(workerId: string): { token: string; secretHash: string } {
  const secret = randomBytes(32).toString("hex");
  const secretHash = createHmac("sha256", env.CREDENTIAL_PEPPER).update(secret).digest("hex");
  return { token: `${workerId}.${secret}`, secretHash };
}
```
The worker's config (D-04) needs a `WORKER_TOKEN` env var holding exactly this `{workerId}.{secret}` string, obtained by calling the already-built `POST /admin/workers` endpoint [VERIFIED: `apps/api/src/routes/admin-workers.ts:34-59`, read this session] once out of band, then setting it as the worker's env var — no new credential-issuance code needed.

### Existing event-ingestion path the worker's events must validate against unchanged
```typescript
// Source: apps/api/src/routes/events.ts:15-19 [VERIFIED, read this session]
const parsed = CompanyEventSchema.safeParse(request.body);
if (!parsed.success) {
  return reply.code(400).send({ error: parsed.error.flatten() });
}
```

### GSD status vocabulary (for the gsd-adapter's own status-normalization step)
See Pattern 4 above for the full verbatim `STATUS_EXACT_TOKENS` quote.

### Illustrative new payload shapes (Claude's Discretion per CONTEXT.md — sketches, not yet in the codebase)
```typescript
// [ASSUMED — design sketch, not verified against an existing file since these
// types don't exist yet. Enum values ARE verified (Pattern 4).]
const WorkerHeartbeatPayload = z.object({ workerId: z.string() });
// type: "worker.heartbeat"

const GitWorktreeObservedPayload = z.object({
  repoPath: z.string(),
  branch: z.string(),
  worktreePath: z.string(),
  headSha: z.string(),
});
// type: "git.worktree_observed"

const GsdPhaseObservedPayload = z.object({
  phase: z.string().optional(), // absent for "new project" per Pitfall 3
  status: z.enum(["planning", "executing", "verifying", "paused", "discussing", "completed", "unknown"]),
});
// type: "gsd.phase_observed"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `wmic.exe` for Windows process/command-line introspection | PowerShell `Get-CimInstance Win32_Process` | WMIC removed from Windows 11 24H2/25H2 builds in 2026 preview updates [CITED: Microsoft Support removal notice, techcommunity.microsoft.com]; confirmed already absent on this exact development machine this session | Any worker code (or research/training data) assuming `wmic` is available is already wrong on the primary dev target — must use the CIM cmdlet from day one, not as a "future migration" |

**Deprecated/outdated:** `wmic.exe` — do not reference it in any worker code or docs; it does not exist on this machine.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `execa`'s `execa(file, args, options)` API returning a `{ stdout }`-shaped result, with no-shell array-argument safety by default, is unchanged at the pinned `^10.0.1` | Standard Stack, Architecture Patterns Pattern 1, Security Domain | Low risk (execa's core signature has been stable across major versions for years, per training knowledge), but Context7 lookup failed this session (monthly quota exceeded) so this is not doc-verified — confirm during Task 1's first implementation pass |
| A2 | Claude Code CLI is always a native `claude.exe`/`claude` binary (not sometimes an npm-installed `node.exe`-wrapped shim) across every machine this worker might run on | Pitfall 1, Environment Availability | Verified true only on THIS machine (`C:\Users\shado\.local\bin\claude.exe`, a real native exe). A different install method could produce a `node.exe`-wrapped process with a different signature — the process-liveness allowlist should include both `claude.exe`/`claude` AND `node.exe` with "claude" somewhere in `CommandLine`, to be safe |
| A3 | GSD-01's "approval" and "deployment" categories don't have a clean STATE.md/file-presence signal distinguishable from "completed"/"verifying" for a project like SyncSmith that has no CEO-gate concept of its own | Architecture Patterns Pattern 4, Open Question 3 | If wrong, the gsd-adapter's role-mapping table needs an additional signal source not yet identified |
| A4 | Hand-rolling the WS reconnect/backoff (rather than any library) is the right call, given Context7 for `ws` was also unreachable this session (quota exceeded) | Don't Hand-Roll | If `ws`'s own docs describe a built-in reconnect helper this session couldn't check, that could simplify implementation slightly — low-value to re-check given D-03 already fully specifies the algorithm |

**If this table is empty:** N/A — see entries above; none of these block planning, all are flagged for a cheap confirmation pass during implementation.

## Open Questions

1. **Event transport for git/gsd events: WS message vs. reusing `POST /events`?**
   - What we know: CONTEXT.md leaves this as Claude's Discretion; D-03 says the heartbeat specifically must go "via the existing event-append path."
   - What's unclear: whether "existing event-append path" should also carry git/gsd events, or whether they travel as WS messages the server converts internally.
   - Recommendation: reuse `POST /events` for every event type (git, gsd, heartbeat) — it's already validated, deduped, and rate-limited (Pattern 5, Don't Hand-Roll) — and keep the WS connection purely as the "worker is present" channel whose open/close state feeds connection-status derivation.

2. **Does credential revocation need to force-close an already-open worker socket?**
   - What we know: Phase 2's test suite only proves revocation blocks new connection attempts (Pitfall 5).
   - What's unclear: whether this phase's scope includes closing live sessions on revocation.
   - Recommendation: defer — no UI drives revocation until Phase 6's CEO dashboard exists; note it as a known, accepted gap in this phase's SECURITY.md rather than silently leaving it undocumented.

3. **How does the GSD adapter represent "approval" and "deployment" for a repo with no CEO-gate concept of its own?**
   - What we know: GSD's own STATE.md status vocabulary has no token for either category (Pattern 4).
   - What's unclear: whether "deployment" should just be "phase transitioned to completed in ROADMAP.md" and "approval" should be treated as N/A until PixelFirm's own Phase 6 CEO gate exists.
   - Recommendation: treat ROADMAP.md's phase-checkbox flip as the closest available proxy for "deployment," and treat "approval" as out of scope for GSD-01's SyncSmith demo until Phase 6 — flag this explicitly in the phase's plan rather than inventing a synthetic signal.

4. **SyncSmith currently has zero executed phases — what will the phase's demo actually show?**
   - What we know: verified this session — SyncSmith's STATE.md `status: planning`, `completed_phases: 0`, and `.planning/phases/` doesn't exist yet.
   - What's unclear: whether this phase's verification should accept demoing only the "new project"/"planning" GSD state, or whether SyncSmith needs to be advanced (e.g. by actually running `/gsd-plan-phase`/`/gsd-execute-phase` in that sibling repo) first to produce richer state to observe.
   - Recommendation: flag to the user before planning verification — the phase's own success criteria only require *observing* state changes, so even a transition from "no `.planning/phases/` dir" to "phase 1 CONTEXT.md appears" is a valid, real, demonstrable state change; a full multi-phase demo isn't required by RUNTIME-03/GSD-01's literal wording, but the plan should say explicitly which SyncSmith state transition it intends to prove against.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | git-adapter (all plumbing commands) | ✓ | ubiquitous; used directly this session against both PixelFirm and SyncSmith repos | — |
| Node.js | `apps/worker` runtime | ✓ | v25.9.0 [VERIFIED: `node --version`, run this session] | STACK.md recommends 22 LTS; 25.9.0 satisfies every library's stated minimum (Fastify 5 needs Node 20+) but isn't itself on the LTS track — version-hygiene note only, not blocking |
| PowerShell | git-adapter process-liveness (Windows) | ✓ | confirmed functional — `Get-CimInstance Win32_Process` ran successfully this session | POSIX branch (`ps`) for non-Windows worker hosts |
| `claude.exe` (Claude Code CLI) | process-liveness detection target | ✓ | native exe at `C:\Users\shado\.local\bin\claude.exe`; 5 instances observed running during this session | — |
| `wmic.exe` | (considered, rejected) | ✗ | confirmed absent — `where wmic` returned nothing this session | Not needed — `Get-CimInstance Win32_Process` is already the recommended approach |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `wmic.exe` — not used; superseded by `Get-CimInstance` from the start.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^5.0.1 [VERIFIED: root `package.json` devDependencies, read this session] |
| Config file | none — each package (`event-schema`, `company-core`) runs `vitest run` with defaults [VERIFIED: `packages/event-schema/package.json`, `packages/company-core/package.json`, read this session]; new packages should follow the same no-config convention |
| Quick run command | `pnpm --filter worker test` / `pnpm --filter git-adapter test` / `pnpm --filter gsd-adapter test` |
| Full suite command | `pnpm test` (Turborepo `test` task with `dependsOn: ["^test"]` [VERIFIED: `turbo.json`, read this session]) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| RUNTIME-03 | worker connects outbound-only, `--repo`/`WORKER_REPO_PATH` configurable and validated as a real worktree | integration | `pnpm --filter worker test -- ws-client` | ❌ Wave 0 |
| RUNTIME-04 | online/stale/offline derivation from heartbeat timing + socket state | integration | `pnpm --filter api test -- connection-status` | ❌ Wave 0 |
| WORKTREE-01 | repo/branch/worktree/agent/session recorded per active task | unit | `pnpm --filter git-adapter test -- worktree` | ❌ Wave 0 |
| WORKTREE-02 | never automatically merges a worktree's branch | static/negative | source-scan assertion (e.g. a test asserting no `execa("git", ["merge"`/`"rebase"`, ...])` call site exists in `git-adapter`'s source) — a runtime behavioral test would require actually attempting a merge to prove its absence, disproportionate for a negative claim | ❌ Wave 0 |
| GSD-01 | STATE.md status + file-presence → GSD-01 category + role mapping | unit | `pnpm --filter gsd-adapter test -- state-md` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the relevant package's quick run command above.
- **Per wave merge:** `pnpm test` (full Turborepo suite).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `apps/worker/src/*.test.ts` — none exist; new package, needs `"test": "vitest run"` script matching `event-schema`/`company-core`'s convention (no framework install needed — `vitest` is already a root devDependency)
- [ ] `packages/git-adapter/src/*.test.ts` — none exist; needs a temp-git-repo fixture helper (e.g. `execa("git", ["init"], { cwd: tmpDir })` in a `os.tmpdir()`-based fixture) to test worktree/commit parsing without depending on the real PixelFirm/SyncSmith repos
- [ ] `packages/gsd-adapter/src/*.test.ts` — none exist; needs fixture `.planning/` directories (literal copies of the real STATE.md snippets read this session are good starting fixtures, including the "no `current_phase` key" SyncSmith shape from Pitfall 3)
- [ ] `apps/api`'s WS route needs new heartbeat/connection-status test coverage (Pitfall 4) — extending the existing `ws-auth.test.ts` pattern, not a new framework

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Reuse the existing `{workerId}.{secret}` Bearer scheme (Phase 2, unchanged) — no new auth mechanism this phase |
| V3 Session Management | yes | D-03's connection lifecycle IS this phase's session model; Pitfall 5 flags a real gap (revocation doesn't force-close a live socket) — decide and document per Open Question 2 |
| V4 Access Control | yes | The pointed-at repo path is user-supplied local input (D-04); the worker only ever operates within its own OS user's filesystem permissions — no new server-side access-control surface since PROJECT.md already forbids the control plane from touching worker filesystems directly [VERIFIED: `.planning/PROJECT.md:69`, read this session: "worker connects... which must never need direct filesystem access to worker repos"] |
| V5 Input Validation | yes | `CompanyEventSchema` (existing) validates every new git/gsd/heartbeat payload the same way it validates the 12 seeded types; new payloads must be plain `z.object()` per the existing repo convention (Anti-Patterns) |
| V6 Cryptography | no | No new crypto surface — credential mechanics already built in Phase 2, reused unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Path traversal / arbitrary-path pointing via user-supplied `--repo`/`WORKER_REPO_PATH` | Tampering | D-04 already requires validating the path as an existing git worktree before proceeding — at minimum confirm `git -C <path> rev-parse --is-inside-work-tree` succeeds before trusting it |
| Command injection via `execa` git calls | Tampering | `execa` does not invoke a shell by default — always pass subcommand args as an array (`execa("git", ["rev-parse", "HEAD"], { cwd })`), never string-interpolate a shell command; this is `execa`'s own documented default-safe behavior [ASSUMED — training knowledge, Context7 unreachable this session] |
| Worker secret leakage via process listing | Information Disclosure | Verified this session that any locally-running process's `CommandLine` is visible to any other process via `Get-CimInstance Win32_Process` — prefer `WORKER_TOKEN` as an **env var**, not a CLI arg, since D-04 only mandates the repo path be configurable either way; env vars are not exposed through the same `CommandLine` visibility this session's probe demonstrated |
| Arbitrary git branch-name strings reaching future rendering surfaces (Phase 5+) unescaped | Tampering/Injection | Not this phase's concern — git-adapter should emit raw strings without premature HTML-escaping; Phase 7's server-side visibility filtering is the intended sanitization boundary and this phase shouldn't pre-empt its design |

## Sources

### Primary (HIGH confidence)
- Direct execution this session: `git worktree list --porcelain` (PixelFirm + SyncSmith), `git status --porcelain`, `git rev-parse HEAD`/`--abbrev-ref HEAD`, `node --version`, `where wmic`, `where claude`, PowerShell `Get-CimInstance Win32_Process` (run twice, against `node.exe` and `claude.exe`)
- Direct `Read` this session: `packages/event-schema/src/{envelope,payloads/index}.ts`, `apps/api/src/{routes/ws.ts,routes/events.ts,routes/admin-workers.ts,routes/ws-auth.test.ts,auth/worker-auth.ts,auth/credentials.ts,db/schema.ts,server.ts,env.ts}`, `packages/company-core/src/{index,projections,reducer}.ts`, `F:/Sidegigs/PixelFirm/.planning/{PROJECT.md,STATE.md,ROADMAP.md}`, `F:/Sidegigs/syncsmith/.planning/{STATE.md,config.json,ROADMAP.md}`, `C:\Users\shado\.claude\gsd-core\bin\lib\state-document.cjs:637-725`
- `gsd_run query package-legitimacy check` (npm registry, live) — `execa`, `simple-git`, `ws`, `gray-matter`, `js-yaml`, `p-retry`
- `npm view <pkg> version` (registry, live) — `execa`, `simple-git`, `ws`, `chokidar`, `@anthropic-ai/claude-agent-sdk`, `gray-matter`, `js-yaml`

### Secondary (MEDIUM confidence)
- None beyond Primary this session — every WebSearch lead used as a starting point was independently re-confirmed by direct execution against this machine's real state (see Primary).

### Tertiary (LOW confidence)
- WebSearch: Windows process cwd/cmdline retrieval methods, WMIC deprecation status, `git worktree list --porcelain` format — used only as leads; the claims actually relied on in this document are the directly-executed confirmations, not the search results themselves.
- Context7 lookups for `execa` and `ws` failed this session (monthly quota exceeded) — flagged in Assumptions Log (A1, A4).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version confirmed live via `npm view` + the `package-legitimacy` seam this session
- Architecture: HIGH — grounded in real, already-built Phase 1/2 code read this session, plus real GSD source (`state-document.cjs`) and real STATE.md instances from both PixelFirm and SyncSmith
- Pitfalls: HIGH — the two highest-risk pitfalls (Windows process attribution, STATE.md status vocabulary gap) were verified by direct execution/source-reading this session, not assumed

**Research date:** 2026-09-19
**Valid until:** 30 days (stable domain — git plumbing, GSD file conventions, and already-built Phase 1/2 code don't move fast; the wmic-removal finding is itself evidence this area moves on OS-update timescales, not days)

---
*Phase: 3-Worker, Git Adapter & GSD Adapter*
*Research completed: 2026-09-19*
