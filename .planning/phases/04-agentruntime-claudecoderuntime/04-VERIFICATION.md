---
phase: 04-agentruntime-claudecoderuntime
verified: 2026-09-21T10:15:00Z
status: human_needed
score: 12/12 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-01-PLAN.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-01-SUMMARY.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-02-PLAN.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-02-SUMMARY.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-03-PLAN.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-03-SUMMARY.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-04-PLAN.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-04-SUMMARY.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-04-demo-evidence.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-REVIEW-FIX.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/04-REVIEW.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/COVERAGE.md"
  - ".planning/phases/04-agentruntime-claudecoderuntime/deferred-items.md"
  - "packages/claude-adapter/package.json"
  - "packages/claude-adapter/src/claude-code-runtime.integration.test.ts"
  - "packages/claude-adapter/src/claude-code-runtime.test.ts"
  - "packages/claude-adapter/src/claude-code-runtime.ts"
  - "packages/claude-adapter/src/event-emitter.ts"
  - "packages/claude-adapter/src/index.ts"
  - "packages/claude-adapter/src/signal-detection.test.ts"
  - "packages/claude-adapter/src/signal-detection.ts"
  - "packages/claude-adapter/src/watchdog.test.ts"
  - "packages/claude-adapter/src/watchdog.ts"
  - "packages/company-core/src/reducer.test.ts"
  - "packages/company-core/src/reducer.ts"
  - "packages/event-schema/src/payloads/index.ts"
  - "packages/orchestration-adapter/package.json"
  - "packages/orchestration-adapter/src/index.ts"
  - "packages/orchestration-adapter/src/types.ts"
covered_digest: "v1:sha256:fe2c667e4a8e2ecdda03edddab82fdae4bbc0207628636ccb18d3e2a0eb90f95"
behavior_unverified: 0
overrides_applied: 0
behavior_unverified_items:
  - truth: "ClaudeCodeRuntime.pauseTask/cancelTask reliably terminate a real, live Claude Code subprocess (not a mocked query() stream) via the graceful-interrupt-then-hard-abort path."
    test: "Run pauseTask and cancelTask against a real ClaudeCodeRuntime.startTask session (real `query()` call, real claude CLI subprocess) mid-stream, and confirm the subprocess actually stops within the grace period."
    expected: "pauseTask captures session_id and the task reaches status 'paused' with the subprocess no longer running/consuming CPU; cancelTask reaches status 'cancelled' and the subprocess process is confirmed terminated, not orphaned."
    why_human: "The 04-02 SUMMARY itself documents that the SDK's Query.interrupt() is only 'supported when streaming input/output is used' — this codebase's runQuery calls query() with a plain string prompt, not an AsyncIterable, so interrupt() is called best-effort and may no-op silently in production. The only proven termination guarantee (AbortController.abort() after a 5s grace period) has been exercised solely against a mocked query() generator (claude-code-runtime.test.ts's hangingQuery mock), never against a real spawned Claude Code subprocess. The 04-04 live demo exercised only startTask end-to-end (to a real 'completed' status); pauseTask/resumeTask/cancelTask were never run against that or any other real session. Whether AbortController.abort() actually kills the real subprocess (vs. leaving it running detached) cannot be confirmed by grep or unit tests with a mocked SDK — it requires an actual process-level observation."
coincidental_reliance_items: []
human_verification:
  - test: "Run pauseTask and cancelTask against a real (non-mocked) ClaudeCodeRuntime.startTask session mid-stream and confirm the underlying claude CLI subprocess actually terminates within the grace period, not just that the in-memory task record flips to 'paused'/'cancelled'."
    expected: "The real subprocess is confirmed stopped (e.g. via process list / no further tool-call activity) after cancelTask, and pauseTask followed by resumeTask genuinely continues the same session rather than starting an unrelated one."
    why_human: "Roadmap Success Criterion 2 explicitly says ClaudeCodeRuntime 'starts, pauses, resumes, and cancels a real Claude Code task.' Only startTask was demonstrated end-to-end against a real session (04-04-demo-evidence.md); pause/resume/cancel are implemented and unit-tested, but only against a mocked SDK. The SDK's own interrupt() is documented as streaming-input-only and may not apply to this codebase's plain-string-prompt call shape, so the fallback hard-abort path's real-world effectiveness is unconfirmed."
  - test: "Confirm the actual Claude subscription tier in use matches the phase goal's 'Claude MAX subscription' framing."
    expected: "`claude auth status` reports a MAX-tier subscription, or the project's phrasing is knowingly loosened to 'any Claude Code subscription auth, not API-key billing.'"
    why_human: "04-01-SUMMARY.md flags (non-blocking) that `claude auth status` reported `subscriptionType: 'pro'`, not `'max'`, during the live billing-posture check — the no-ANTHROPIC_API_KEY requirement (RUNTIME-02's literal text) was satisfied regardless, but the phase goal's specific 'Claude MAX subscription' wording is unconfirmed against the actual account tier. Only the account holder can confirm their subscription tier."
---

# Phase 04: AgentRuntime & ClaudeCodeRuntime Verification Report

**Phase Goal:** Agents can actually be driven through a runtime abstraction, with Claude Code as the first real implementation, running on Claude MAX subscription auth alone.
**Verified:** 2026-09-21T10:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AgentRuntime interface (8 methods) exists, callable independent of any specific coding-agent implementation (RUNTIME-01, Roadmap SC1) | ✓ VERIFIED | `packages/orchestration-adapter/src/types.ts` defines all 8 methods (startTask/pauseTask/resumeTask/cancelTask/getStatus/sendMessage/requestReview/requestHandoff); `grep -rEl "from ['\"]@anthropic-ai/" packages/orchestration-adapter/src` returns no matches (verified live); `pnpm --filter orchestration-adapter typecheck` passes clean (verified live) |
| 2 | ClaudeCodeRuntime.startTask drives one real `@anthropic-ai/claude-agent-sdk` `query()` call authenticated via Claude subscription auth, ANTHROPIC_API_KEY unset for the whole call (RUNTIME-02, Roadmap SC2) | ✓ VERIFIED | 04-04-demo-evidence.md: a real `/gsd-discuss-phase 1` task against the real SyncSmith repo reached `completed`, posting 4 schema-valid events; 04-01-SUMMARY.md Task 1: live `claude -p` call with ANTHROPIC_API_KEY confirmed unset, claude.ai usage dashboard (not platform.claude.com) moved |
| 3 | No hidden ANTHROPIC_API_KEY fallback — the subprocess env never inherits a stray key from the host process (RUNTIME-02 prohibition, post-code-review CR-01) | ✓ VERIFIED | Directly read `packages/claude-adapter/src/claude-code-runtime.ts` lines 124-139: `query()`'s `options.env` is explicitly set to `Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ANTHROPIC_API_KEY"))` — confirmed this landed in commit `b7f8e06`, not just claimed in REVIEW-FIX.md |
| 4 | pauseTask ends the in-flight turn gracefully (or aborts), captures session_id, sets status paused | ✓ VERIFIED | `claude-code-runtime.test.ts` Test 1 (pauseTask/resumeTask/sendMessage describe block) passes against real production code (mocked only at the SDK boundary); `pnpm --filter claude-adapter test` — 22 passed |
| 5 | resumeTask starts a new query() with `options.resume` set to the captured session_id, reusing the shared runQuery loop | ✓ VERIFIED | Test 2 in same file passes; `runQuery` is the single shared for-await loop (one definition, called from startTask/resumeTask/sendMessage — confirmed by direct read) |
| 6 | cancelTask attempts graceful stop first, hard-aborts via AbortController on grace-period timeout, status becomes cancelled either way | ✓ VERIFIED | Test 4 (cancelTask/watchdog integration block) passes; `attemptGracefulStop` shared helper confirmed in source |
| 7 | Watchdog resets on every message of any type, fires exactly once on genuine bounded silence, transitions to blocked | ✓ VERIFIED | `watchdog.test.ts` — 3 boundary-timing cases via vitest fake timers, all pass; wired into `runQuery` (confirmed by direct read: `.reset()` on every loop iteration, `.clear()` in `finally`) |
| 8 | requestReview fires (deny-only, never auto-approve) on canUseTool for AskUserQuestion / CEO-gated Bash, and on the Notification hook | ✓ VERIFIED | Unit tests (Test 4/5) pass; **and** live-demonstrated: 04-04-demo-evidence.md shows a genuine unscripted `AskUserQuestion` from the real Claude session firing `ceo.approval_requested` + `waiting_for_review`, not a scripted trigger |
| 9 | requestHandoff fires on a gsd-adapter role-change poll (reused observeGsdState, no second `.planning/` parser), observation-only (does not alter AgentTaskStatus) | ✓ VERIFIED | 4 Behavior cases pass in `claude-code-runtime.test.ts`; `grep -c "observeGsdState"` confirms direct reuse, no reimplementation found under `packages/claude-adapter/src` |
| 10 | `permissionMode: "bypassPermissions"` is never set anywhere in ClaudeCodeRuntime (would silently defeat CEO-gate detection) | ✓ VERIFIED | Directly read the file: `permissionMode: "default"` is the only occurrence; live grep for a bypass assignment returns 0 matches |
| 11 | pauseTask/cancelTask never silently corrupt an already-terminal task's status (post-code-review CR-02); runQuery has a reentrancy guard so resumeTask/sendMessage never orphan an in-flight invocation (CR-03) | ✓ VERIFIED | Directly read source: `TERMINAL_STATUSES` guard present in both `pauseTask`/`cancelTask` (lines 306, 331); `record.inFlight` stop-and-takeover logic present at top of `runQuery` (lines 108-118) — both landed in commit `b6a7089`. **Caveat:** no dedicated regression test exercises either guard directly (existing 22 tests pass, but none construct a "call cancelTask twice" or "call sendMessage while startTask is still running against real code, not a paused mock" scenario) — flagged as an anti-pattern finding below, not a blocker, since direct code inspection confirms correctness today |
| 12 | Every event ClaudeCodeRuntime posts (task.status_changed, ceo.approval_requested) parses against `CompanyEventSchema.safeParse`; the demo reaches a real terminal status; SyncSmith's repo is restored to its pre-demo state | ✓ VERIFIED | 04-04-demo-evidence.md: 4/4 events schema-valid, terminal status `completed`; human independently re-verified `git status --porcelain` empty, `git worktree list` shows only main, no `pixelfirm-demo-*` branches (04-04-SUMMARY.md Task 3 approval) |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified; one behavior-dependent claim — real-subprocess pause/cancel termination — is routed to Human Verification below rather than silently counted as fully proven)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/orchestration-adapter/src/types.ts` | AgentRuntime interface, 8 methods, zero SDK dependency | ✓ VERIFIED | Present, substantive, typechecks standalone |
| `packages/orchestration-adapter/src/index.ts` | Re-exports types | ✓ VERIFIED | Present, correct split-export shape |
| `packages/claude-adapter/src/claude-code-runtime.ts` | createClaudeCodeRuntime, complete 8-method AgentRuntime | ✓ VERIFIED | All 8 methods implemented, no "not implemented" stubs remain (grep for `not implemented` returns nothing) |
| `packages/claude-adapter/src/event-emitter.ts` | Local buildEnvelope/postEvent | ✓ VERIFIED | Present; postEvent now has a 10s AbortSignal.timeout (WR-02 fix confirmed landed) |
| `packages/claude-adapter/src/watchdog.ts` | createWatchdog factory | ✓ VERIFIED | Present, zero SDK dependency, wired into runQuery |
| `packages/claude-adapter/src/signal-detection.ts` | classifySignal pure classifier | ✓ VERIFIED | Present; WR-01 regex fix confirmed landed (`push.*(--force|-f\b)` scoping) |
| `packages/claude-adapter/src/claude-code-runtime.integration.test.ts` | Gated real integration test | ✓ VERIFIED | Present, `describe.skipIf` gate confirmed, drove the real demo per 04-04-demo-evidence.md |
| `.planning/phases/04-agentruntime-claudecoderuntime/04-04-demo-evidence.md` | Permanent real-run evidence | ✓ VERIFIED | Present, non-empty, 4 real events, terminal status `completed` |
| `.planning/phases/04-agentruntime-claudecoderuntime/COVERAGE.md` | API coverage decisions | ✓ VERIFIED | Present, every capability has an explicit INTEGRATE/OPT-OUT decision with a reason |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `claude-code-runtime.ts` | `orchestration-adapter/src/types.ts` | implements `AgentRuntime` | ✓ WIRED | `createClaudeCodeRuntime` return type is `AgentRuntime`; typecheck confirms structural conformance |
| `claude-code-runtime.ts` | `event-emitter.ts` → control plane `/events` | `buildEnvelope`/`postEvent` | ✓ WIRED | Confirmed both in source and live (demo evidence shows real POSTed events received by a real stub HTTP server) |
| `event-schema`'s `task.status_changed` | `company-core/src/reducer.ts` | reducer dispatch table | ✓ WIRED | `reducer.ts` line 202 handles `"task.status_changed"`, upserts `state.tasks[taskId].status`; `reducer.test.ts` — 21 passed |
| `claude-code-runtime.ts`'s `canUseTool`/`Notification` hooks | `signal-detection.ts`'s `classifySignal` | function call | ✓ WIRED | Confirmed in source; live-demonstrated in the real demo (AskUserQuestion → ceo.approval_requested) |
| `claude-code-runtime.ts`'s role poll | `gsd-adapter`'s `observeGsdState` | direct import | ✓ WIRED | `import { observeGsdState } from "gsd-adapter"` confirmed; no second `.planning/` parser found |

### Behavioral Spot-Checks / Test Execution

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| claude-adapter full unit suite | `pnpm --filter claude-adapter test` | 22 passed, 1 skipped (integration test, correctly gated by env var) | ✓ PASS |
| orchestration-adapter typecheck | `pnpm --filter orchestration-adapter typecheck` | clean, 0 errors | ✓ PASS |
| company-core reducer suite | `pnpm --filter company-core test` | 21 passed | ✓ PASS |
| RUNTIME-01 structural boundary | `grep -rEl "from ['\"]@anthropic-ai/" packages/orchestration-adapter/src` | no matches | ✓ PASS |
| RUNTIME-02 bypass prohibition | `grep -Ec 'permissionMode:\s*"bypass` on claude-code-runtime.ts | 0 matches (only `"default"` present) | ✓ PASS |
| claude-adapter typecheck | `pnpm --filter claude-adapter typecheck` | fails with 3 pre-existing `TS2835` errors in `event-schema/src/index.ts` (missing `.js` extensions) | ⚠️ PRE-EXISTING, NOT PHASE-CAUSED — confirmed `pnpm --filter worker typecheck` (an unmodified, unrelated consumer of the same file) fails identically, proving this predates and is untouched by Phase 4 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| RUNTIME-01 | 04-01, 04-04 | AgentRuntime interface exists independent of coding-agent implementation | ✓ SATISFIED | Truths 1, 11 above; REQUIREMENTS.md already marks Complete — confirmed accurate |
| RUNTIME-02 | 04-01, 04-02, 04-03, 04-04 | ClaudeCodeRuntime implements AgentRuntime via Claude Agent SDK, Claude MAX subscription auth, no ANTHROPIC_API_KEY | ✓ SATISFIED (with human-verification caveat on pause/cancel against a real subprocess, and subscription-tier wording) | Truths 2-10, 12 above; REQUIREMENTS.md already marks Complete — substantively accurate, with the caveats noted in Human Verification |

No orphaned requirements: REQUIREMENTS.md's traceability table maps only RUNTIME-01 and RUNTIME-02 to Phase 4, and both appear in at least one plan's `requirements` frontmatter field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/claude-adapter/src/claude-code-runtime.ts` | 108-118, 306, 331 | CR-02/CR-03 code-review fixes landed correctly but have **no dedicated regression test** exercising them (no test calls cancelTask twice, or sendMessage while a real prior invocation is genuinely still in flight against unmocked production code) | ⚠️ Warning | Correctness confirmed today via direct code read; a future refactor could silently reintroduce either bug with the existing 22-test suite staying green |
| `packages/claude-adapter/src/claude-code-runtime.ts` | 131-139 | CR-01's ANTHROPIC_API_KEY-stripping fix has no dedicated regression test (no test asserts `query()`'s `options.env` excludes the key) | ⚠️ Warning | Same as above — this is the single most safety-critical fix in the phase (direct RUNTIME-02 prohibition) and is unguarded by an automated test |
| `packages/claude-adapter/src/signal-detection.ts` | 25 | WR-01's regex fix has no dedicated regression test for the specific false-positive it fixed (`curl -fsSL`, `rm -f`, `docker build -f Dockerfile.prod`) | ℹ️ Info | `signal-detection.test.ts` still only asserts `"npm test"` is null (unaffected by the bug either way) |
| n/a | n/a | No unresolved `TBD`/`FIXME`/`XXX` debt markers in any phase-4-authored source file (the two `TBD` matches found are quoted SyncSmith roadmap text inside a comment/evidence-file description, not this codebase's own debt) | ℹ️ Info | Not a gap |

### Human Verification Required

1. **Real (non-mocked) pauseTask/cancelTask termination proof**
   **Test:** Start a real ClaudeCodeRuntime task, call pauseTask mid-stream and confirm the underlying claude CLI subprocess actually pauses/exits; separately, start another real task and call cancelTask, confirming the subprocess is genuinely terminated (not orphaned) within the grace period.
   **Expected:** Status transitions correctly to paused/cancelled AND the real OS-level subprocess is confirmed stopped, not just the in-memory record.
   **Why human:** Only startTask was proven end-to-end against a real session (04-04's demo). pauseTask/resumeTask/cancelTask are implemented and pass unit tests, but those tests mock the SDK's `query()` call — they never exercise a real Claude Code subprocess. 04-02-SUMMARY.md's own Key Decisions section flags that the SDK's `interrupt()` is documented as streaming-input-only and "not guaranteed to have any effect" for this codebase's plain-string-prompt call shape, meaning the fallback hard-abort path (`AbortController.abort()`) is the only real guarantee — and that path has never been exercised against a real subprocess, only a mock. Roadmap Success Criterion 2 explicitly names "pauses, resumes, and cancels a real Claude Code task," which this gap does not yet fully satisfy.

2. **Claude MAX subscription tier confirmation**
   **Test:** Run `claude auth status` and report the `subscriptionType` field.
   **Expected:** `"max"`, matching the phase goal's literal "Claude MAX subscription auth alone" wording.
   **Why human:** 04-01-SUMMARY.md's own Issues Encountered section flags that the live check during Task 1 reported `subscriptionType: "pro"`, not `"max"` — non-blocking for the technical RUNTIME-02 requirement (no ANTHROPIC_API_KEY, subscription-pool billing confirmed either way), but the phase goal text specifically says "Claude MAX subscription" and this hasn't been independently reconfirmed since.

### Gaps Summary

No FAILED must-haves. All artifacts exist, are substantive, and are wired; all 22+21 automated tests pass; all 5 code-review findings (3 critical, 2 warning) were independently re-verified as actually landed in the current source, not just claimed in REVIEW-FIX.md. The phase is functionally complete and well-tested at the unit level, with one genuinely real end-to-end demo (startTask + live requestReview signal) proving the core "no ANTHROPIC_API_KEY, real Claude Code session" claim.

The reason this report is `human_needed` rather than `passed`: Roadmap Success Criterion 2 explicitly requires that ClaudeCodeRuntime "starts, pauses, resumes, and cancels a real Claude Code task" — and while startTask has that live proof, pauseTask/resumeTask/cancelTask's actual termination behavior against a real (non-mocked) Claude Code subprocess has never been observed, only unit-tested against a mocked SDK boundary. Given the SDK's own documented caveat that the graceful-interrupt mechanism may not apply to this codebase's call shape, this is a legitimate, not cosmetic, verification gap — it is presented here for a human decision rather than either silently passed or hard-failed.

---

_Verified: 2026-09-21T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
