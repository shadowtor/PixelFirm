---
phase: 04-agentruntime-claudecoderuntime
plan: 04
subsystem: testing
tags: [claude-agent-sdk, integration-test, gsd-slash-command, event-schema, git-worktree]

# Dependency graph
requires:
  - phase: 04-agentruntime-claudecoderuntime
    provides: ClaudeCodeRuntime's full eight-method AgentRuntime implementation (04-01/04-02/04-03)
provides:
  - A gated, real (non-mocked) end-to-end proof that ClaudeCodeRuntime.startTask drives a genuine Claude Code + GSD slash-command session, with every posted event schema-validated
  - Permanent evidence record (04-04-demo-evidence.md) of one real RUNTIME-02 demo run
affects: [phase 05 pixel office renderer, phase 06 CEO dashboard (both consume real ClaudeCodeRuntime events, not mocks)]

actuals:
  tokens: 3540
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Gated real-integration test via describe.skipIf(process.env.CLAUDE_CODE_INTEGRATION_TEST !== \"1\") — default pnpm test never requires live Claude Code auth"
    - "Disposable git worktree via execa array-args (never shell string) against a real sibling repo, verified isolated via listWorktrees/isGitWorktree before use, torn down with plain `git branch -d` (never -D/--force)"
    - "Evidence-before-cleanup: full receivedEvents + terminal status written to disk unconditionally before the disposable worktree/branch is removed"

key-files:
  created:
    - packages/claude-adapter/src/claude-code-runtime.integration.test.ts
    - .planning/phases/04-agentruntime-claudecoderuntime/04-04-demo-evidence.md
    - .planning/phases/04-agentruntime-claudecoderuntime/deferred-items.md
  modified:
    - packages/claude-adapter/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Demo target: SyncSmith Phase 1 (Foundation & Self-Hosted Deployment), the lowest-numbered phase still showing \"Plans: TBD\" with no CONTEXT.md yet"
  - "Demo prompt: /gsd-discuss-phase 1 (smallest, lowest-risk real GSD slash-command that writes exactly one file — not /gsd-execute-phase, which would be disproportionate to what this demo needs to prove)"
  - "Human approved the demo evidence and SyncSmith's restored clean state (verbatim record below)"

patterns-established:
  - "Real-repo integration tests for this monorepo's adapters live as *.integration.test.ts, env-gated, with their own vitest script (test:integration) kept out of the default test task"

requirements-completed: [RUNTIME-01, RUNTIME-02]

coverage:
  - id: D1
    description: "ClaudeCodeRuntime.startTask drives one real Claude Code session (real, authenticated CLI/SDK, no ANTHROPIC_API_KEY) against the real SyncSmith repository in a disposable, verified-isolated git worktree"
    requirement: RUNTIME-01
    verification:
      - kind: integration
        ref: "packages/claude-adapter/src/claude-code-runtime.integration.test.ts (CLAUDE_CODE_INTEGRATION_TEST=1 pnpm --filter claude-adapter run test:integration)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every event ClaudeCodeRuntime posts during the real demo run (task.status_changed, ceo.approval_requested) parses successfully against CompanyEventSchema.safeParse; a real terminal AgentTaskStatus is reached and recorded"
    requirement: RUNTIME-02
    verification:
      - kind: integration
        ref: "packages/claude-adapter/src/claude-code-runtime.integration.test.ts (CompanyEventSchema.safeParse assertion over receivedEvents)"
        status: pass
    human_judgment: false
  - id: D3
    description: "SyncSmith's real repository is restored to its exact pre-demo state after cleanup (no leftover disposable worktree, no throwaway branch, no modification to main) — independently re-verified by a human, not just trusted from Task 2's own cleanup step"
    verification: []
    human_judgment: true
    rationale: "Repository-state safety after a real, non-sandboxed Claude Code session against a sibling repo is exactly the class of claim that must be independently re-verified by a human, not self-attested by the same process that ran the demo (T-04-10)."

duration: ~9min (Task 1 + Task 2 execution, commit-to-commit) + human checkpoint wait
completed: 2026-09-21
status: complete
---

# Phase 04 Plan 04: Real ClaudeCodeRuntime Demo Against SyncSmith Summary

**Live end-to-end proof: ClaudeCodeRuntime.startTask ran a real `/gsd-discuss-phase 1` session against a disposable SyncSmith worktree, posted 4 schema-valid events (including a genuine unscripted `AskUserQuestion` → CEO-approval signal), reached `completed`, and left SyncSmith's repository exactly as found.**

## Performance

- **Duration:** ~9 min execution (Task 1 commit `aa1634a` 08:25:05 to Task 2 commit `f49035a` 08:29:16, local +10:00) plus human checkpoint wait for Task 3's approval
- **Started:** 2026-09-20 (Task 1)
- **Completed:** 2026-09-21 (Task 3 approval + this summary)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 6 (package.json, pnpm-lock.yaml, integration test file, demo-evidence.md, deferred-items.md, this SUMMARY.md)

## Accomplishments

- Built a gated `claude-code-runtime.integration.test.ts` that creates a real, isolated disposable git worktree against F:/Sidegigs/syncsmith (verified via `listWorktrees`/`isGitWorktree` before use), reuses `apps/worker/src/index.integration.test.ts`'s exact local HTTP+WS stub-server pattern, and is skipped by default (`describe.skipIf`) so the ordinary `pnpm --filter claude-adapter test` run never requires live Claude Code auth.
- Drove a real `ClaudeCodeRuntime.startTask` call with prompt `/gsd-discuss-phase 1` against the disposable worktree to a real terminal status (`completed`), polling `.getStatus()` until terminal or the 600s bound.
- Captured all 4 posted events, validated every one against `CompanyEventSchema.safeParse`, and confirmed a `task.status_changed` event for `demo-task-1` matching the final status — including an unscripted `ceo.approval_requested` event triggered by Claude's own `AskUserQuestion` clarifying question mid-run, proving the requestReview signal path fires on real model behavior, not a scripted trigger.
- Wrote the full evidence record (events, terminal status, chosen phase/command, worktree/branch identifiers, timestamp) to `04-04-demo-evidence.md` unconditionally before cleanup, then removed the disposable worktree and branch with plain `git worktree remove` / `git branch -d`.
- Human independently re-ran all four Task 3 verification checks and approved: evidence content is real (not fabricated), `git status --porcelain` empty, `git worktree list` shows only the main worktree, no `pixelfirm-demo-*` branches remain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pick the demo target and write the gated integration test's fixture setup** - `aa1634a` (test)
2. **Task 2: Drive the real ClaudeCodeRuntime task to completion, validate every posted event, write evidence** - `f49035a` (feat)
3. **Task 3: Confirm the demo evidence and SyncSmith's restored clean state** - checkpoint:human-verify, no code changes (verification-only)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/claude-adapter/src/claude-code-runtime.integration.test.ts` - Gated real-integration test: disposable worktree setup, real `startTask`/`getStatus` drive, `CompanyEventSchema` validation, evidence write, cleanup
- `packages/claude-adapter/package.json` - Added `execa`, `git-adapter` workspace dep, `@types/node`, and `test:integration` script
- `.planning/phases/04-agentruntime-claudecoderuntime/04-04-demo-evidence.md` - Permanent evidence record of the real run
- `.planning/phases/04-agentruntime-claudecoderuntime/deferred-items.md` - Logged one pre-existing, out-of-scope typecheck issue (see below)
- `pnpm-lock.yaml` - Lockfile update for new devDependencies

## Decisions Made

- Demo target: SyncSmith Phase 1 (Foundation & Self-Hosted Deployment) — lowest-numbered phase still showing "Plans: TBD" at execution time, re-verified fresh rather than trusting the plan's draft-time snapshot.
- Demo prompt: `/gsd-discuss-phase 1` — chosen over `/gsd-plan-phase` (CONTEXT.md didn't exist yet) and over `/gsd-execute-phase` (disproportionately larger/riskier than needed to prove RUNTIME-02).
- **Human checkpoint approval (Task 3, recorded verbatim):** the human replied **"approved"** after independently re-verifying all four checks: (1) 04-04-demo-evidence.md content confirmed real — real phase 1 target, real disposable paths/branch names, real timestamps, 4 schema-valid events including a genuine unscripted `AskUserQuestion` → `ceo.approval_requested`/`waiting_for_review` signal, then `completed`; (2) `git -C F:/Sidegigs/syncsmith status --porcelain` → empty; (3) `git -C F:/Sidegigs/syncsmith worktree list` → only the main worktree at `1987f24`; (4) `git -C F:/Sidegigs/syncsmith branch --list "pixelfirm-demo-*"` → no output. All four passed.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2. Task 3 (checkpoint) required no code changes — it was resolved by the human's own independent re-verification and "approved" reply.

### Known Non-Blocking Issue (logged, not fixed — out of scope per SCOPE BOUNDARY)

**[Pre-existing] `pnpm --filter claude-adapter typecheck` fails with 3 `TS2835` errors**
- **Found during:** Task 1 (once the integration test imports `event-schema` for the first time from `claude-adapter`)
- **Issue:** `packages/event-schema/src/index.ts`'s own relative imports (`./payloads/index`, `./envelope`) are missing `.js` extensions required by this monorepo's `moduleResolution: "nodenext"`
- **Confirmed pre-existing, not caused by this plan:** `pnpm --filter worker typecheck` (an existing, unmodified consumer of `event-schema`) fails with the identical 3 errors against the same file
- **Impact:** None on this plan's actual verify command — Vitest (esbuild-based, not tsc) does not enforce this, so `CLAUDE_CODE_INTEGRATION_TEST=1 pnpm --filter claude-adapter run test:integration` passed cleanly
- **Recorded in:** `.planning/phases/04-agentruntime-claudecoderuntime/deferred-items.md` — worth fixing `event-schema/src/index.ts`'s own import extensions in a future plan

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (The demo used the already-authenticated local Claude Code CLI/SDK per Phase 4's existing subscription-based auth, no new setup.)

## Next Phase Readiness

- RUNTIME-01 and RUNTIME-02 are both now demonstrated live, not just unit-tested — ClaudeCodeRuntime's full eight-method AgentRuntime is proven against a real Claude Code session with real GSD workflow content.
- Phase 04 (AgentRuntime & ClaudeCodeRuntime) is now complete at the plan level: all 4 plans (04-01 through 04-04) executed and summarized.
- Phase 05 (pixel office renderer) and Phase 06 (CEO dashboard) can now consume real ClaudeCodeRuntime events with confidence the event stream reflects genuine agent behavior, not a mock.
- One non-blocking pre-existing typecheck gap (`event-schema` import extensions) remains logged in deferred-items.md for a future plan.

---
*Phase: 04-agentruntime-claudecoderuntime*
*Completed: 2026-09-21*
