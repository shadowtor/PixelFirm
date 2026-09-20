# Phase 4: AgentRuntime & ClaudeCodeRuntime - Context

**Gathered:** 2026-09-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 builds a generic `AgentRuntime` interface (`startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff`) and its first real implementation, `ClaudeCodeRuntime`, which actually drives a Claude Code task end-to-end on Claude MAX subscription auth (no `ANTHROPIC_API_KEY`). This is the phase where the system moves from *watching* a repository (Phase 3: read-only git/GSD observation) to *acting* on one — starting, pausing, resuming, cancelling, and messaging a real Claude Code session, and surfacing when it needs human review or a handoff. No pixel office rendering, no CEO dashboard UI, no multi-agent concurrency model — those are Phase 5+ (RUNTIME-01, RUNTIME-02 only).

</domain>

<decisions>
## Implementation Decisions

### Claude Code invocation mechanism
- **D-01:** `ClaudeCodeRuntime` drives Claude Code primarily through the official Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — programmatic TS API, structured message streaming, native session/hook control. A CLI subprocess path (headless `claude -p ... --output-format stream-json`) exists only as a fallback for a specific, identified SDK gap discovered during research/implementation — never as a parallel default path or a config toggle. — **Reversibility:** costly — once `startTask`/`sendMessage`/`getStatus` are built around the SDK's message-streaming shape, switching the primary path to subprocess-based stdout parsing means rewriting the runtime's core I/O model, not just swapping a client library call.
- **D-02:** `startTask` invokes a real GSD workflow (e.g. a GSD slash-command like `/gsd-execute-phase N`) as the task's actual prompt — not a raw freeform string. This matches PROJECT.md's requirement that GSD is the real methodology being visualised: what the pixel office eventually shows must be a genuinely running GSD workflow, never a fabricated animation over an arbitrary prompt. — **Reversibility:** reversible — `startTask`'s signature can still accept an arbitrary prompt string; this decision is about what Phase 4's own usage/demo passes in, not a hard interface constraint.

### Pause/resume/cancel semantics
- **D-03:** `cancelTask` is a graceful interrupt first (SIGINT / SDK-equivalent stop signal), then a hard kill on timeout if the process/session doesn't exit cleanly — avoids leaving a worktree in a half-written state, while still guaranteeing termination. — **Reversibility:** reversible — the timeout duration and interrupt signal are tunable constants.
- **D-04:** `getStatus()` enforces a bounded silence timeout: if the underlying subprocess/SDK stream produces no output/heartbeat within a bounded window, the runtime itself surfaces a `failed` or `blocked` status event rather than leaving the office frozen showing an agent "coding" indefinitely. This directly satisfies PITFALLS.md's named verification requirement for this phase (hang/kill-test a Claude Code subprocess and confirm a bounded-timeout terminal status). — **Reversibility:** reversible — timeout value and the exact terminal status chosen are tunable without touching the interface contract.

### Demo/verification target
- **D-05:** The live proof that `startTask/pauseTask/resumeTask/cancelTask` actually work runs against the real SyncSmith repository (continuing Phase 3's demo project), but scoped to a disposable git worktree on a throwaway branch — never directly on SyncSmith's main branch/worktree. This matches PROJECT.md's existing worktree-isolation model (WORKTREE-01/02) and keeps a brand-new, not-yet-hardened runtime's blast radius to one disposable worktree instead of a scratch/unrelated repo, while still proving the runtime against a genuine GSD project rather than a toy sandbox. — **Reversibility:** reversible — this is a verification-methodology choice, not a shipped interface or schema decision.
- **D-06:** The demo task itself is a real, small unplanned phase from SyncSmith's actual 7-phase roadmap, invoked via a GSD slash-command (per D-02) — not a trivial "create a file and commit it" prompt. Proves the runtime against genuine GSD workflow behavior and timing, consistent with the project's Core Value that nothing shown is fabricated. — **Reversibility:** reversible.
- **D-07:** After verification, the disposable worktree and branch created for the demo are deleted — SyncSmith's real repository state is unchanged afterward. Phase evidence (logs/events/screenshots) is captured before cleanup, not preserved as a live branch for manual review. — **Reversibility:** reversible.

### requestReview / requestHandoff semantics
- **D-08:** `requestReview`/`requestHandoff` are functionally wired in Phase 4, not stubbed — `ClaudeCodeRuntime` actually detects when Claude Code needs human review or is handing off, using two complementary signal sources: (1) Phase 3's existing `gsd-adapter` for file-based GSD state signals (phase-complete, role-transition state written to `.planning/`), reused rather than reimplemented, and (2) `ClaudeCodeRuntime`'s own live SDK/output-stream observation for in-turn signals (e.g. a blocking question mid-task) that `gsd-adapter`'s poll-based file observation would miss between polling ticks. The CEO dashboard UI that acts on these calls is still Phase 6 — Phase 4 only guarantees the interface methods fire on real signals, not that anything downstream consumes them yet. — **Reversibility:** costly — once Phase 6's CEO dashboard is built against `requestReview`/`requestHandoff` actually firing on real detected signals, downgrading this to a stub would silently break the dashboard's data source without a compile-time error.

### Claude's Discretion
- Exact `pauseTask` mechanism (D-03's sibling decision) — whether pausing kills the process and preserves a session ID for resume, or interrupts the current turn while holding the process alive — is left to research/planning, informed by whatever the Claude Agent SDK's actual session/resume API supports by the time this is implemented.
- Exact bounded-timeout duration for D-04's hang detection.
- Exact package/module boundary for the `AgentRuntime` interface vs. `ClaudeCodeRuntime` implementation — ARCHITECTURE.md and STACK.md disagree slightly (`packages/orchestration-adapter` interface + `packages/claude-adapter` implementation, vs. STACK.md's "define the interface in `packages/company-core` with zero SDK types leaking across the boundary"). Either satisfies Anti-Pattern 3's requirement (generic interface, zero Claude-Code-specific leakage into the interface or `company-core`'s domain model) — pick whichever the researcher/planner finds cleanest, as long as `@anthropic-ai/claude-agent-sdk` types never appear outside `ClaudeCodeRuntime`'s own package.
- Exact checkpoint/output-pattern signals `ClaudeCodeRuntime`'s own live-stream detection (D-08, source 2) watches for — e.g. matching on a specific tool-call shape, a known GSD checkpoint heading, or an SDK-level "waiting for input" state.
- Which specific SyncSmith phase (D-06) is used for the demo — pick whichever of SyncSmith's currently-unplanned phases is smallest/fastest to prove the runtime against.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Core Value (never fabricated animation), AgentRuntime abstraction requirement, worktree/no-auto-merge constraints, Claude MAX-only auth constraint
- `.planning/REQUIREMENTS.md` — RUNTIME-01, RUNTIME-02 (this phase's mapped requirements)
- `.planning/ROADMAP.md` §Phase 4 — Goal and Success Criteria for this phase

### Prior phase context (decisions this phase builds on)
- `.planning/phases/03-worker-git-adapter-gsd-adapter/03-CONTEXT.md` — D-02 (gsd-adapter's file+process dual-signal liveness detection, reused by D-08 above; explicitly flagged there as costly-to-change once Phase 4 exists and may introduce an SDK-based liveness source), D-04 (worker's event-sourced heartbeat/connection-status pattern this phase's task-status events should stay consistent with)
- `.planning/phases/02-control-plane-skeleton/02-CONTEXT.md` — D-03 (worker credential/auth mechanics — this phase's worker-hosted runtime uses the same worker identity, no new auth mechanism)
- `.planning/phases/01-event-schema-state-engine/01-CONTEXT.md` — D-01 (discriminated-union event catalog this phase's task lifecycle/status events extend additively)

### Research
- `.planning/research/ARCHITECTURE.md` — AgentRuntime component table, `packages/claude-adapter`/`packages/orchestration-adapter` structure, Anti-Pattern 3 (never leak Claude-Code-specific shape into the generic interface), CEO-approval event flow (`ApprovalRequested`/`waiting_for_ceo`/`ApprovalDecisionMade`) this phase's `requestReview` feeds into
- `.planning/research/STACK.md` — Claude Agent SDK + Node 22 LTS pairing, Claude MAX/billing confidence caveat (MEDIUM — policy-sensitive, verify before scaling worker usage), alternate interface-location guidance (`packages/company-core`) noted as Claude's Discretion above
- `.planning/research/PITFALLS.md` — "Claude Code headless/subagent integration hangs or loses output" pitfall and its named verification requirement (hang/kill-test surfaces a bounded-timeout `failed`/`blocked` event) — directly the source of D-04
- `.planning/STATE.md` §Blockers/Concerns — "re-verify Claude Max-subscription billing terms for SDK/headless usage haven't changed" — check before/during this phase's implementation, not just at research time

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/gsd-adapter` (Phase 3): already parses `.planning/` file/frontmatter state and maps it to GSD phase/role identity (D-02 from Phase 3's context) — `ClaudeCodeRuntime`'s `requestReview`/`requestHandoff` detection (D-08) reuses this rather than re-parsing GSD state independently.
- `packages/git-adapter` (Phase 3): existing worktree/branch observation and read-only-guarantee pattern — the disposable-worktree demo (D-05) should use the same worktree creation/inspection primitives this package already provides, not a new ad hoc mechanism.
- `packages/event-schema`'s discriminated union (Phases 1-3): task lifecycle/status events this phase introduces extend the same union additively, following the established pattern (never `.extend()` chaining).
- `apps/worker` (Phase 3): the existing poll-loop/event-emitter/ws-client host process — `ClaudeCodeRuntime` runs inside this same worker process (per ARCHITECTURE.md: "runs only on the worker, never the control plane").

### Established Patterns
- Every prior phase proved its layer against stubbed/synthetic input before depending on real infrastructure (Phase 1: stubbed events; Phase 2: synthetic ingestion; Phase 3: first real producer). Phase 4 continues this — but per D-05/D-06, "real" here specifically means a disposable-worktree demo against SyncSmith, not a toy stub, since this is the first phase that *acts* rather than *observes*.
- Adapters/runtimes are pure workers-side components with zero control-plane dependency for their core function (control plane never needs Claude Code auth) — `ClaudeCodeRuntime` follows the same isolation as `git-adapter`/`gsd-adapter`.

### Integration Points
- `ClaudeCodeRuntime` is a new package (`packages/claude-adapter` per ARCHITECTURE.md, exact boundary left to Claude's Discretion above) imported by `apps/worker` the same way `git-adapter`/`gsd-adapter` already are.
- Task lifecycle/status changes this phase produces should flow through the same event-emission path `apps/worker/src/event-emitter.ts` already provides, consistent with Phase 3's heartbeat pattern.

</code_context>

<specifics>
## Specific Ideas

No additional specifics beyond the eight decisions above — discussion stayed focused on the four researched gray areas (invocation mechanism, pause/resume/cancel semantics, demo/verification target, requestReview/requestHandoff semantics).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-AgentRuntime & ClaudeCodeRuntime*
*Context gathered: 2026-09-20*
