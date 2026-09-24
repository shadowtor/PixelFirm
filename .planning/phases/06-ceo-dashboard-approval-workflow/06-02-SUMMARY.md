---
phase: 06-ceo-dashboard-approval-workflow
plan: 02
subsystem: claude-adapter
status: complete
tags: [ceo-gate, permissions, pretooluse-hook, watchdog, security]
requires: ["06-01"]
provides:
  - "PreToolUse ask backstop: settings allow rules can no longer approve a CEO-gated call"
  - "classifySignal covering CEO-04 per the narrow + gate-paths decision"
  - "STRIPPED_ENV_KEYS (provider credentials, Bedrock/Vertex, dialog timeout, WORKER_TOKEN)"
  - "parkedCount watchdog/Notification suspension (D-03) and ceo.approval_expired aborted/superseded (D-02)"
affects: ["06-04", "06-11", "06-14"]
tech-stack:
  added: []
  patterns:
    - "Hook and gate share one classifier, so PreToolUse and canUseTool never disagree"
    - "Per-invocation counters next to isCurrent, never on the shared TaskRecord"
key-files:
  created: []
  modified:
    - packages/claude-adapter/src/signal-detection.ts
    - packages/claude-adapter/src/signal-detection.test.ts
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
decisions:
  - "CEO-04 gate width: A = narrow (pushes to main/master or forced, merge/rebase/reset --hard, named-package dependency changes, MCP tools with a destructive word in the name)"
  - "CEO-04 production changes: B = gate-paths (Write/Edit/MultiEdit/NotebookEdit on production config, deploy-hook WebFetch, shell writes into those files)"
  - "Rejected awaitDecision reports reason aborted when the SDK signal aborted, else superseded (the payload enum has no generic reason)"
metrics:
  duration: "10min (continuation after the Task 1 checkpoint)"
  completed: 2026-09-24
actuals:
  tokens: 8942
  tasks: 2
  commits: 3
plan_head_before: fa9ebee318c23a53ba789e803e45c45b6f50d3b5
---

# Phase 06 Plan 02: CEO gate backstop, widened classifier, parked-call lifecycle Summary

A PreToolUse hook now returns "ask" for every classified call, so a settings allow rule can't approve it. The classifier covers CEO-04 under the user's narrow + gate-paths decision. The subprocess env drops eight credential and timeout keys. A parked call suspends the watchdog and the Notification hook, and if an abort or a newer invocation cuts it off, it resolves to deny and posts a PRIVATE `ceo.approval_expired`.

## CEO-04 production-change sign-off (Task 1 decision)

User reply, verbatim:

```
A. - Narrow
B. - gate-paths
```

Chosen option ids: A = `narrow`, B = `gate-paths`.

**Gated by this decision:**
- Bash: force-push (existing), `rm -rf`, `DROP TABLE|DATABASE`, `npm publish` / anything containing `deploy` (existing), a `git push` naming `main` or `master`, `git merge`, `git rebase`, `git reset ... --hard`, npm/pnpm/yarn/bun add/remove/rm/uninstall/update/upgrade, npm/pnpm/bun install or `i` with a package argument, `pip install`.
- MCP: any `mcp__*` tool whose name contains deploy, delete, destroy, drop, remove, restart, stop, publish, push or merge.
- Write/Edit/MultiEdit/NotebookEdit on Dockerfile*, *.dockerfile, docker-compose*, compose*.yml|yaml, .env and .env.*, wrangler.toml|json|jsonc, nginx*.conf, *.tf/*.tfvars, anything under .github/workflows/ (backslashes normalised, case-insensitive).
- WebFetch to a URL containing deploy, webhook or /hook(s)/.
- Bash writes into those files: a `>`/`>>` redirect, tee, sed -i, cp or mv naming one.

**Signed off as ungated by choosing "narrow":**
- A deploy through a feature-branch push (for example `git push origin feature/x` to a branch Coolify deploys from).
- An MCP tool whose name has none of the destructive words.

**Signed off as ungated by choosing "gate-paths":**
- A script or binary that deploys under an innocuous name (for example `node scripts/release.mjs`).
- Indirect writes (for example a `node -e` script editing a config file).
- A deploy endpoint whose URL contains none of deploy, webhook or /hook(s)/.

**Concrete case inside the signed-off MCP residual, for the user to confirm:** the Coolify MCP groups operations behind an `action` argument, so the tool name doesn't always show what the call does. `mcp__coolify__service` / `mcp__coolify__application` with action restart/stop/delete, and `mcp__coolify__env_vars` (which edits production env vars), have no destructive word in the name and are **not gated** under narrow. `mcp__coolify__deploy` and `mcp__coolify__deployment` are gated. The narrow option as worded checks the tool name only, so I implemented exactly that. Gating these too would mean applying `DESTRUCTIVE_MCP_NAME` to a string `action` input as well, which is one line plus a test.

The same residual list is in the `signal-detection.ts` header comment.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Gate-width decision (checkpoint) | n/a, resolved by user reply | this SUMMARY |
| 2 | PreToolUse ask backstop, widened classifier, env strip set | f960358 | signal-detection.ts/.test.ts, claude-code-runtime.ts/.test.ts |
| 3 | Parked-call lifecycle (RED) | 1f130e7 | claude-code-runtime.test.ts |
| 3 | Parked-call lifecycle (GREEN) | c60b8c8 | claude-code-runtime.ts |

## What was built

- `signal-detection.ts`: new named patterns `push to main/master`, `merge/rebase/reset --hard`, `dependency change`, `production config write`, plus `PRODUCTION_CONFIG_PATTERNS` and branches for the file tools, WebFetch and `mcp__` tools. The reason text after ": " is the pattern name the dashboard shows (06-14).
- `claude-code-runtime.ts`: a `hooks.PreToolUse` callback (classified call gets `permissionDecision: "ask"`, anything else gets `{}`, and a superseded invocation still gets "ask"). Module constant `STRIPPED_ENV_KEYS`. A per-invocation `parkedCount`: the watchdog returns early while it is above zero, the Notification hook does the same, and `watchdog.reset()` runs when a parked call resolves. Rejected or superseded parks post `ceo.approval_expired` and return deny.
- `settingSources` is untouched (not set in this runtime).

## Verification

- `vitest run` (claude-adapter): 79 passed, 3 skipped (integration, needs a live claude), 0 failed.
- `tsc --noEmit`: clean.
- `grep -c "parkedCount > 0" claude-code-runtime.ts` = 2.

## TDD Gate Compliance

- Task 2 RED ran before the implementation (vitest run, 77 tests: 64 pass, 10 fail, 3 skipped. Counted from that run's summary line: `# tests 77`, `# pass 64`, `# fail 10`). **Violation:** the RED tests and the implementation went into one commit (f960358) instead of a separate `test(...)` commit first.
- Task 3: RED commit 1f130e7 (tap-flat run: 82 lines, 76 `ok` including the 3 skipped, 6 `not ok`. Counters: `# tests 82`, `# pass 76`, `# fail 6`), then GREEN commit c60b8c8.

## Deviations from Plan

**1. [Spec-mandated test update] Existing "awaitDecision that throws" test message**
- Task 3 changes the rejection deny message from "No CEO decision was received; ..." to "No CEO decision was applied; ...". I updated the 06-01 test's expected string to match, in the RED commit.

**2. [Rule 1 - Bug] Dependency pattern extended to flags before the subcommand**
- `pnpm --filter api update zod` has flags before `update`, so the pattern allows anything between the manager and the subcommand, as long as it stays inside one command segment (no `|;&` in between). The trade-off is that a script name containing a subcommand word, like `npm run remove-x`, also parks. That errs toward closed.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the PreToolUse hook, which is already T-06-02-01.

## Self-Check: PASSED

- FOUND: packages/claude-adapter/src/signal-detection.ts, signal-detection.test.ts, claude-code-runtime.ts, claude-code-runtime.test.ts
- FOUND commits: f960358, 1f130e7, c60b8c8
