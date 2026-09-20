# Phase 4: AgentRuntime & ClaudeCodeRuntime - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-20
**Phase:** 4-AgentRuntime & ClaudeCodeRuntime
**Areas discussed:** Claude Code invocation mechanism, Pause/resume/cancel semantics, Demo/verification target, requestReview / requestHandoff semantics

---

## Claude Code invocation mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Claude Agent SDK | Programmatic TS API, structured streaming, hooks, session control | |
| CLI subprocess (headless mode) | Shell out to `claude -p ... --output-format stream-json`, parse stdout yourself | |
| Both — SDK primary, CLI fallback | SDK is the real implementation; subprocess path only for a specific SDK gap | ✓ |

**User's choice:** Both — SDK primary, CLI fallback.

| Option | Description | Selected |
|--------|-------------|----------|
| SDK always tried first, CLI only on a specific known SDK gap | Explicit allowlist of fallback cases, not a silent runtime guess | ✓ |
| Config flag per worker/task | Worker/task explicitly picks sdk or cli | |
| You decide | Leave to research/planning | |

**User's choice:** SDK always tried first, CLI only on a specific known SDK gap.

| Option | Description | Selected |
|--------|-------------|----------|
| GSD slash-command as the task | startTask's prompt is a real GSD command (e.g. /gsd-execute-phase N) | ✓ |
| Raw freeform prompt | startTask takes any prompt string, GSD invocation is a caller concern | |

**User's choice:** GSD slash-command as the task.
**Notes:** Matches PROJECT.md — GSD is the real methodology being visualised; what the office shows must be a genuinely running GSD workflow.

---

## Pause/resume/cancel semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Kill process, preserve session ID | pauseTask kills the subprocess/SDK connection but keeps the session ID for resumeTask to reattach | |
| Interrupt current turn, hold process alive | Process stays running, waiting for a resume signal | |
| You decide | Left to research/planning, informed by the Agent SDK's actual session/resume API | ✓ |

**User's choice:** You decide (Claude's Discretion).

| Option | Description | Selected |
|--------|-------------|----------|
| Hard kill only | cancelTask means done, permanently — immediate kill, no resume possible | |
| Graceful interrupt, then kill on timeout | SIGINT first, SIGKILL if it doesn't exit in time | ✓ |

**User's choice:** Graceful interrupt, then kill on timeout.

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded timeout → emit failed/blocked | If no output/heartbeat within a bounded window, runtime itself surfaces a terminal status | ✓ |
| No timeout in MVP — rely on manual cancelTask | Simpler, but leaves the PITFALLS.md "office frozen showing coding forever" risk unaddressed | |

**User's choice:** Bounded timeout → emit failed/blocked.
**Notes:** Directly satisfies PITFALLS.md's named verification requirement for this phase (hang/kill-test surfaces a bounded-timeout terminal status).

---

## Demo/verification target

| Option | Description | Selected |
|--------|-------------|----------|
| Disposable throwaway repo | Scratch/sandbox repo created just for verification | |
| SyncSmith directly | Same real demo project as Phase 3, no isolation | |
| SyncSmith, but only inside a disposable worktree/branch | Real repo continuity, blast radius limited to one disposable worktree | ✓ |

**User's choice:** SyncSmith, but only inside a disposable worktree/branch.

| Option | Description | Selected |
|--------|-------------|----------|
| A real, small SyncSmith GSD phase | Runs an actual next-unplanned/small phase from SyncSmith's real roadmap | ✓ |
| A trivial throwaway prompt | e.g. create a file and commit it | |

**User's choice:** A real, small SyncSmith GSD phase.

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the worktree and branch after verification | Evidence captured first, then cleaned up — SyncSmith ends up unchanged | ✓ |
| Leave it for manual review | User inspects the branch/diff before deciding | |

**User's choice:** Delete the worktree and branch after verification.

---

## requestReview / requestHandoff semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Detect via GSD checkpoint/output patterns | Runtime watches Claude Code output/GSD state for known checkpoint markers, translates into real requestReview/requestHandoff calls | ✓ |
| Stub for now, wire real detection in Phase 6 | Interface methods exist and emit a generic event; real detection deferred | |

**User's choice:** Detect via GSD checkpoint/output patterns.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse gsd-adapter | gsd-adapter already observes .planning/ state and maps to roles/phases | |
| Separate detection inside ClaudeCodeRuntime | Parses its own subprocess/SDK output stream directly | |
| Both, for different signal types | gsd-adapter for file-based state changes; ClaudeCodeRuntime's own stream for in-turn signals gsd-adapter's polling would miss | ✓ |

**User's choice:** Both, for different signal types.

---

## Claude's Discretion

- Exact `pauseTask` mechanism (kill+preserve-session-ID vs. interrupt-and-hold-alive) — informed by the Claude Agent SDK's actual session/resume API capability at implementation time.
- Exact bounded-timeout duration for the hang-detection status flip.
- Exact package/module boundary for the `AgentRuntime` interface vs. `ClaudeCodeRuntime` implementation — ARCHITECTURE.md and STACK.md disagree slightly on this; either is acceptable as long as SDK types never leak outside `ClaudeCodeRuntime`'s own package.
- Exact checkpoint/output-pattern signals `ClaudeCodeRuntime`'s own live-stream detection watches for.
- Which specific SyncSmith phase is used for the demo.

## Deferred Ideas

None — discussion stayed within phase scope.
