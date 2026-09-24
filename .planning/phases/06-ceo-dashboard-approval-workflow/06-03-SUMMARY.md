---
phase: 06-ceo-dashboard-approval-workflow
plan: 03
subsystem: claude-adapter
status: complete
tags: [ceo-gate, decision-request, git-diff, security, resume]
requires: ["06-02"]
provides:
  - "git-adapter readDiff: read-only, capped worktree diff (--no-ext-diff --no-textconv --no-color, 400 lines / 64 KiB, full numstat totals)"
  - "claude-adapter buildDecisionRequest / extractLinks: pure builder for the enriched ceo.approval_requested payload"
  - "Runtime: per-invocation lastAssistantText, per-request diff, D-06 Discuss thread carry-over, sessionId/worktreePath/workerBootId/taskTitle on every request"
  - "StartTaskInput.title (optional), runtime option workerBootId"
  - "ClaudeCodeRuntime type, RestoreTaskInput type, restoreTask method (D-02)"
affects: ["06-04", "06-06", "06-09", "06-14"]
tech-stack:
  added: []
  patterns:
    - "Every git diff call starts from BASE_ARGS so repo-configured diff drivers never run"
    - "Payload builder is pure and omits absent values instead of inventing them"
    - "Runtime-only methods go on ClaudeCodeRuntime = AgentRuntime & {...}, not on the AgentRuntime interface"
key-files:
  created:
    - packages/git-adapter/src/diff.ts
    - packages/git-adapter/src/diff.test.ts
    - packages/claude-adapter/src/decision-request.ts
    - packages/claude-adapter/src/decision-request.test.ts
  modified:
    - packages/git-adapter/src/index.ts
    - packages/orchestration-adapter/src/types.ts
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - packages/claude-adapter/src/index.ts
decisions:
  - "restoreTask treats a known task as settled when it is paused or terminal, even though inFlight stays true after pause/cancel; it throws only for a live invocation"
  - "restoreTask does no path validation; 06-04's worker checks worktreePath against listWorktrees first (T-06-03-05 transfer)"
requirements-completed: [CEO-02, CEO-03]
metrics:
  duration: "about 20min across two executors (the first was cut off by an API rate limit mid-Task 3; its start time was not recorded)"
  completed: 2026-09-24
actuals:
  tokens: 10684
  tasks: 3
  commits: 6
plan_head_before: 908a0063f7247941a8af16315fb815a8d6616a44
---

# Phase 06 Plan 03: Enriched CEO decision request, capped read-only diff, restoreTask Summary

Every parked CEO request now carries a title, the agent's last assistant text as context, its recommendation, http(s) links, the question set and a capped diff that git reads without running any repo-configured program. Discuss rounds share one threadId. The request also carries sessionId, worktreePath, workerBootId and taskTitle, and the new `restoreTask` uses those fields to rebuild a task the worker lost on restart so `resumeTask` can continue the same Claude session in the same worktree.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | readDiff (RED, signature stub) | 595b41e | diff.test.ts, diff.ts |
| 1 | readDiff (GREEN) | 20d5c63 | diff.ts, git-adapter index.ts |
| 2 | Enriched request + Discuss threads (RED, signature stub) | a039c70 | decision-request.test.ts, claude-code-runtime.test.ts, decision-request.ts |
| 2 | Enriched request + Discuss threads (GREEN) | a53c40c | decision-request.ts, claude-code-runtime.ts, claude-adapter index.ts, orchestration-adapter types.ts |
| 3 | restoreTask (RED) | ece4865 | claude-code-runtime.test.ts |
| 3 | restoreTask (GREEN) | 96db510 | claude-code-runtime.ts, claude-adapter index.ts |

## What was built

- `diff.ts`: `readDiff(worktreePath, caps)`. The base is the merge-base with `@{upstream}`, or HEAD when there is no upstream. `--numstat` gives the files and the totals, with binary files counted as 0/0. The unified text is cut on a line boundary at 400 lines and 64 KiB, and `truncated` is set when anything was cut. Untracked files are not included, and the doc comment says so.
- `decision-request.ts`: `buildDecisionRequest` gets its title from the first AskUserQuestion question or from `Bash: <command>`. The recommendation comes from "(Recommended)" option labels or the Bash description. The context is the last assistant text, capped at 8000. Links come from `extractLinks`: http/https only, unique, at most 10, each at most 2000 characters. Absent values produce no key.
- `claude-code-runtime.ts`: keeps `lastAssistantText` per invocation, and the parked branch reads the diff through `readDiffOrNothing`, so a failed read means the request has no diff key. `threadId = record.discussThreadId ?? decisionId`, and a "discuss" decision sets `discussThreadId`. `restoreTask` handles three cases: an unknown task gets a new `blocked` record, a live invocation makes it throw `task is running`, and a known settled task is left alone.

## Verification

- `pnpm --filter claude-adapter test`: 94 passed, 3 skipped (the live-claude integration file), 0 failed.
- `pnpm --filter git-adapter test`: 15 passed (includes diff and no-mutating-git).
- `pnpm --filter claude-adapter typecheck` and `pnpm --filter orchestration-adapter typecheck`: clean.
- Acceptance greps: `no-ext-diff` is in diff.ts:13. The diff.test.ts marker control asserts `existsSync(marker)` true after the unflagged diff and false after readDiff (l.153/158). The 600-line test asserts at most 400 lines and at most 65536 bytes (l.67-68). decision-request.test.ts has `toEqual` full payloads (l.45, l.105) and the `javascript:` extractLinks case (l.172). The runtime test asserts `r2.threadId === r1.threadId` after discuss (l.1191). The restoreTask tests assert `options.resume`/`options.cwd` and `toThrow("task is running")`.

## TDD Gate Compliance

- Task 1 RED 595b41e comes before GREEN 20d5c63. Task 2 RED a039c70 comes before GREEN a53c40c. Both RED commits include a signature-only stub so the test file loads. **RED counts for Tasks 1 and 2 are not available:** the previous executor's RED runs existed only in its transcript, which was lost when it was cut off, and I have not reconstructed or invented them. The commit order is the only evidence that RED came first.
- Task 3: the RED run was `npx vitest run claude-code-runtime.test --reporter=tap-flat` in packages/claude-adapter and exited 1, with 49 `ok` and 4 `not ok` lines. Following the vitest workaround, I appended the counters `# tests 53`, `# pass 49`, `# fail 4`. `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target_test_failed; the 4 failures were exactly the new restoreTask tests, with a TypeError because `restoreTask` did not exist yet). RED commit ece4865, then GREEN commit 96db510 (53/53).

## Deviations from Plan

None in Task 3; I wrote it as the plan specified. When the previous executor was cut off, the Task 3 RED tests were uncommitted in the working tree. I checked that they matched Task 3's behavior and acceptance criteria and kept them unchanged.

## Known Stubs

None. The signature stubs in the RED commits were replaced in their GREEN commits.

## Threat Flags

None. T-06-03-01 (diff drivers) is covered by the marker control test, T-06-03-03 (links) by extractLinks returning http/https only, T-06-03-04 by the caps, and T-06-03-05 is transferred to 06-04 as the plan says.

## Self-Check: PASSED

- FOUND: packages/git-adapter/src/diff.ts, diff.test.ts, packages/claude-adapter/src/decision-request.ts, decision-request.test.ts
- FOUND commits: 595b41e, 20d5c63, a039c70, a53c40c, ece4865, 96db510
