# Phase 4: AgentRuntime & ClaudeCodeRuntime - Research

**Researched:** 2026-09-20
**Domain:** Agent orchestration via `@anthropic-ai/claude-agent-sdk` (TypeScript), Claude MAX subscription billing/ToS, package boundary design for a generic runtime abstraction
**Confidence:** MEDIUM — the SDK's mechanics (streaming, sessions, permissions, hooks) are HIGH confidence (official docs, fetched live this session). The Claude MAX subscription billing/ToS posture for a third-party product is the one area that stays MEDIUM/flagged: official sources conflict in emphasis (see Critical Finding below), and this is squarely the kind of policy question that needs a live falsification check, not just more reading.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `ClaudeCodeRuntime` drives Claude Code primarily through the official Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — programmatic TS API, structured message streaming, native session/hook control. A CLI subprocess path (headless `claude -p ... --output-format stream-json`) exists only as a fallback for a specific, identified SDK gap discovered during research/implementation — never as a parallel default path or a config toggle. — **Reversibility:** costly.
- **D-02:** `startTask` invokes a real GSD workflow (e.g. a GSD slash-command like `/gsd-execute-phase N`) as the task's actual prompt — not a raw freeform string. — **Reversibility:** reversible.
- **D-03:** `cancelTask` is a graceful interrupt first (SIGINT / SDK-equivalent stop signal), then a hard kill on timeout if the process/session doesn't exit cleanly. — **Reversibility:** reversible.
- **D-04:** `getStatus()` enforces a bounded silence timeout: if the underlying subprocess/SDK stream produces no output/heartbeat within a bounded window, the runtime itself surfaces a `failed` or `blocked` status event rather than leaving the office frozen showing an agent "coding" indefinitely. — **Reversibility:** reversible.
- **D-05:** The live proof that `startTask/pauseTask/resumeTask/cancelTask` actually work runs against the real SyncSmith repository, scoped to a disposable git worktree on a throwaway branch — never directly on SyncSmith's main branch/worktree. — **Reversibility:** reversible.
- **D-06:** The demo task itself is a real, small unplanned phase from SyncSmith's actual 7-phase roadmap, invoked via a GSD slash-command (per D-02) — not a trivial "create a file and commit it" prompt. — **Reversibility:** reversible.
- **D-07:** After verification, the disposable worktree and branch created for the demo are deleted — SyncSmith's real repository state is unchanged afterward. Phase evidence (logs/events/screenshots) is captured before cleanup. — **Reversibility:** reversible.
- **D-08:** `requestReview`/`requestHandoff` are functionally wired in Phase 4, not stubbed — `ClaudeCodeRuntime` actually detects when Claude Code needs human review or is handing off, using two complementary signal sources: (1) Phase 3's `gsd-adapter` for file-based GSD state signals, reused rather than reimplemented, and (2) `ClaudeCodeRuntime`'s own live SDK/output-stream observation for in-turn signals. The CEO dashboard UI that acts on these calls is still Phase 6. — **Reversibility:** costly.

### Claude's Discretion

- Exact `pauseTask` mechanism (D-03's sibling) — see [Pattern 2: Pause/Resume via Session Capture](#pattern-2-pauseresume-via-session-capture-not-in-process-suspend) below for this research's recommendation.
- Exact bounded-timeout duration for D-04's hang detection — see [Pitfall: Hang/Silence Detection](#pitfall-2-no-single-heartbeat-signal-exists-in-the-sdk---build-one-from-message-cadence).
- Exact package/module boundary for `AgentRuntime` vs `ClaudeCodeRuntime` — see [Architectural Responsibility Map](#architectural-responsibility-map) and [Recommended Project Structure](#recommended-project-structure) for this research's recommendation, informed by reading the actual Phase 3 packages.
- Exact checkpoint/output-pattern signals for D-08's live-stream detection — see [Pattern 4: requestReview/requestHandoff Signal Detection](#pattern-4-requestreviewrequesthandoff-signal-detection).
- Which specific SyncSmith phase is used for the demo (D-06) — left to the planner; not researched here (repo-specific, changes over time).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUNTIME-01 | An AgentRuntime interface (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff) exists independent of any specific coding-agent implementation | [Architectural Responsibility Map](#architectural-responsibility-map), [Recommended Project Structure](#recommended-project-structure), [Code Examples: AgentRuntime interface](#the-agentruntime-interface-packagesorchestration-adapter) |
| RUNTIME-02 | ClaudeCodeRuntime implements AgentRuntime using the Claude Agent SDK, authenticated via Claude MAX subscription, with no ANTHROPIC_API_KEY required | [Critical Finding: Claude MAX auth/billing posture](#critical-finding-claude-max-subscription-auth-and-billing-posture-for-a-third-party-product), [Pattern 1](#pattern-1-query-streaming-turn-completion-and-session-capture), [Pattern 2](#pattern-2-pauseresume-via-session-capture-not-in-process-suspend), [Environment Availability](#environment-availability) |

</phase_requirements>

## Summary

The Claude Agent SDK's TypeScript `query()` function is a well-documented, actively maintained (published 1 day before this research, 8.16M weekly downloads) async-generator API that covers everything D-01 through D-08 need: streaming messages with a terminal `SDKResultMessage`, session capture/resume via `resume`/`continue`, an `AbortController`-based hard-cancel path, a `canUseTool` permission callback that fires for both tool approval and `AskUserQuestion` clarifying questions (the concrete live signal for D-08), and a `Notification` hook that fires `permission_prompt` after ~6 seconds of an unanswered `canUseTool` call (a second, independent D-08 signal). No concrete SDK capability gap was found during this research that would force the CLI-subprocess fallback D-01 describes — this research recommends **not** building that fallback speculatively; wire the SDK path only, and revisit if/when a real gap surfaces during implementation.

The one finding that changes the shape of this phase's risk, not its code: Anthropic's own current Agent SDK docs (`code.claude.com/docs/en/agent-sdk/overview`, fetched live this session) state "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." At the same time, Anthropic's support article on this exact topic (`support.claude.com/en/articles/15036540`) currently states the opposite in practice: "Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits" (the June 2026 billing-separation change was paused, not reinstated). These two official sources are in tension, and PixelFirm's D-01/RUNTIME-02 requirement ("no ANTHROPIC_API_KEY required") sits directly in the gap between them. This needs a first-party, positive falsification check — actually running a query, then checking which usage dashboard it billed against — before this phase builds anything on top of the assumption that it will keep working. See [Critical Finding](#critical-finding-claude-max-subscription-auth-and-billing-posture-for-a-third-party-product) below.

**Primary recommendation:** Build `ClaudeCodeRuntime` against `@anthropic-ai/claude-agent-sdk`'s `query()` only (no CLI subprocess fallback yet). Split the generic interface into its own package (`packages/orchestration-adapter`) and the SDK-specific implementation into `packages/claude-adapter`, matching the existing flat single-purpose package convention already used by `git-adapter`/`gsd-adapter`. Make the very first task of this phase a live, first-party billing-dashboard check against the actual Max-subscription machine before writing `ClaudeCodeRuntime` itself — it's the cheapest possible way to convert the single biggest open risk into a confirmed fact.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AgentRuntime interface (generic contract) | API/Backend-adjacent shared package (`packages/orchestration-adapter`, imported by worker) | — | Pure TypeScript contract, zero I/O, zero SDK types — same role `event-schema` already plays for the event bus (a shared contract multiple packages import) |
| ClaudeCodeRuntime (SDK-driving implementation) | Worker (`apps/worker` process, via `packages/claude-adapter`) | — | Must run wherever Claude Code is authenticated (the user's workstation) per ARCHITECTURE.md; control plane never needs Claude Code auth |
| Task lifecycle events (`task.status_changed`, session/review/handoff events) | Worker emits → Control Plane ingests → Company State Engine folds | Database/Storage (Postgres `events` table, already built) | Same one-way event flow every prior phase established; `ClaudeCodeRuntime` is a producer, never a consumer of state |
| Pause/resume session persistence | Worker (Claude Code's own `~/.claude/projects/<cwd>/*.jsonl` session store, local to the worker machine) | — | Session files are local-machine-only per SDK docs; no control-plane or database involvement needed for MVP (single worker machine) |
| Hang/silence bounded-timeout detection | Worker (`ClaudeCodeRuntime`'s own watchdog timer over the `query()` stream) | — | The SDK exposes no built-in "heartbeat" event; this must be built in the worker process that owns the stream, consistent with Phase 3's own heartbeat-as-application-event pattern |
| requestReview/requestHandoff signal detection | Worker (`ClaudeCodeRuntime`'s `canUseTool`/`Notification` hooks + reused `gsd-adapter` poll) | Control Plane (folds into `Approval`/`Task` projections via existing `ceo.approval_requested`/`agent.handoff_requested` event types) | Detection is worker-side (it needs the live SDK stream); the resulting event flows through the same one-way pipe as every other phase's events |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | `^0.3` (0.3.278 confirmed live via `npm view`, published 2026-09-19 — one day before this research) [VERIFIED: npm registry] | Drives the Claude Code agent loop programmatically: `query()`, sessions, permissions, hooks | Official, actively maintained Anthropic package; already the sole recommendation in `STACK.md` and already how Phase 3's `packages/git-adapter`/`gsd-adapter` precedent expects new adapters to be built (no bespoke subprocess wrapper). Engines requirement `node >=18.0.0` [VERIFIED: npm registry], comfortably covered by this repo's actual Node v25.9.0. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `execa` | `^10.0.1` (already a dependency of `packages/git-adapter` and `apps/worker`'s devDependencies) [VERIFIED: F:/Sidegigs/PixelFirm/packages/git-adapter/package.json:9, F:/Sidegigs/PixelFirm/apps/worker/package.json:16] | Only needed if/when the CLI-subprocess fallback (D-01) is actually triggered by a concrete SDK gap | Do not add a new subprocess library — `execa` is already in the monorepo for exactly this shape of work; reuse it, don't introduce a second one |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/claude-agent-sdk`'s `query()` | Shelling out to `claude -p --output-format stream-json` via `execa` and hand-parsing | Only if a genuine SDK gap surfaces (D-01's own condition). This research did not find one — the SDK covers streaming, sessions, resume, interrupt/cancel, and permission-based blocking-question detection at least as well as the CLI, and additionally gives typed messages instead of hand-parsed JSON lines. |

**Installation:**
```bash
pnpm --filter claude-adapter add @anthropic-ai/claude-agent-sdk
```

**Version verification:** Confirmed live this session via `npm view @anthropic-ai/claude-agent-sdk version` → `0.3.278`, `npm view @anthropic-ai/claude-agent-sdk time.modified` → `2026-09-19T03:10:44.383Z`, `npm view @anthropic-ai/claude-agent-sdk engines` → `{ node: '>=18.0.0' }`. [VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@anthropic-ai/claude-agent-sdk` | npm | Latest version published 2026-09-19 (1 day before this research) | 8,164,557/week | `github.com/anthropics/claude-agent-sdk-typescript` | **SUS** (reason: `too-new`) | **Flagged — planner must add a `checkpoint:human-verify` task before install**, per protocol. This is very likely a false positive of the "too-new" heuristic (it keys off the most recent version's publish date, not the package's actual age or trust level) — 8.16M weekly downloads and the official `anthropics` GitHub org are strong legitimacy signals a slopsquat package would not have. Flagged anyway, as required. |
| `execa` | npm | Latest published 2026-07-31 | 123,490,604/week | `github.com/sindresorhus/execa` | OK | Approved (already installed in this monorepo — no new install needed unless the CLI fallback is triggered) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@anthropic-ai/claude-agent-sdk` — planner must insert a `checkpoint:human-verify` before the `pnpm add` step, even though this research assesses the flag as a heuristic false positive.

## Critical Finding: Claude MAX subscription auth and billing posture for a third-party product

This directly answers this phase's flagged research question ("confirm current billing/ToS posture") and STATE.md's "re-verify Claude Max-subscription billing terms" blocker. It does not fully resolve the question — it sharpens it into something checkable.

**What's confirmed, HIGH confidence:**

- The SDK/CLI authentication mechanism itself works exactly as STACK.md assumed: `claude -p` **without** `--bare` "loads the same context an interactive session would" and authenticates via the existing `claude login` OAuth/subscription session — `ANTHROPIC_API_KEY` is not required and is not read unless `--bare` is passed. [CITED: code.claude.com/docs/en/headless] Verified live on this machine this session: `claude auth status` → `{"loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "pro"}` [VERIFIED: local `claude auth status` output, this session — this machine is on a Pro plan, not Max, but the auth mechanism ClaudeCodeRuntime depends on is identical for Max]. The Agent SDK's `query()` defaults to "existing `claude` CLI login" before falling back to `ANTHROPIC_API_KEY`. [CITED: code.claude.com/docs/en/agent-sdk/typescript]
- Anthropic's support article on this exact question, current as of this research: *"We're pausing the changes to Claude Agent SDK usage described below. For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits."* [CITED: support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan, fetched live this session] This matches STACK.md's existing MEDIUM-confidence note that the billing-separation change was "paused mid-2026."

**What's in tension, and why it matters:**

- The Agent SDK's own current overview page carries this explicit note, unrelated to the billing-credit episode above: *"Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."* [CITED: code.claude.com/docs/en/agent-sdk/overview, fetched live this session]
- Read narrowly, this note targets products that resell/expose claude.ai login to *their own end users* (e.g., a SaaS letting User B log in with their own claude.ai account to power a feature User A pays for) — not a single operator running their own already-authenticated `claude` CLI session against their own repo. PixelFirm's REQUIREMENTS.md explicitly scopes this to "Personal/internal use first" and lists "Public SaaS multi-tenancy" as out of scope, which is the more defensible reading. But it is a reading, not a carve-out Anthropic has stated — the sentence as written is broad enough ("including agents built on the Claude Agent SDK") that it is not obviously inapplicable to any third-party product built on the SDK, personal-use or not.
- Third-party (non-Anthropic) reports add noise, not signal, on top of this: a GitHub issue on `anthropics/claude-code` (#43333) reports `claude -p` with valid Max OAuth sometimes billing to the API usage dashboard instead of the Max dashboard, with no visible maintainer resolution. [CITED: github.com/anthropics/claude-code/issues/43333 — user bug report, unconfirmed by Anthropic, do not treat as fact] This is exactly the kind of thing a 5-minute live check resolves and a research pass cannot.

**Recommendation for the plan:** Make the very first task of this phase a `checkpoint:human-verify`-gated spike, before any `ClaudeCodeRuntime` code is written: on the actual Max-subscription-authenticated machine, run one real `query()` call (or `claude -p`) with no `ANTHROPIC_API_KEY` set, then check the Max usage view at claude.ai against the API usage dashboard at platform.claude.com to confirm which one the call counted against. This is a positive falsification attempt this research could not perform (no Max-subscription credential available in this session) — running it is cheap and it is the one check that actually resolves RUNTIME-02's "no ANTHROPIC_API_KEY required" constraint instead of assuming it. If the call bills against platform.claude.com instead of the Max dashboard, that is a phase-blocking finding the CEO/user needs to see before more of this phase is built.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────┐
                    │  apps/worker  (this phase's new code lives here)  │
                    │                                                    │
  startTask() ──────┼──▶ ClaudeCodeRuntime.startTask()                   │
  pauseTask()        │        │                                          │
  resumeTask()       │        ▼                                          │
  cancelTask()       │   query({ prompt: "/gsd-execute-phase N",        │
  getStatus()        │           options: { cwd: worktreePath,          │
  sendMessage()       │                     resume?, abortController,    │
  requestReview()      │                    canUseTool, hooks } })       │
  requestHandoff()      │        │                                        │
                    │        ▼ (async generator, one message per line)  │
                    │   for await (message of query(...)) {              │
                    │     watchdog.reset()          ◄── D-04 hang guard  │
                    │     switch (message.type) {                        │
                    │       "system"/"init"  → capture session_id        │
                    │       "assistant"      → progress, no event yet    │
                    │       "result"         → task.status_changed(done) │
                    │     }                                               │
                    │   }                                                 │
                    │        │                                            │
                    │        ▼                                            │
                    │   canUseTool(toolName, input) {                     │
                    │     if toolName === "AskUserQuestion"               │
                    │        → requestReview()  ──┐    D-08 signal #1     │
                    │     if tool needs CEO gate   │                      │
                    │        → requestReview()  ──┤                       │
                    │   }                          │                      │
                    │   Notification hook          │                      │
                    │     (permission_prompt @ ~6s)│    D-08 signal #2     │
                    │        └────────────────────►│                      │
                    │                               ▼                      │
                    │   gsd-adapter.observeGsdState() (existing, reused)  │
                    │        (poll loop's file-based GSD signal, D-08 src 2)
                    │                               │                      │
                    │                               ▼                      │
                    │   buildEnvelope() → postEvent()  (existing, reused) │
                    └───────────────────────────────┼────────────────────┘
                                                     │ typed CompanyEvent
                                                     ▼
                                     Control Plane (unchanged this phase)
                              ceo.approval_requested / agent.handoff_requested /
                              task.status_changed (new) → Company State Engine
```

A reader can trace: an `AgentRuntime` method call enters `ClaudeCodeRuntime`, drives one `query()` stream, and every state transition (turn complete, blocked on a question, hang timeout, CEO-gated tool) becomes exactly one `CompanyEvent` posted through the same `buildEnvelope()`/`postEvent()` path Phase 3 already built and tested — nothing in this phase invents a second event-emission path.

### Recommended Project Structure

```
packages/
├── orchestration-adapter/    # NEW — the AgentRuntime interface, zero SDK deps
│   └── src/
│       ├── index.ts          # export type { AgentRuntime, AgentTaskStatus, ... }
│       └── types.ts
├── claude-adapter/            # NEW — ClaudeCodeRuntime, the sole implementation
│   └── src/
│       ├── index.ts           # export { ClaudeCodeRuntime }
│       ├── claude-code-runtime.ts   # implements AgentRuntime, imports the SDK
│       ├── watchdog.ts         # D-04 bounded-silence timer
│       └── signal-detection.ts # D-08 canUseTool/Notification hook wiring
apps/
└── worker/
    └── src/
        └── (imports orchestration-adapter for typing, claude-adapter for the instance —
             same pattern already used for git-adapter/gsd-adapter)
```

### Structure Rationale

- **Two packages, not one, and not three.** `packages/event-schema` already establishes the precedent this recommendation follows: a thin, dependency-free contract package that multiple other packages import [VERIFIED: F:/Sidegigs/PixelFirm/packages/event-schema/package.json — depends only on `zod`]. `orchestration-adapter` plays the same role for the runtime interface: `apps/worker` can type against it without depending on the SDK, and a future `packages/maestro-adapter` (RUNTIME-05, v2, out of scope now) would import `orchestration-adapter`, not reach into `claude-adapter` to borrow its types. This resolves CONTEXT.md's two candidate options (`orchestration-adapter`+`claude-adapter` split, vs. interface-in-`company-core`) in favor of the split — `company-core`'s actual current contents are exclusively reducers/projections that only import `event-schema` [VERIFIED: F:/Sidegigs/PixelFirm/packages/company-core/package.json:9 `"event-schema": "workspace:*"` is its only dependency; F:/Sidegigs/PixelFirm/packages/company-core/src/reducer.ts, projections.ts contain only reducer functions and projection interfaces, no adapter-style logic], so adding a runtime-interface concern there would be the first thing in that package that isn't state-folding.
- **Naming matches existing convention exactly.** Every existing adapter package is a flat, unscoped `packages/<name>` directory with `package.json.name` equal to the directory basename and `workspace:*` for internal deps [VERIFIED: F:/Sidegigs/PixelFirm/packages/git-adapter/package.json:2 `"name": "git-adapter"`, F:/Sidegigs/PixelFirm/packages/gsd-adapter/package.json:2 `"name": "gsd-adapter"`, both `"main": "src/index.ts"`]. `orchestration-adapter` and `claude-adapter` are the exact names ARCHITECTURE.md's own Recommended Project Structure already proposed — no new naming scheme introduced.
- **Anti-Pattern 3 enforcement is structural, not a code-review rule.** Because `orchestration-adapter` has zero dependency on `@anthropic-ai/claude-agent-sdk`, it is mechanically impossible for an SDK type to leak into it — a future `MaestroRuntime` package literally cannot `import` an SDK type from there because it isn't there.

### Pattern 1: `query()` streaming, turn completion, and session capture

**What:** `query({ prompt, options })` returns a `Query` object (an `AsyncGenerator<SDKMessage, void>` plus extra methods). Iterate with `for await`; a `message.type === "result"` (`SDKResultMessage`) marks turn completion and always carries `session_id`, success or error. [CITED: code.claude.com/docs/en/agent-sdk/typescript, code.claude.com/docs/en/agent-sdk/sessions]

**When to use:** Every `startTask`/`resumeTask` call in `ClaudeCodeRuntime`.

**Example:**
```typescript
// Source: code.claude.com/docs/en/agent-sdk/sessions (fetched live this session)
import { query } from "@anthropic-ai/claude-agent-sdk";

let sessionId: string | undefined;

try {
  for await (const message of query({
    prompt: "Analyze the auth module and suggest improvements",
    options: { allowedTools: ["Read", "Glob", "Grep"] }
  })) {
    if (message.type === "result") {
      sessionId = message.session_id;
      if (message.subtype === "success") {
        console.log(message.result);
      }
    }
  }
} catch (error) {
  // A single-shot query() throws after yielding an error result.
  console.error(`Session ended with an error: ${error}`);
}
```
`SDKResultMessage.session_id` is present on every result "regardless of success or error" [CITED: code.claude.com/docs/en/agent-sdk/sessions] — capture it unconditionally, not only on success, so a failed task can still be resumed/inspected.

### Pattern 2: Pause/Resume via session capture (not in-process suspend)

**What:** The TypeScript SDK has no persistent client object (unlike Python's `ClaudeSDKClient`) — "the experimental V2 session API ... `createSession()` with a `send`/`stream` pattern, was removed in TypeScript Agent SDK 0.3.142." [CITED: code.claude.com/docs/en/agent-sdk/sessions] Each `query()` call is single-shot. This resolves CONTEXT.md's open discretion: **`pauseTask` cannot hold the process alive and interrupt-in-place in the TypeScript SDK — it must end the current `query()` call and preserve the session ID for `resume`.**

- `pauseTask(taskId)`: interrupt the running `query()`'s turn (graceful — see Pattern 3 below for the exact interrupt/abort distinction), capture `session_id` from the last-seen `result` or the `init` `system` message (available earlier than the terminal `result` message per the docs: "In TypeScript the ID is also available earlier as a direct field on the init `SystemMessage`" [CITED: code.claude.com/docs/en/agent-sdk/sessions]), persist it on the `TaskState` record, mark status `paused`.
- `resumeTask(taskId)`: start a **new** `query()` call with `options: { resume: sessionId }` and a continuation prompt. The agent "picks up with full context from wherever the session left off." [CITED: code.claude.com/docs/en/agent-sdk/sessions]

**Example:**
```typescript
// Source: code.claude.com/docs/en/agent-sdk/sessions (fetched live this session)
const sessionId = "..."; // captured from the paused task's last result/init message

for await (const message of query({
  prompt: "Continue the task from where you left off",
  options: {
    resume: sessionId,
    allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

**Note:** Session files live at `~/.claude/projects/<encoded-cwd>/*.jsonl`, local to the worker machine only [CITED: code.claude.com/docs/en/agent-sdk/sessions] — this is fine for MVP (one worker, one machine per RUNTIME-03) and needs no `SessionStore` adapter. Do not build cross-host resume for this phase; nothing in scope needs it.

### Pattern 3: Graceful interrupt vs. hard cancel (feeds D-03)

**What:** The headless-mode docs draw an explicit line between two termination mechanisms that maps directly onto D-03's "graceful interrupt first, then hard kill":

> "If you stop a `claude -p` run with SIGTERM ... Claude Code exits with code 143. Claude Code leaves the turn that was in progress unfinished and records no result for it. To end the turn instead, send SIGINT, or call the Agent SDK's `interrupt()`, before you stop the process." [CITED: code.claude.com/docs/en/headless, fetched live this session]

Mapped onto the SDK: `AbortController.abort()` is the hard/ungraceful path (SIGTERM-equivalent — the `Options.abortController` field's own doc comment says "When aborted, the query will stop and clean up resources" [VERIFIED: unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.278/sdk.d.ts, `abortController` field doc comment, fetched live this session], with no guarantee the current turn finishes cleanly). A separate, graceful `interrupt()` mechanism (SIGINT-equivalent — ends the current turn cleanly, keeps the recorded result) is named explicitly in the headless docs, but this research could not locate its exact TypeScript call shape (`Query.interrupt()` vs. a top-level export vs. a streaming-input control message) in the portion of the shipped `.d.ts` this session's tooling was able to retrieve — the file also references a `stop_task` control-request mechanism for per-task stop in streaming/background-task sessions, which may be the actual mechanism. **This is flagged in [Assumptions Log](#assumptions-log) — verify the exact method name against the installed package's type definitions as the first sub-task of implementing `cancelTask`/`pauseTask`, before writing the calling code.**

**Recommended pattern regardless of the exact method name:**
```typescript
// cancelTask (D-03): graceful first, hard kill on timeout
async function cancelTask(taskId: string): Promise<void> {
  const handle = getRunningQuery(taskId);
  // 1. Graceful: end the current turn cleanly (SIGINT-equivalent).
  //    Exact call TBD — verify against installed @anthropic-ai/claude-agent-sdk's
  //    type definitions (Query.interrupt(), a stop_task control message, or similar).
  handle.gracefulInterrupt();
  const exited = await Promise.race([
    handle.waitForExit(),
    sleep(GRACEFUL_TIMEOUT_MS).then(() => false),
  ]);
  // 2. Hard kill on timeout (SIGTERM-equivalent) — guarantees termination.
  if (!exited) handle.abortController.abort();
}
```

### Pattern 4: requestReview/requestHandoff signal detection

**What:** Two independent, complementary live-SDK signals answer CONTEXT.md's open discretion for D-08 source (2):

1. **`canUseTool` callback fires for `AskUserQuestion`.** *"Claude requests user input in two situations: when it needs permission to use a tool ... and when it has clarifying questions (via the `AskUserQuestion` tool). Both trigger your `canUseTool` callback, which pauses execution until you return a response."* [CITED: code.claude.com/docs/en/agent-sdk/user-input, fetched live this session] Check `toolName === "AskUserQuestion"` inside `canUseTool` — this is a mid-task blocking question exactly of the kind `gsd-adapter`'s poll-based file observation would miss between ticks.
2. **`Notification` hook fires `permission_prompt` after ~6 seconds unanswered.** *"Use `Notification` hooks to receive system notifications from the agent ... `permission_prompt` once a permission request has waited about six seconds on your `canUseTool` callback."* [CITED: code.claude.com/docs/en/agent-sdk/hooks, fetched live this session] This is a second, timing-based signal independent of which tool triggered the wait — useful as a fallback trigger for `requestReview` even for non-`AskUserQuestion` approval waits (e.g. a CEO-gated deploy/destructive op per ARCHITECTURE.md's approval flow).

**Example:**
```typescript
// Source: code.claude.com/docs/en/agent-sdk/user-input + hooks (fetched live this session)
const options = {
  canUseTool: async (toolName: string, input: unknown, ctx: { signal: AbortSignal }) => {
    if (toolName === "AskUserQuestion") {
      await requestReview(taskId, { kind: "clarifying_question", input });
      // ... surface to CEO dashboard via ceo.approval_requested (Phase 6 consumes it) ...
      return { behavior: "allow" as const, updatedInput: input }; // after CEO answers
    }
    if (needsCeoGate(toolName, input)) {
      await requestReview(taskId, { kind: "ceo_gated_tool", toolName, input });
      return { behavior: "allow" as const, updatedInput: input };
    }
    return { behavior: "allow" as const, updatedInput: input };
  },
  hooks: {
    Notification: [{
      hooks: [async (input: { message: string }) => {
        // permission_prompt after ~6s unanswered — secondary signal, same requestReview path
        return {};
      }],
    }],
  },
};
```

**Reused, not reimplemented (D-08 source 1):** `gsd-adapter`'s `observeGsdState()` [VERIFIED: F:/Sidegigs/PixelFirm/packages/gsd-adapter/src/index.ts:25-44] already exists and is already imported by `apps/worker/src/poll-loop.ts` [VERIFIED: F:/Sidegigs/PixelFirm/apps/worker/src/poll-loop.ts:3] — Phase 4 does not touch this function; it composes its own output with the new live-stream signals above, exactly as D-08 specifies.

### Anti-Patterns to Avoid

- **Reimplementing `gsd-adapter`'s file-based observation inside `claude-adapter`.** D-08 explicitly requires reuse — a second, parallel GSD-state parser is duplicated logic that will drift.
- **Building the CLI subprocess fallback path before hitting a concrete SDK gap.** D-01 requires the fallback to exist only for "a specific, identified SDK gap discovered during research/implementation" — this research found none. Building it now is speculative code with no test coverage that anything actually exercises it (ponytail: YAGNI).
- **Using `permissionMode: "bypassPermissions"` for any unattended task run.** This mode "approves everything that reaches this step" [CITED: code.claude.com/docs/en/agent-sdk/permissions] except a small list of always-gated actions — it silently defeats D-08's CEO-gate detection since a bypassed tool call never reaches `canUseTool`. Use `"default"` (or `"plan"` for the demo's exploratory phase) and let CEO-gated operations fall through to `canUseTool`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming message parsing / turn-completion detection | Hand-parsed `stream-json` line-by-line JSON | `query()`'s typed `AsyncGenerator<SDKMessage>` and `message.type === "result"` | The SDK already does this and gives typed messages instead of raw JSON lines to re-validate |
| Session resume bookkeeping | A custom session-ID-to-transcript-file mapping | SDK's `resume`/`continue` options + `session_id` on every result | Claude Code already writes and indexes `~/.claude/projects/<cwd>/*.jsonl`; duplicating that index is pure risk for zero benefit |
| Permission/approval gating | A custom "is this tool dangerous" heuristic layered on top of the SDK | `canUseTool` callback + `PreToolUse`/`PermissionRequest` hooks, which the SDK already evaluates in a documented six-step order (hooks → deny rules → ask rules → permission mode → allow rules → `canUseTool`) [CITED: code.claude.com/docs/en/agent-sdk/permissions] | Reimplementing this ordering wrong is exactly how a CEO-gated operation gets silently auto-approved — the anti-pattern PROJECT.md and ARCHITECTURE.md both explicitly forbid |
| GSD state observation | A second `.planning/` parser inside `claude-adapter` | `packages/gsd-adapter`'s existing `observeGsdState()` | D-08 requires reuse; already built, already tested in Phase 3 |

**Key insight:** Every piece of plumbing this phase needs — streaming, sessions, permission gating, blocking-question detection — already exists as a documented, versioned SDK primitive. The actual engineering work in this phase is composing those primitives into `AgentRuntime`'s eight methods and translating their signals into `CompanyEvent`s, not building any of the primitives themselves.

## Common Pitfalls

### Pitfall 1: Treating "Claude Max subscription auth" as a solved, static fact

**What goes wrong:** The runtime is built and demoed successfully, then billing quietly starts drawing from API credits instead of the subscription pool weeks later when Anthropic revisits the paused billing-separation plan, or the "third party product" restriction on the overview page is enforced more literally than PixelFirm's personal-use interpretation assumes.
**Why it happens:** This is a live, actively-changing policy area — the current "paused" state is itself provisional ("Anthropic stated they are revising the plan and will share advance notice before any future change takes effect" [CITED: thenewstack.io, cross-checked against the official support.claude.com pause notice]).
**How to avoid:** Do the live falsification check recommended in [Critical Finding](#critical-finding-claude-max-subscription-auth-and-billing-posture-for-a-third-party-product) as this phase's first task, and re-check it again before scaling beyond the single-demo-task verification this phase requires (STATE.md already flags this as a pre-scaling checkpoint).
**Warning signs:** Any usage showing up on `platform.claude.com` (the API dashboard) instead of the Max plan's own usage view at claude.ai.
**Phase to address:** This phase, as the first task — not deferred to "before scaling."

### Pitfall 2: No single "heartbeat" signal exists in the SDK — build one from message cadence

**What goes wrong:** D-04 requires a bounded-silence timeout, but there is no `SDKHeartbeatMessage` or equivalent to key off — only sees progress via `assistant`/`SDKTaskProgressMessage`/`SDKHookProgressMessage`/`result` messages arriving on the stream.
**Why it happens:** The SDK's message stream is push-based on model/tool activity, not a fixed-interval heartbeat; a long single tool call (e.g. a slow test suite) can legitimately produce no new message for tens of seconds without anything being wrong.
**How to avoid:** Build the watchdog in `ClaudeCodeRuntime` itself: reset a timer on **every** yielded message of **any** type (not just `result`), and only fire the bounded-timeout `blocked`/`failed` transition if the timer expires with zero messages received — matching PITFALLS.md's own "hang/kill-test" verification requirement for this phase. Pick a starting timeout generous enough for a real GSD phase's slowest single tool call (a full test suite run, a large `npm install`) — this research recommends starting around 90–120 seconds as a tunable constant (Claude's Discretion per CONTEXT.md), not the seconds-scale timing used for the `Notification` hook's `permission_prompt` (which is about *user-approval* latency, a different and much shorter timescale).
**Warning signs:** A `getStatus()` call that never returns anything but `running` for a task whose underlying process has actually exited or hung.
**Phase to address:** This phase (already the exact scenario PITFALLS.md names for this phase, and D-04's own text).

### Pitfall 3: `allowed_tools`/`bypassPermissions` interactions can silently widen access beyond what CEO-gating intends

**What goes wrong:** A well-intentioned `allowedTools: ["Read", "Bash"]` list combined with `permissionMode: "bypassPermissions"` still approves every tool, not just the listed ones — "`allowed_tools` does not constrain `bypassPermissions`" [CITED: code.claude.com/docs/en/agent-sdk/permissions] — so a config meant to be a narrow allowlist becomes no restriction at all if `bypassPermissions` mode is ever set (even temporarily, e.g. for a fast demo run).
**Why it happens:** The permission evaluation order (hooks → deny → ask → mode → allow → `canUseTool`) means the permission *mode* step is evaluated before allow-rules narrow anything, and `bypassPermissions` short-circuits that step entirely for everything except a small always-gated list.
**How to avoid:** Never set `permissionMode: "bypassPermissions"` for any task this runtime drives unless a human has explicitly approved running fully unattended for that specific task — use `"default"` (or `"plan"` during the demo's exploratory read/plan phase) so CEO-gated tools always reach `canUseTool`.
**Warning signs:** A task that never triggers `requestReview` despite the underlying GSD workflow containing an obvious checkpoint (e.g. a deploy step) — check the configured `permissionMode` first.
**Phase to address:** This phase, when wiring `canUseTool`/permission mode into `ClaudeCodeRuntime`.

## Code Examples

### The `AgentRuntime` interface (`packages/orchestration-adapter`)

```typescript
// packages/orchestration-adapter/src/types.ts — zero SDK imports, ever.
export type AgentTaskStatus =
  | "starting"
  | "running"
  | "paused"
  | "blocked"
  | "waiting_for_review"
  | "waiting_for_handoff"
  | "completed"
  | "failed"
  | "cancelled";

export interface StartTaskInput {
  taskId: string;
  repoPath: string;
  worktreePath: string;
  prompt: string; // per D-02, this is a GSD slash-command, not arbitrary freeform text
}

export interface AgentRuntime {
  startTask(input: StartTaskInput): Promise<void>;
  pauseTask(taskId: string): Promise<void>;
  resumeTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
  getStatus(taskId: string): Promise<AgentTaskStatus>;
  sendMessage(taskId: string, message: string): Promise<void>;
  requestReview(taskId: string, reason: string): Promise<void>;
  requestHandoff(taskId: string, toAgentId: string): Promise<void>;
}
```

This shape is deliberately generic: no session IDs, no SDK message types, no permission-mode strings anywhere in the interface — all of that lives inside `claude-adapter`'s implementation, per Anti-Pattern 3.

### Extending `event-schema` for task lifecycle (additive, per established pattern)

The discriminated union already contains three event types this phase should **reuse rather than reinvent** for `requestReview`/`requestHandoff`:

```typescript
// Source: F:/Sidegigs/PixelFirm/packages/event-schema/src/payloads/index.ts:10-14 (read this session)
const AgentHandoffRequestedPayload = z.object({ taskId: z.string(), toAgentId: z.string() });
const ReviewStartedPayload = z.object({ taskId: z.string() });
const CeoApprovalRequestedPayload = z.object({ taskId: z.string(), reason: z.string() });
```
`requestReview()` should emit `ceo.approval_requested` (payload matches exactly: `{taskId, reason}`), and `requestHandoff()` should emit `agent.handoff_requested` (payload matches exactly: `{taskId, toAgentId}`) — these were seeded in Phase 1 and have sat unused; this is their first real producer. A new `task.status_changed` event type is still needed for `getStatus()`'s lifecycle transitions (`running`/`paused`/`blocked`/`completed`/`failed`/`cancelled` — none of the 15 existing members carry a general task-status field), appended additively after the existing 15 members, never via `.extend()` chaining [pattern already established: F:/Sidegigs/PixelFirm/packages/event-schema/src/payloads/index.ts:53-58, "Composed via spread, never chained `.extend()`"].

**Note for the planner:** `buildEnvelope()` [VERIFIED: F:/Sidegigs/PixelFirm/apps/worker/src/event-emitter.ts:11-26] does not currently accept a `taskId` parameter — Phase 3's own code comment flags this as WR-02, "a deliberately deferred, currently unreachable path ... not part of this phase" [VERIFIED: F:/Sidegigs/PixelFirm/apps/worker/src/poll-loop.ts:81-88]. This phase is exactly where that gap needs closing: task-lifecycle events must carry `taskId` on `BaseEnvelope` [VERIFIED: F:/Sidegigs/PixelFirm/packages/event-schema/src/envelope.ts:15 `taskId: z.string().optional()`] for the Company State Engine's `TaskState` projection to update. Extend `buildEnvelope()`'s signature to accept an optional `taskId`, or construct these envelopes directly in `claude-adapter`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| TypeScript SDK `createSession()` with `send`/`stream` (V2 session API) | `query()` + `resume`/`continue` options | Removed in TypeScript Agent SDK 0.3.142 [CITED: code.claude.com/docs/en/agent-sdk/sessions] | Any tutorial/blog post referencing `createSession()` for TS is stale — do not follow it |
| Assuming `-p` mode is always non-interactive/API-key-only | Non-`--bare` `-p` uses subscription OAuth by default; `--bare` requires `ANTHROPIC_API_KEY` and is "the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release" [CITED: code.claude.com/docs/en/headless] | Current as of this research | If a future Claude Code version flips `--bare`'s default, `ClaudeCodeRuntime`'s underlying CLI dependency (the SDK still shells out to the bundled `claude` binary on some code paths per STACK.md) could silently start requiring `ANTHROPIC_API_KEY` unless the SDK's own default is pinned away from that |

**Deprecated/outdated:** V2 TypeScript session API (`createSession`) — removed, do not use or reference.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Claude Max subscription billing for a third-party Agent-SDK product will continue to work as it does today (subscription-pool billing, no separate credit pool) through this phase's implementation window | Critical Finding | If wrong, RUNTIME-02 as currently scoped ("no ANTHROPIC_API_KEY required") cannot be satisfied without a policy exception; this is exactly why a live check is recommended as the phase's first task rather than assumed here |
| A2 | The exact TypeScript method for the SDK's graceful "interrupt" (SIGINT-equivalent, distinct from `AbortController.abort()`) is a callable on the `Query` object or a `stop_task` control-request message — this research could not confirm the precise call shape from the shipped `.d.ts` | Pattern 3 | If the actual mechanism differs, `pauseTask`/`cancelTask`'s "graceful first" step may need to fall back to `abortController.abort()` only, losing the clean-turn-completion benefit D-03 wants; low implementation risk (one spike task resolves it), no design risk |
| A3 | PixelFirm's single-operator, personal/internal use case falls outside the scope of the Agent SDK overview page's "third party developers... offer claude.ai login or rate limits for their products" restriction | Critical Finding | If Anthropic enforces this literally regardless of personal-use framing, this phase's entire auth approach (and REQUIREMENTS.md's "Out of Scope: ANTHROPIC_API_KEY... dependency" line) would need re-litigating with the user before further phases build on it |
| A4 | A bounded hang-detection timeout in the 90–120 second range is generous enough to not false-positive on a real GSD phase's slowest single tool call, while still bounded enough to satisfy D-04's UX intent (office never frozen indefinitely) | Pitfall 2 | If too short: false "blocked" events during legitimate long-running tool calls (e.g. `npm install`, full test suites). If too long: office visibly frozen for minutes before recovering — this is a tunable constant either way, not a design risk |

## Open Questions

1. **Does the actual demo/production worker machine's Claude Max subscription bill `query()`/`claude -p` calls against the Max usage pool or the API usage pool?**
   - What we know: official docs currently say "yes, Max pool, unchanged" (support.claude.com); a separate official page's phrasing about "third party products" is broad enough to cast doubt; unconfirmed user bug reports exist on both sides.
   - What's unclear: whether PixelFirm specifically, as a personal-use non-SaaS tool, is inside or outside whatever restriction that page is describing, and whether the current "paused" billing-separation state holds through this phase's implementation window.
   - Recommendation: first task of this phase, `checkpoint:human-verify`-gated, per [Critical Finding](#critical-finding-claude-max-subscription-auth-and-billing-posture-for-a-third-party-product).

2. **What is the exact TypeScript call for the SDK's graceful "interrupt" mechanism the headless docs reference but this research could not pin down verbatim in the shipped types?**
   - What we know: headless docs name it explicitly ("call the Agent SDK's `interrupt()`"); the `.d.ts` mentions a `stop_task` control request tied to a "per-task stop affordance" for streaming/background sessions, which may be the actual mechanism, or may be a related-but-different feature.
   - What's unclear: whether this is a method on the `Query` object, a standalone export, or reachable only via streaming-input control messages.
   - Recommendation: a short spike (read the installed package's actual `node_modules/@anthropic-ai/claude-agent-sdk/**/*.d.ts` once it's added as a dependency) as the first sub-task of implementing `pauseTask`/`cancelTask`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `claude` CLI, authenticated via subscription (not API key) | `ClaudeCodeRuntime`'s entire auth model | ✓ (confirmed on this research machine; the actual worker machine must be independently confirmed) | 2.1.278, `authMethod: "claude.ai"`, `apiProvider: "firstParty"` [VERIFIED: local `claude auth status` output, this session] | None — this is the entire premise of RUNTIME-02; if unavailable on the real worker machine, the phase cannot proceed as scoped |
| `@anthropic-ai/claude-agent-sdk` npm package | `ClaudeCodeRuntime` implementation | Not yet installed in this monorepo (no `package.json` currently references it) [VERIFIED: `grep -r "claude-agent-sdk" --include="package.json" .` returned no matches] | 0.3.278 available on npm | None — core dependency of this phase, install is the first real code task |
| Node.js ≥18 | SDK's stated engine requirement | ✓ | v25.9.0 running in this repo [VERIFIED: `node --version` this session] | None needed — comfortably exceeds the SDK's `>=18.0.0` requirement |

**Missing dependencies with no fallback:** none beyond "not yet installed," which this phase installs.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^5.0.1 (root devDependency) [VERIFIED: F:/Sidegigs/PixelFirm/package.json:5], same pattern as `apps/worker`'s existing `"test": "vitest run"` script [VERIFIED: F:/Sidegigs/PixelFirm/apps/worker/package.json:6] |
| Config file | none dedicated — Vitest defaults, matching every existing package in this monorepo |
| Quick run command | `pnpm --filter claude-adapter test` |
| Full suite command | `pnpm test` (Turborepo fans out to every package's `test` script per `turbo.json`'s `"test": { "dependsOn": ["^test"] }`) [VERIFIED: F:/Sidegigs/PixelFirm/turbo.json:3-6] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| RUNTIME-01 | `AgentRuntime` interface methods are callable independent of `ClaudeCodeRuntime` | unit (typecheck + a stub implementation satisfying the interface) | `pnpm --filter orchestration-adapter typecheck` | ❌ Wave 0 |
| RUNTIME-02 | `ClaudeCodeRuntime` starts/pauses/resumes/cancels a real task with no `ANTHROPIC_API_KEY` set | integration, gated (requires a real Max-authenticated `claude` login — cannot run in a sandboxed CI without one) | `pnpm --filter claude-adapter test:integration` (env-flagged, skipped unless a real login is present) | ❌ Wave 0 |
| RUNTIME-02 (D-04) | Bounded-silence timeout surfaces `blocked`/`failed` on a hung stream | unit (fake/mocked `query()` async generator that never yields) | `pnpm --filter claude-adapter test -- watchdog` | ❌ Wave 0 |
| RUNTIME-02 (D-08) | `requestReview` fires on an `AskUserQuestion` tool call | unit (mocked `canUseTool` invocation) | `pnpm --filter claude-adapter test -- signal-detection` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter claude-adapter test` (unit tests, mocked SDK — fast, no real Claude Code auth needed)
- **Per wave merge:** `pnpm test` (full monorepo suite)
- **Phase gate:** The real, gated integration test against a Max-authenticated login, run manually per D-05/D-06/D-07's disposable-worktree demo, is the actual phase-completion proof — the unit suite alone cannot prove RUNTIME-02's "no ANTHROPIC_API_KEY required" claim, only a real run can.

### Wave 0 Gaps

- [ ] `packages/orchestration-adapter/src/index.ts` + `types.ts` — the interface itself
- [ ] `packages/claude-adapter/src/*.test.ts` — unit tests with a mocked/fake `query()` async generator (do not require real Claude Code auth for unit-level tests)
- [ ] A `test:integration` script gated behind an env var (e.g. `CLAUDE_CODE_INTEGRATION_TEST=1`) so the real-auth-required test never blocks CI/sandboxed runs but is runnable on demand for the D-05/D-06/D-07 demo

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (no new auth mechanism — reuses existing worker↔control-plane credential from Phase 2/3, per CONTEXT.md canonical refs) | — |
| V4 Access Control | Yes | Task control commands (pause/resume/cancel) must originate only from the already-authenticated control-plane→worker channel, never a bare unauthenticated call into `ClaudeCodeRuntime` — same boundary Phase 2/3 already established |
| V5 Input Validation | Yes | All new task-lifecycle event payloads validated through the same `CompanyEventSchema` Zod discriminated union every prior phase's events pass through — plain `z.object()`, never `z.looseObject()`, per the established Tampering mitigation [VERIFIED: F:/Sidegigs/PixelFirm/packages/event-schema/src/payloads/index.ts:58 "Every payload is a plain z.object() (never z.looseObject())"] |
| V6 Cryptography | Yes (by omission) | `ClaudeCodeRuntime` must never read, log, or transmit the OAuth credential Claude Code manages under `~/.claude/` — it is Claude Code's own concern; this runtime only ever invokes `query()` and lets the SDK's default credential resolution handle auth |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| A CEO-gated tool call (deploy, destructive op) auto-approved because `permissionMode` was accidentally set to `bypassPermissions` | Elevation of Privilege | Default to `permissionMode: "default"` (or `"plan"` for the demo's read/explore phase); never `"bypassPermissions"` for any unattended run, per Pitfall 3 above |
| Unbounded subagent fan-out from a GSD workflow exhausting rate limits and hanging the task indefinitely | Denial of Service | Cap concurrent subagents if `startTask`'s prompt can trigger them (PITFALLS.md's existing Pitfall 3, still applicable); the D-04 watchdog is the last line of defense if a cap isn't enough |
| A hung/silent task left showing "coding" forever, masking an actual failure from the CEO | Denial of Service (of the product's own core value — the office lying about state) | D-04's bounded-silence timeout, this phase's own named PITFALLS.md verification requirement |
| Task control commands (pause/resume/cancel) reaching `ClaudeCodeRuntime` from an unauthenticated or wrong-worker source | Spoofing/Tampering | These commands arrive over the worker's existing authenticated outbound connection (Phase 2 D-03's per-worker revocable credential) — `ClaudeCodeRuntime` itself trusts its caller (`apps/worker`'s own dispatch), which already enforces this boundary; no new check needed inside `claude-adapter` itself |

## Sources

### Primary (HIGH confidence)

- `code.claude.com/docs/en/agent-sdk/overview` — Agent SDK capability list, third-party claude.ai login restriction note (fetched live this session)
- `code.claude.com/docs/en/agent-sdk/typescript` — `query()` signature, `SDKMessage` types, `Options` fields, `AbortController`-based interruption, authentication order (fetched live this session)
- `code.claude.com/docs/en/agent-sdk/sessions` — continue/resume/fork mechanics, session ID capture, V2 API removal note, local-only session storage (fetched live this session)
- `code.claude.com/docs/en/agent-sdk/permissions` — six-step permission evaluation order, permission modes, `bypassPermissions` scope (fetched live this session)
- `code.claude.com/docs/en/agent-sdk/user-input` — `canUseTool` callback, `AskUserQuestion` detection (fetched live this session)
- `code.claude.com/docs/en/agent-sdk/hooks` — full hook event table, `Notification`/`permission_prompt` 6-second signal, hook timeout semantics (fetched live this session)
- `code.claude.com/docs/en/headless` — `-p`/`--bare` auth behavior, SIGINT-vs-SIGTERM/`interrupt()` distinction, `--output-format stream-json` (fetched live this session)
- `support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan` — current, official billing-pause status (fetched live this session)
- `unpkg.com/@anthropic-ai/claude-agent-sdk@0.3.278/sdk.d.ts` — verbatim `Options` field doc comments (`resume`, `continue`, `abortController`, `persistSession`), `stop_task` control-request mention (fetched live this session)
- `npm view @anthropic-ai/claude-agent-sdk` (version/time.modified/engines) — live registry query, this session
- Direct repo reads this session: `packages/git-adapter/`, `packages/gsd-adapter/`, `packages/company-core/`, `packages/event-schema/`, `apps/worker/src/poll-loop.ts`, `apps/worker/src/event-emitter.ts`

### Secondary (MEDIUM confidence)

- `github.com/anthropics/claude-code/issues/43333` — user-reported billing inconsistency for `claude -p` with OAuth (unconfirmed by Anthropic)
- `thenewstack.io` / `venturebeat.com` / `alternativeto.net` — third-party reporting on the Feb/April/June 2026 Claude Agent SDK billing policy changes and pause, cross-checked against the official support article above

### Tertiary (LOW confidence)

- None retained — all findings that could be checked against an official/authoritative source were, and are cited as such above.

## Metadata

**Confidence breakdown:**
- Standard stack / SDK mechanics: HIGH — every claim fetched live from official `code.claude.com` docs or the package's own shipped type definitions this session
- Claude MAX billing/ToS posture: MEDIUM — official sources are internally consistent on the current *practical* state (subscription billing still works, unchanged, as of the pause) but carry unresolved tension with the SDK overview page's third-party restriction language; resolved to a concrete, cheap first-task verification rather than left as an assumption
- Package boundary recommendation: HIGH — derived from reading the actual Phase 3 code and its `package.json` files this session, not from ARCHITECTURE.md's text alone
- Pitfalls: HIGH for the hang-detection and permission-mode pitfalls (directly sourced from official docs' own documented behavior); MEDIUM for the billing pitfall (policy area in flux)

**Research date:** 2026-09-20
**Valid until:** 7 days for the Claude MAX billing/ToS finding specifically (this is an actively-changing policy area per Anthropic's own "revising the plan" statement) — 30 days for the SDK mechanics (streaming/sessions/permissions/hooks), which are documented, versioned API surface unlikely to change meaning within a single phase's implementation window.
