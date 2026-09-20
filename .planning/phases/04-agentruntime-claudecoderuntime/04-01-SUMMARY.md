---
phase: 04-agentruntime-claudecoderuntime
plan: 01
subsystem: orchestration
tags: [agent-runtime, claude-agent-sdk, event-schema, company-core, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: event-schema's CompanyEventSchema discriminated union + company-core's reducer dispatch table
  - phase: 03-worker-git-gsd-adapters
    provides: apps/worker's buildEnvelope/postEvent and poll-loop.ts conventions this plan's local event-emitter.ts and never-crash-the-loop pattern replicate
provides:
  - "AgentRuntime interface (packages/orchestration-adapter) — the generic, SDK-independent coding-agent contract (RUNTIME-01)"
  - "ClaudeCodeRuntime factory (packages/claude-adapter) — first AgentRuntime implementation, startTask/getStatus wired to a real @anthropic-ai/claude-agent-sdk query() call (RUNTIME-02)"
  - "task.status_changed event-schema member (discriminated-union member 16) + company-core reducer handler"
  - "Confirmed Claude MAX subscription billing posture for headless SDK usage (no ANTHROPIC_API_KEY dependency)"
affects: [04-02, 04-03, "any future AgentRuntime implementation (RUNTIME-05)"]

# Actuals (#2632)
actuals:
  tokens: 4662
  tasks: 3
  commits: 2
plan_head_before: 09517c178a23bc41250da7f2f30ca39b51774243

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/claude-agent-sdk@0.3.278"]
  patterns:
    - "Factory function (not class) returning an interface, closing over a Map<taskId, record> — matches git-adapter/gsd-adapter/poll-loop.ts's function-first style"
    - "Local buildEnvelope/postEvent duplication per adapter package (packages never import apps) — same pattern as apps/worker/src/event-emitter.ts, deliberately re-implemented rather than shared"
    - "Discriminated-union event-schema additions always appended, never reordered, never via .extend()"

key-files:
  created:
    - packages/orchestration-adapter/package.json
    - packages/orchestration-adapter/tsconfig.json
    - packages/orchestration-adapter/src/types.ts
    - packages/orchestration-adapter/src/index.ts
    - packages/claude-adapter/package.json
    - packages/claude-adapter/tsconfig.json
    - packages/claude-adapter/src/event-emitter.ts
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - packages/claude-adapter/src/index.ts
  modified:
    - packages/event-schema/src/payloads/index.ts
    - packages/company-core/src/reducer.ts
    - packages/company-core/src/reducer.test.ts
    - pnpm-lock.yaml

key-decisions:
  - "Claude MAX subscription billing posture confirmed via live falsification check (Task 1) — claude.ai's usage dashboard moved, not platform.claude.com's API-credit pool. Flagged discrepancy: claude auth status reports subscriptionType 'pro', not 'max' — see Issues Encountered."
  - "@anthropic-ai/claude-agent-sdk@0.3.278 confirmed legitimate (anthropics GitHub org, 8.16M weekly downloads) via human npmjs.com check before install (Task 2)"
  - "pauseTask/resumeTask/cancelTask/sendMessage/requestReview/requestHandoff implemented as throwing stubs so createClaudeCodeRuntime satisfies the full AgentRuntime type immediately — real implementations deferred to Plan 04-02/04-03 against the same tasks Map"
  - "task.status_changed's reducer handler upserts unconditionally (state.tasks[taskId] ?? {id: taskId}) rather than gating on an existing task record, since ClaudeCodeRuntime is the first real producer of task-lifecycle events and no task.created producer exists yet for real Claude Code tasks"

patterns-established:
  - "AgentRuntime as the generic interface, ClaudeCodeRuntime as its first named variant — never folded into one shared type (ARCHITECTURE.md Anti-Pattern 3), enforced structurally via zero @anthropic-ai/ import in orchestration-adapter/src (verified by grep, not just review)"

requirements-completed: [RUNTIME-01, RUNTIME-02]

coverage:
  - id: D1
    description: "AgentRuntime interface exists, type-checks standalone with zero SDK dependency"
    requirement: "RUNTIME-01"
    verification:
      - kind: unit
        ref: "pnpm --filter orchestration-adapter typecheck"
        status: pass
      - kind: other
        ref: "grep -rEl \"from ['\\\"]@anthropic-ai/\" packages/orchestration-adapter/src (no matches)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ClaudeCodeRuntime.startTask drives one real query() message stream to a task.status_changed event, getStatus reflects completed/failed correctly, unknown taskId rejects"
    requirement: "RUNTIME-02"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts (4 Behavior cases, all pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "company-core reducer folds task.status_changed into ProjectionState.tasks[taskId].status"
    verification:
      - kind: unit
        ref: "packages/company-core/src/reducer.test.ts#task.status_changed (2 new cases, all pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Claude MAX subscription billing posture verified live — no ANTHROPIC_API_KEY dependency, no hidden API-credit billing path"
    requirement: "RUNTIME-02"
    verification: []
    human_judgment: true
    rationale: "Usage-dashboard comparison (which of two billing counters moved) is a live account-state observation only a human with dashboard access can make; already performed and recorded in Task 1 below."
  - id: D5
    description: "@anthropic-ai/claude-agent-sdk package legitimacy confirmed before install"
    verification: []
    human_judgment: true
    rationale: "Publisher/org/download-count verification on npmjs.com is a supply-chain trust judgment reserved for a human per this plan's Task 2 blocking-human checkpoint; already performed and recorded in Task 2 below."

duration: ~50min (Task 3 portion; Tasks 1-2 executed in prior sessions)
completed: 2026-09-20
status: complete
---

# Phase 04 Plan 01: AgentRuntime & ClaudeCodeRuntime Summary

**AgentRuntime interface (zero SDK dependency) plus ClaudeCodeRuntime's first real `@anthropic-ai/claude-agent-sdk` `query()`-backed `startTask`/`getStatus`, wired through a new `task.status_changed` event into company-core's `ProjectionState`.**

## Performance

- **Duration:** ~50 min (this session, Task 3 only — Tasks 1 and 2 were resolved in two prior executor sessions with no code changes)
- **Started:** 2026-09-20T09:55:00Z (approx, Task 3 start)
- **Completed:** 2026-09-20T10:48:38Z
- **Tasks:** 3/3 (Task 1 + Task 2 checkpoints resolved in prior sessions, Task 3 executed and committed this session)
- **Files modified:** 13 source files + pnpm-lock.yaml

## Accomplishments

- `AgentRuntime` interface (`packages/orchestration-adapter`) — 8 methods (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff), zero `@anthropic-ai/` import anywhere in the package, structurally enforcing RUNTIME-01's "independent of any specific coding-agent implementation" requirement
- `createClaudeCodeRuntime` factory (`packages/claude-adapter`) — `startTask` drives one real `query()` call authenticated purely via the `claude` CLI subscription login (never reads/forwards `ANTHROPIC_API_KEY`), posts `task.status_changed(starting)` before the loop begins and `task.status_changed(completed|failed)` on the terminal result; `getStatus` throws on an unknown taskId rather than fabricating state
- `task.status_changed` added as event-schema's 16th discriminated-union member; company-core's reducer upserts `tasks[taskId].status` for it
- Claude MAX subscription billing posture verified live (Task 1) and `@anthropic-ai/claude-agent-sdk@0.3.278` confirmed legitimate before install (Task 2)

## Task Commits

Each task was committed atomically. Task 3 followed RED→GREEN TDD discipline (2 commits):

1. **Task 1: Verify Claude MAX subscription billing posture** — no commit (verification-only, resolved in a prior session)
2. **Task 2: Verify @anthropic-ai/claude-agent-sdk package legitimacy** — no commit (verification-only, resolved in a prior session)
3. **Task 3: Scaffold AgentRuntime + ClaudeCodeRuntime, wire startTask/getStatus** —
   - `0eec8c6` — `test(04-01): add failing tests for ClaudeCodeRuntime startTask/getStatus and task.status_changed reducer` (RED)
   - `4835212` — `feat(04-01): implement ClaudeCodeRuntime.startTask/getStatus and task.status_changed reducer` (GREEN)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Checkpoint Resolutions (Tasks 1 & 2, recorded verbatim per acceptance_criteria)

### Task 1: Verify Claude MAX subscription billing posture (RUNTIME-02 falsification check)

- `ANTHROPIC_API_KEY` confirmed unset in the shell for the entire check.
- `claude auth status` confirmed `authMethod: "claude.ai"` (subscription session), not an API key.
- `claude -p "Reply with exactly the word: pong" --output-format stream-json` completed successfully with no API key in the environment (session_id `b1c2fc3b-9a7d-465d-9374-a9508345bcfb`).
- **Human dashboard comparison result:** **"subscription pool"** — claude.ai's usage counter moved; platform.claude.com's API-credit counter did not.
- **Flagged discrepancy (not phase-blocking, noted for future re-verification):** `claude auth status`'s `subscriptionType` field reported `"pro"`, not `"max"`, despite the project's stated Claude MAX subscription assumption (PROJECT.md, STATE.md constraints). The dashboard comparison itself was unambiguous (subscription pool, not API pool), so RUNTIME-02's "no ANTHROPIC_API_KEY dependency" requirement is satisfied regardless of plan tier — flagging the tier mismatch per 04-RESEARCH.md's Critical Finding for the user to confirm their actual plan separately.

### Task 2: Verify @anthropic-ai/claude-agent-sdk package legitimacy before install

- `npm view @anthropic-ai/claude-agent-sdk version` confirmed `0.3.278`, published `2026-09-19T03:10:44Z`, repository `github.com/anthropics/claude-agent-sdk-typescript` — matching the plan's required thresholds.
- **Human confirmation:** **"approved"** after visiting npmjs.com and checking publisher org + download count.

## Files Created/Modified

- `packages/orchestration-adapter/package.json`, `tsconfig.json` — new package scaffolding, zero dependencies
- `packages/orchestration-adapter/src/types.ts` — `AgentTaskStatus`, `StartTaskInput`, `AgentRuntime` (8-method interface)
- `packages/orchestration-adapter/src/index.ts` — split type-only re-export (matches `gsd-adapter/src/index.ts` convention)
- `packages/claude-adapter/package.json`, `tsconfig.json` — new package scaffolding, `@anthropic-ai/claude-agent-sdk@0.3.278` + workspace deps
- `packages/claude-adapter/src/event-emitter.ts` — local `buildEnvelope`(4-arg, `taskId` required)/`postEvent` pair, deliberately duplicated from `apps/worker/src/event-emitter.ts` (packages never import apps)
- `packages/claude-adapter/src/claude-code-runtime.ts` — `createClaudeCodeRuntime` factory; real `startTask`/`getStatus`, stubbed remaining 6 `AgentRuntime` methods
- `packages/claude-adapter/src/claude-code-runtime.test.ts` — 4 Behavior-block test cases (mocked `query()` + `event-emitter.js`)
- `packages/claude-adapter/src/index.ts` — re-exports `createClaudeCodeRuntime`
- `packages/event-schema/src/payloads/index.ts` — `task.status_changed`, discriminated-union member 16
- `packages/company-core/src/reducer.ts` — `task.status_changed` handler (upsert-if-missing)
- `packages/company-core/src/reducer.test.ts` — 2 new `task.status_changed` cases
- `pnpm-lock.yaml` — `@anthropic-ai/claude-agent-sdk` + its platform-specific optional deps resolved

## Decisions Made

- Claude MAX subscription billing posture re-verified live before any implementation, per 04-RESEARCH.md's Critical Finding — confirmed subscription-pool billing, not API-credit billing (see Task 1 resolution above; tier-name discrepancy flagged, not blocking).
- `@anthropic-ai/claude-agent-sdk` installed only after explicit human package-legitimacy confirmation (Task 2), per the SUS-flagged Package Legitimacy Audit in 04-RESEARCH.md.
- The 6 unimplemented `AgentRuntime` methods (`pauseTask`/`resumeTask`/`cancelTask`/`sendMessage`/`requestReview`/`requestHandoff`) throw `"not implemented — see Plan 04-02/04-03"` rather than being omitted, so `createClaudeCodeRuntime`'s return type satisfies the full `AgentRuntime` interface immediately (plan's explicit instruction, RUNTIME-01 completeness).
- `task.status_changed`'s reducer handler always upserts (never gates on an existing task), since this phase is the first real producer of task-lifecycle events for real Claude Code tasks.

## Deviations from Plan

None — plan executed exactly as written. `gsd_run check tdd-red-evidence` was not run against a formal record file (this repo's Vitest output isn't TAP-shaped, a recurring flagged gap from Phase 1/3 — see STATE.md decisions); RED evidence was instead verified manually by running both test commands before implementation existed and confirming all 6 failures (4 in claude-adapter, 2 in company-core) failed on the target assertion, not on import/syntax errors.

## Known Stubs

The following 6 `AgentRuntime` methods on `ClaudeCodeRuntime` throw `"not implemented — see Plan 04-02/04-03"` rather than performing real work — this is explicit, plan-documented, deferred-not-hidden scope, not an unintentional gap:

| Method | File | Reason |
|--------|------|--------|
| `pauseTask` | `packages/claude-adapter/src/claude-code-runtime.ts` | Deferred to Plan 04-02/04-03 (per this plan's Task 3 action) |
| `resumeTask` | same | same |
| `cancelTask` | same | same |
| `sendMessage` | same | same |
| `requestReview` | same | same |
| `requestHandoff` | same | same |

## Issues Encountered

- `claude auth status`'s `subscriptionType` field reported `"pro"`, not `"max"`, during Task 1's verification — noted as a flagged discrepancy in the checkpoint resolution above, not treated as phase-blocking since the actual billing-pool observation (the thing RUNTIME-02 cares about) was unambiguous. Worth the user separately confirming their actual Claude subscription tier.

## Next Phase Readiness

- `AgentRuntime` and `ClaudeCodeRuntime`'s `tasks` Map are ready for Plan 04-02/04-03 to implement `pauseTask`/`resumeTask`/`cancelTask`/`sendMessage`/`requestReview`/`requestHandoff` against the same closure-scoped state.
- `task.status_changed` is live in both `event-schema` and `company-core` — any future `AgentRuntime` implementation (RUNTIME-05) can emit the same event shape without further schema work.
- No blockers for the next plan in this phase.

---
*Phase: 04-agentruntime-claudecoderuntime*
*Completed: 2026-09-20*

## Self-Check: PASSED

All 14 claimed files (10 new, 4 modified) verified present on disk. All 3 commits
(`0eec8c6` RED, `4835212` GREEN, `d528bc2` docs) verified present in git log.
