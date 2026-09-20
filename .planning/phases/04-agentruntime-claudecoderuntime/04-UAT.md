---
status: testing
phase: 04-agentruntime-claudecoderuntime
source: [04-VERIFICATION.md]
started: 2026-09-21T10:20:00Z
updated: 2026-09-21T13:56:00Z
---

## Current Test

number: 2
name: Claude subscription tier confirmation
expected: |
  Run `claude auth status` and report the `subscriptionType` field.
awaiting: user response

## Tests

### 1. Real (non-mocked) pauseTask/cancelTask termination proof
expected: Start a real ClaudeCodeRuntime task, call pauseTask mid-stream and confirm the
  underlying claude CLI subprocess actually pauses/exits; separately, start another real
  task and call cancelTask, confirming the subprocess is genuinely terminated (not
  orphaned) within the grace period. Status transitions correctly to paused/cancelled AND
  the real OS-level subprocess is confirmed stopped, not just the in-memory record.
result: pass
verified_by: claude (not the human — user asked Claude to self-verify non-visual checks)
evidence: |
  Extended packages/claude-adapter/src/claude-code-runtime.integration.test.ts with two new
  gated (CLAUDE_CODE_INTEGRATION_TEST=1) tests that snapshot real `claude.exe` OS PIDs via
  `tasklist` before/during/after pauseTask and cancelTask against a real, non-mocked
  ClaudeCodeRuntime session (disposable SyncSmith worktree). Both tests assert the
  task-specific spawned PID is gone from the process table after the grace period — not
  just that the in-memory status flipped. Ran twice (first run caught a real Windows
  worktree-cleanup race, fixed with a retry/prune helper; second run: all 3 tests green,
  including the two new subprocess-termination assertions). Commit 6f7b683. This closes
  04-VERIFICATION.md's flagged gap and adds permanent regression coverage for it.

### 2. Claude subscription tier confirmation
expected: Run `claude auth status` and report the `subscriptionType` field. Expected
  `"max"`, matching the phase goal's literal "Claude MAX subscription auth alone" wording.
result: [pending]

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
