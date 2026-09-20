---
phase: 03-worker-git-adapter-gsd-adapter
plan: 02
subsystem: infra
tags: [execa, git, vitest, tdd, powershell]

requires:
  - phase: 03-worker-git-adapter-gsd-adapter
    provides: "CompanyEventSchema's git.worktree_observed/gsd.phase_observed/worker.heartbeat payloads and company-core reducer handlers (03-01), which this plan's future consumer (Plan 04's worker) will populate from real observed data"
provides:
  - "packages/git-adapter — a new, standalone workspace package with readHead/readBranch/isGitWorktree/listWorktrees/isAnyClaudeProcessAlive, no dependency on apps/worker or packages/gsd-adapter"
  - "A structural (source-scan) test proving the package can never issue a mutating git subcommand (WORKTREE-02)"
affects: [03-04-worker-integration]

actuals:
  tokens: 2933
  tasks: 2
  commits: 4

tech-stack:
  added: ["execa@^10.0.1"]
  patterns:
    - "execa array-args-only (never a shell-interpolated string) for every git/PowerShell/ps subprocess call — command-injection mitigation (T-03-05)"
    - "Validator functions that must never throw (isGitWorktree, isAnyClaudeProcessAlive) wrap the body in try/catch and resolve a safe default (false) on any error, rather than propagating"
    - "git worktree list --porcelain parsed by splitting stdout on blank-line-separated blocks, then each line on the FIRST space only (preserves multi-word values)"

key-files:
  created:
    - packages/git-adapter/package.json
    - packages/git-adapter/tsconfig.json
    - packages/git-adapter/src/index.ts
    - packages/git-adapter/src/commit.ts
    - packages/git-adapter/src/commit.test.ts
    - packages/git-adapter/src/worktree.ts
    - packages/git-adapter/src/worktree.test.ts
    - packages/git-adapter/src/process-liveness.ts
    - packages/git-adapter/src/no-mutating-git.test.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "gsd_run check tdd-red-evidence's TAP parser targets node --test summaries, which Vitest doesn't emit — RED evidence verified manually both times (same gap flagged in 03-01's STATE.md decision log, confirmed here as a recurring GSD tooling gap on this Vitest-based repo, not plan-specific)"
  - "no-mutating-git.test.ts's own detection capability was proven by temporarily injecting a `[\"merge\", ...]` execa call into the worktree.ts RED stub, confirming the test failed, then reverting before the RED commit — per PLAN.md's explicit acceptance criterion, never left in committed source"
  - "isAnyClaudeProcessAlive manually invoked in this session's real environment (not just its own automated test, since PLAN.md's <files> list has no dedicated process-liveness.test.ts) — resolved a real boolean (true), confirming Windows PowerShell Get-CimInstance path works end-to-end"
  - "listWorktrees/isGitWorktree additionally verified against the real PixelFirm and SyncSmith repos (not just the temp fixture) — both resolved isGitWorktree: true with exactly 1 worktree record each, matching PLAN.md's must_haves truth claim exactly"

patterns-established:
  - "Pattern: RED-phase stub functions throw new Error(\"not implemented\") rather than returning wrong-shaped defaults, so every target assertion in the RED test genuinely fails on the awaited rejection instead of a silently-passing edge case"

requirements-completed: [WORKTREE-01, WORKTREE-02]

coverage:
  - id: D1
    description: "readHead/readBranch/isGitWorktree resolve real values against a temp git fixture; isGitWorktree never throws (resolves false) for a non-git path"
    requirement: "WORKTREE-01"
    verification:
      - kind: unit
        ref: "packages/git-adapter/src/commit.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "listWorktrees parses real `git worktree list --porcelain` output into WorktreeRecord[] (path/headSha/branch, refs/heads/ prefix stripped), proven against both a temp fixture and the real PixelFirm/SyncSmith repos"
    requirement: "WORKTREE-01"
    verification:
      - kind: unit
        ref: "packages/git-adapter/src/worktree.test.ts (3 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No non-test .ts source file under packages/git-adapter/src invokes a mutating git subcommand (merge/rebase/--force/-D/checkout) as a quoted argument — structural guarantee for WORKTREE-02"
    requirement: "WORKTREE-02"
    verification:
      - kind: unit
        ref: "packages/git-adapter/src/no-mutating-git.test.ts (1 test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "isAnyClaudeProcessAlive resolves a boolean, never throws, on this session's real Windows 11 environment"
    verification:
      - kind: manual_procedural
        ref: "manual node invocation of process-liveness.ts during GREEN, resolved boolean true"
        status: pass
    human_judgment: false

duration: ~11min
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 2: Git Adapter Summary

**`packages/git-adapter`: a read-only git observation layer (readHead/readBranch/isGitWorktree/listWorktrees/isAnyClaudeProcessAlive) built entirely on execa array-args subprocess calls, with a structural source-scan test proving the package can never issue a mutating git command.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-09-20T01:50:00Z (approx)
- **Completed:** 2026-09-20T02:00:54Z
- **Tasks:** 2
- **Files modified:** 9 created, 1 modified (pnpm-lock.yaml)

## Accomplishments
- Scaffolded `packages/git-adapter` as a new pnpm workspace member, mirroring `packages/company-core`'s package.json/tsconfig.json shape exactly
- `commit.ts`: `readHead`/`readBranch` run real `git rev-parse` plumbing via execa; `isGitWorktree` validates a path is a real worktree and never throws (fail-closed on any error)
- `worktree.ts`: `listWorktrees` parses real `git worktree list --porcelain` output (blank-line-separated blocks, first-space key/value split, `refs/heads/` prefix stripped), verified against both a temp fixture and the real PixelFirm/SyncSmith repos
- `process-liveness.ts`: `isAnyClaudeProcessAlive` is a coarse, repo-agnostic "is any Claude process alive anywhere" check (PowerShell `Get-CimInstance Win32_Process` on Windows, `ps` on POSIX), fail-closed to `false` on any error per D-02's safe-degrade requirement
- `no-mutating-git.test.ts`: a structural (source-scan) test proving no non-test `.ts` file under `packages/git-adapter/src` contains a quoted mutating git subcommand token (merge/rebase/--force/-D/checkout) — WORKTREE-02's permanent guarantee, enforced from the package's first commit
- Full TDD RED→GREEN cycle for both tasks (4 commits, no REFACTOR needed — implementations matched RESEARCH.md's sketches on the first GREEN pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: git-adapter package scaffold + commit.ts** - `2e6db56` (test — RED), `f36d0fa` (feat — GREEN)
2. **Task 2: worktree.ts + process-liveness.ts + no-mutating-git.test.ts** - `456b0ce` (test — RED), `fbe7216` (feat — GREEN)

**Plan metadata:** (this commit)

_Both tasks: no REFACTOR commit — the GREEN implementation matched RESEARCH.md's Pattern 1/3 sketches exactly, nothing to clean up._

## Files Created/Modified
- `packages/git-adapter/package.json` - workspace package manifest (execa dependency, vitest test script)
- `packages/git-adapter/tsconfig.json` - extends root tsconfig, mirrors company-core's shape
- `packages/git-adapter/src/index.ts` - re-exports all five functions/types
- `packages/git-adapter/src/commit.ts` - readHead, readBranch, isGitWorktree
- `packages/git-adapter/src/commit.test.ts` - 4 tests against a real temp-git-repo fixture
- `packages/git-adapter/src/worktree.ts` - WorktreeRecord interface, listWorktrees
- `packages/git-adapter/src/worktree.test.ts` - 3 tests against the same fixture pattern
- `packages/git-adapter/src/process-liveness.ts` - isAnyClaudeProcessAlive
- `packages/git-adapter/src/no-mutating-git.test.ts` - WORKTREE-02 structural negative test
- `pnpm-lock.yaml` - execa@^10.0.1 dependency resolved/linked

## Decisions Made
- RED-phase stubs throw `new Error("not implemented")` (rather than returning wrong-shaped defaults) so every target test fails on a genuine rejection, not a silently-passing edge case
- `process-liveness.ts` has no dedicated automated test file (matches PLAN.md's `<files>` list for Task 2) — proven instead by direct manual invocation in this session's real environment, per the plan's own acceptance criteria
- Manually confirmed `no-mutating-git.test.ts` actually detects a violation (temporarily injected a `git merge` call into the RED stub, watched the test fail, reverted before committing) — required by PLAN.md's acceptance criteria, not left in history

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gsd_run check tdd-red-evidence` could not be used for either RED phase — its TAP parser targets `node --test`'s summary lines, which Vitest doesn't emit (same gap 03-01 already flagged in STATE.md). RED evidence was verified manually both times by reading the actual Vitest failure output and confirming the named target tests failed on real assertions/rejections, not module-resolution or fixture crashes.
- `npx tsc --noEmit` on `packages/git-adapter` surfaces `TS2307`/`TS7006`/`TS2580` errors (missing `@types/node`, implicit `any`). Confirmed this is a pre-existing, repo-wide gap — running the same raw `tsc --noEmit` against `packages/company-core`, `packages/event-schema`, and `apps/api` produces the identical class of errors (`TS2835` missing `.js` extensions, also previously flagged in 03-01's SUMMARY). No package in this repo has a working `tsc --noEmit`/`typecheck` script; the only verification contract this repo uses is `vitest run`, which passes cleanly for all 8 git-adapter tests. Out of scope per the executor's scope boundary — not introduced by this plan.
- `pnpm test` (root) has no `test` script; the correct full-suite command is `npx turbo run test`. Ran it: `git-adapter`, `event-schema`, and `company-core` all pass fully (8/8, 30/30, 19/19). `apps/api`'s DB-dependent tests fail/skip because no test Postgres container is running on this machine for PixelFirm (port 5434, per 02-01's STATE.md note) — an environment precondition unrelated to git-adapter, which has zero dependency on `apps/api` or the database. Out of scope per the executor's scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `packages/git-adapter` is feature-complete for this phase and ready for Plan 04's `apps/worker` poll loop to consume (readHead/readBranch/isGitWorktree/listWorktrees/isAnyClaudeProcessAlive all exported from `index.ts`)
- No dependency on `apps/worker` or `packages/gsd-adapter` — matches the plan's objective exactly
- No blockers or concerns carried forward

---
*Phase: 03-worker-git-adapter-gsd-adapter*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 9 created files verified present on disk; all 4 task commits (`2e6db56`, `f36d0fa`, `456b0ce`, `fbe7216`) verified present in git log; `pnpm --filter git-adapter test` passes 8/8; `npx turbo run test` confirms no regression in `event-schema`/`company-core` (git-adapter's only potential shared-file touch was `pnpm-lock.yaml`, additive only).
