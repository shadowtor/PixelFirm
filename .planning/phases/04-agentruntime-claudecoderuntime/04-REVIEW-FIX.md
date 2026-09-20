---
phase: 04-agentruntime-claudecoderuntime
fixed_at: 2026-09-21T09:25:00Z
review_path: .planning/phases/04-agentruntime-claudecoderuntime/04-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-21T09:25:00Z
**Source review:** .planning/phases/04-agentruntime-claudecoderuntime/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (3 critical, 2 warning — `fix_scope: critical_warning`, Info findings IN-01/IN-02 out of scope)
- Fixed: 5
- Skipped: 0

**Verification environment:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so all edits, commits, and verification (tests/typecheck) ran directly in the main checkout at `F:/Sidegigs/PixelFirm` — no isolated worktree was created, per the documented opt-out.

## Fixed Issues

### CR-01: No env isolation — a stray ANTHROPIC_API_KEY in the host process is silently forwarded to and used by the subprocess

**Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`
**Commit:** `b7f8e06`
**Applied fix:** `runQuery`'s `query()` call now explicitly sets `options.env` to `process.env` with `ANTHROPIC_API_KEY` filtered out, rather than omitting `env` (which the SDK's own `sdk.d.ts` documents as "inherits the full `process.env`"). Applied exactly as the review's suggested fix.

### CR-02: pauseTask/cancelTask's precondition never clears — either can silently corrupt an already-terminal task's status

**Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`
**Commit:** `b6a7089`
**Applied fix:** Added a `TERMINAL_STATUSES` constant (`completed`/`failed`/`cancelled`) and extended both `pauseTask`'s and `cancelTask`'s precondition to also throw when `record.status` is already terminal, not just when `record.controller` is falsy. Adapted from the review's suggested `CANCELLABLE_STATUSES` allowlist to a `TERMINAL_STATUSES` blocklist instead — the allowlist example in REVIEW.md (`["starting", "running", "paused", "waiting_for_review"]`) would have also blocked cancelling a genuinely `"blocked"` (hung) task, which is not what the finding describes as broken and would remove a needed capability (killing a hung task). The blocklist targets exactly the described defect: a stray/duplicate call flipping an already-terminal task's status.

### CR-03: No reentrancy guard on runQuery — resumeTask/sendMessage on a mid-stream task silently starts a second concurrent query() and orphans the first

**Files modified:** `packages/claude-adapter/src/claude-code-runtime.ts`
**Commit:** `b6a7089` (same commit as CR-02 — the two share the same guard/state-machine changes in the same functions and are not cleanly separable into independent hunks; committed together with a message describing both)
**Applied fix:** Added `TaskRecord.inFlight` (true only while a `runQuery` invocation is actually in flight, cleared in its `finally` block). At the top of `runQuery`, if a prior invocation is still `inFlight`, the existing invocation is now properly stopped first (`attemptGracefulStop`, then hard-abort on timeout — the same path `pauseTask`/`cancelTask` already use) before the new controller/stream take over the record.

**Adaptation note:** REVIEW.md's suggested fix was to make `runQuery` *throw* on reentry (`if (record.runPromise && ACTIVE_STATUSES.includes(record.status)) { throw ... }`), and have `sendMessage`/`resumeTask` "require the task be in a non-active status before starting a new turn." Applying that literally would have broken `claude-code-runtime.test.ts`'s existing "Test 3: sendMessage on a running task..." and reverted a behavior explicitly designed and documented in Plan 04-02 (`sendMessage` is specified to work on a task whose status is `"running"`, resuming the session — see `04-02-PLAN.md` Task 1 Behavior Test 3 and `claude-code-runtime.ts`'s own comment above `sendMessage` referencing it). Per the fix-strategy guidance to adapt fix suggestions to actual code/intent rather than applying blindly, I implemented the "track in-flight state explicitly" alternative the review itself offered: stop-and-take-over instead of throw-and-reject. This closes the exact defect described (orphaned controller/watchdog/poll-interval, lost pause/cancel control over the first invocation — there is never more than one truly in-flight invocation per task after this fix) while preserving the tested, plan-mandated `sendMessage`-on-`running`-task contract. `claude-code-runtime.test.ts` required no changes and all 22 existing tests (1 pre-existing skip, unrelated) pass unmodified.

### WR-01: CEO-gated Bash "force-push" pattern false-positives on any -f flag

**Files modified:** `packages/claude-adapter/src/signal-detection.ts`
**Commit:** `edbac49`
**Applied fix:** Changed the pattern from `/\bforce\b.*push|push.*--force|-f\b/i` to `/\bforce\b.*push|push.*(--force|-f\b)/i`, scoping the `-f` alternative to a push-shaped command (matching the existing `--force` alternative's shape) instead of matching any bare `-f` flag anywhere in the command. Applied as suggested by the review.

### WR-02: postEvent's fetch has no timeout — a hung control plane wedges the task's runPromise past its own watchdog/cancel recovery

**Files modified:** `packages/claude-adapter/src/event-emitter.ts`
**Commit:** `5a6650f`
**Applied fix:** Added `signal: AbortSignal.timeout(10_000)` to the `fetch()` call inside `postEvent`, exactly as suggested by the review (10s timeout). The existing `catch` block's log-and-never-throw handling already covers the resulting `TimeoutError`, so no other change was needed.

## Skipped Issues

None — all 5 in-scope findings (CR-01, CR-02, CR-03, WR-01, WR-02) were fixed.

Note: `fix_scope` was `critical_warning`, so IN-01 (`StartTaskInput.repoPath` unused) and IN-02 (`git-adapter` misplaced as a runtime dependency) were intentionally left untouched — out of scope for this run, not skipped due to failure.

## Verification

- `pnpm --filter claude-adapter test` — 22 passed, 1 skipped (pre-existing skip, unrelated to these fixes), run after every commit.
- `pnpm --filter claude-adapter typecheck` — no new errors; the 3 pre-existing `TS2835` errors in `packages/event-schema/src/index.ts` were confirmed present before any of these changes (via `git stash`) and are unrelated to the files modified here.
- `pnpm --filter orchestration-adapter typecheck` — clean, no errors.
- `pnpm --filter company-core test` — 21 passed.

---

_Fixed: 2026-09-21T09:25:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
