# Phase 3: Worker, Git Adapter & GSD Adapter - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-19
**Phase:** 3-Worker, Git Adapter & GSD Adapter
**Areas discussed:** Change detection mechanism, GSD state → role/event mapping signals, Worker connection lifecycle, Repo targeting configuration

---

## Change detection mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Polling (git + fs.stat) | `git rev-parse HEAD`/`git status --porcelain` + `fs.stat` on `.planning/state.json`, ~2-3s tick. Cross-platform-identical, zero new deps. | ✓ |
| Filesystem watching (chokidar) | Near-instant reactivity via chokidar on `.git/`/`.planning/`, but `.git` internals churn heavily and Windows fs-watch is the least reliable backend. | |

**User's choice:** Polling (git + fs.stat) — the advisor-recommended option.
**Notes:** Windows is the primary dev target for the worker; polling avoids per-platform fs-watch reliability issues and `.git` internal churn (index locks, packed-refs rewrites).

---

## GSD state → role/event mapping signals

| Option | Description | Selected |
|--------|-------------|----------|
| File state + process liveness | File presence/frontmatter status decides WHICH phase/role; a running `claude`/`gsd-*` process matched against the repo path decides WHETHER it's active. No new dependency (`child_process`). | ✓ |
| File state only | Zero OS coupling, but can only prove what was last completed — freezes or fabricates motion between file writes. | |

**User's choice:** File state + process liveness — the advisor-recommended option.
**Notes:** File-state-only conflicts with PROJECT.md's core value (no fabricated animation) since GSD artifacts are only written at phase/plan boundaries.

---

## Worker connection lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Application heartbeat event | Heartbeat logged through the same event-sourced pipeline as everything else — one liveness signal, fully auditable/replayable. | ✓ |
| Protocol-level ping/pong | Built into `ws`, low bandwidth, but invisible to the Postgres event log unless separately plumbed — a second liveness mechanism that can drift from event-sourced state. | |

**User's choice:** Application heartbeat event — the advisor-recommended option.
**Notes:** Thresholds locked from research: online <10s since last heartbeat (server receipt time), stale at 1-2 missed heartbeats (~10-20s, socket still open), offline on close/error or 3+ missed heartbeats (~30s). Reconnect: exponential backoff 1s→30s with jitter.

---

## Repo targeting configuration

| Option | Description | Selected |
|--------|-------------|----------|
| CLI arg/env var, one repo per worker | Worker takes a repo path at startup; N repos = N isolated OS processes. Matches RUNTIME-03's success criterion exactly. | ✓ |
| Config file, one worker watches many repos | Positions for future multi-repo-per-worker, but pulls forward config-schema/concurrent-watcher complexity nothing in Phase 3 requires. | |

**User's choice:** CLI arg/env var, one repo per worker — the advisor-recommended option.
**Notes:** Multi-repo support (if ever needed) layers on top later as a supervisor spawning multiple single-repo workers — no rework of this phase's worker internals.

---

## Claude's Discretion

- Exact poll interval value within ~2-3s (hardcoded vs. env-configurable)
- Exact process-liveness matching heuristic (cwd match, process name allowlist, or combination) — must degrade safely to "idle" on ambiguous matches, never fabricate "active"
- Exact heartbeat event type name/payload shape and its place in the existing 12-member discriminated union
- CLI-arg-vs-env-var precedence and exact flag/var naming
- Git adapter's exact event payload shape for commit/branch/worktree data (extends Phase 1's minimal `GitCommitCreatedPayload`)
- Module boundary between `packages/git-adapter`, `packages/gsd-adapter`, and `apps/worker`

## Deferred Ideas

None — discussion stayed within phase scope.
