---
phase: "04"
slug: "agentruntime-claudecoderuntime"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-21"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| worker process ↔ real Claude Code session (`query()`) | Untrusted model/tool output stream crosses into ClaudeCodeRuntime's message-handling loop | Tool-call names/inputs, session messages |
| npm registry ↔ this monorepo | New supply-chain dependency (`@anthropic-ai/claude-agent-sdk`) added for the first time this phase | Package code |
| ClaudeCodeRuntime ↔ `~/.claude/` OAuth credential store | ClaudeCodeRuntime must never read/log/forward this credential — it is the SDK's own concern | None (by design) |
| worker-internal call ↔ pause/resume/cancel/sendMessage | Already-authenticated worker-internal calls, no new external listener | Task control signals |
| Claude Code's own tool-call stream ↔ canUseTool's classification logic | Tool name/input from the model's own output, treated as data to classify, never a command to execute directly | Tool name, tool input |
| This demo's disposable worktree ↔ SyncSmith's real main worktree/branch | The one hard isolation boundary Plan 04-04 exists to prove is never crossed | Git refs, filesystem paths |
| Real Claude Code session (inside the disposable worktree) ↔ the rest of the filesystem | Runs with `permissionMode: "default"` and this machine's existing Claude Code trust level, not a new sandbox | Filesystem reads/writes |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-SC | Tampering | `pnpm add @anthropic-ai/claude-agent-sdk` install | high | mitigate | Package-legitimacy `gate="blocking-human"` checkpoint (04-01 Task 2) before install ran | closed |
| T-04-01 | Tampering | `packages/claude-adapter/src/event-emitter.ts`'s postEvent path | medium | mitigate | Reuses `CompanyEventSchema`, plain `z.object()` payloads, never `z.looseObject()` — no new validation surface | closed |
| T-04-02 | Information Disclosure | ClaudeCodeRuntime's `query()` invocation | high | mitigate | Verified live: `claude-code-runtime.ts` never reads/logs/transmits the `~/.claude/` OAuth store (grep confirms zero references outside a doc comment); `env` is explicitly built to strip `ANTHROPIC_API_KEY` from the subprocess env (CR-01 code-review fix, commit `b7f8e06`) so no credential of any kind leaks beyond the SDK's own resolution | closed |
| T-04-03 | Denial of Service | ClaudeCodeRuntime's `getStatus` on an unknown taskId | low | accept | Throws rather than fabricating a status (verified in source, line 258) | closed |
| T-04-04 | Denial of Service | watchdog false-negative/false-positive | medium | mitigate | `DEFAULT_WATCHDOG_TIMEOUT_MS` within researched 90-120s range; boundary behavior explicitly tested (`watchdog.test.ts`, vitest fake timers at timeoutMs-1/timeoutMs/timeoutMs+1), all passing | closed |
| T-04-05 | Denial of Service | cancelTask's hard-kill path leaving an orphaned subprocess | medium | mitigate | `AbortController.abort()` guaranteed after the grace-period race; verified BOTH by unit test (mocked) AND by a real, non-mocked integration test added and run today — `claude-code-runtime.integration.test.ts`'s new pauseTask/cancelTask cases snapshot real `claude.exe` OS PIDs and confirm the actual spawned subprocess terminates, not just the in-memory status (commit `6f7b683`) | closed |
| T-04-06 | Repudiation | pause/resume/cancel state transitions | low | accept | Every transition posts a `task.status_changed` event through the existing validated ingestion path | closed |
| T-04-07 | Elevation of Privilege | `permissionMode` accidentally set to the SDK's full-bypass mode | high | mitigate | Verified live: `grep -n "permissionMode" claude-code-runtime.ts` shows only `permissionMode: "default"`, zero `bypassPermissions` matches anywhere in the file; `canUseTool` always returns `deny` for a classified signal, never `allow` | closed |
| T-04-08 | Elevation of Privilege | `classifySignal`'s Bash regex allowlist missing a genuinely destructive command pattern | medium | accept | Documented first-pass heuristic (not claimed-exhaustive); watchdog remains the last line of defense; a miss here can only fail to escalate, never auto-approve — same permission mode any local `claude` CLI session already has. (WR-01's code-review fix addressed the regex's opposite failure mode — over-matching plain `-f` flags — this accepted risk about under-matching is unaffected and unchanged) | closed |
| T-04-09 | Tampering | `requestHandoff`'s `toAgentId` sourced from `gsd-adapter`'s role mapping | low | accept | Local, trusted `.planning/` file state on the worker's own machine — same trust level every existing `gsd-adapter` consumer already assumes | closed |
| T-04-10 | Destruction/Tampering | Disposable worktree/demo accidentally mutating or merging into SyncSmith's main branch/worktree | critical | mitigate | `git worktree add` targets a brand-new mkdtemp'd path, never SyncSmith's own directory; independently re-verified THREE times now (04-04's original human-approved demo, plus two additional live runs today for the pause/cancel tests) — `git status --porcelain` empty, `git worktree list` shows only main, no `pixelfirm-demo-*` branches, every single time | closed |
| T-04-11 | Repudiation | A failed or ambiguous demo run being silently discarded without evidence | high | mitigate | Evidence write happens in `afterAll`/`finally`, unconditionally, before cleanup — verified: `04-04-demo-evidence.md` exists with real event data from a live run | closed |
| T-04-12 | Elevation of Privilege | The real Claude Code session inside the demo worktree accessing files outside the worktree via absolute paths | medium | accept | Same trust level Claude Code already has on this machine outside this project; explicitly out of this phase's scope to sandbox further (matches CONTEXT.md's personal-use framing) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-03 | Fail-loud on unknown taskId is the correct behavior, not a gap — Core Value "never invent state" | Plan 04-01 author | 2026-09-20 |
| AR-04-02 | T-04-06 | Existing validated event-ingestion path is sufficient audit trail at this scale; a separate audit mechanism is unwarranted complexity | Plan 04-02 author | 2026-09-20 |
| AR-04-03 | T-04-08 | First-pass heuristic Bash allowlist is documented as non-exhaustive by design; watchdog is the backstop, and a miss can only fail to escalate, never auto-approve | Plan 04-03 author | 2026-09-20 |
| AR-04-04 | T-04-09 | Local trusted `.planning/` file state, same trust level every existing gsd-adapter consumer assumes | Plan 04-03 author | 2026-09-20 |
| AR-04-05 | T-04-12 | Personal-use framing (CONTEXT.md Assumption A3) — sandboxing beyond Claude Code's own existing trust level is explicitly out of scope for this phase | Plan 04-04 author | 2026-09-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-21 | 13 | 13 | 0 | Claude (gsd-secure-phase orchestrator, L1 grep-depth verification — all 4 plans authored `<threat_model>` at plan time, so the L1 short-circuit rule applies; every mitigation independently re-verified against current source, not merely trusted from plan-time claims) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-21
