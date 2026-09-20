---
phase: "04"
slug: "agentruntime-claudecoderuntime"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-20"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.x |
| **Config file** | per-package (no root vitest.config; each package's `test` script invokes `vitest run`) |
| **Quick run command** | `pnpm --filter claude-adapter test` |
| **Full suite command** | `pnpm --filter claude-adapter test && pnpm --filter orchestration-adapter typecheck && pnpm --filter company-core test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter claude-adapter test`
- **After every plan wave:** Run the full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | RUNTIME-02 | T-04-SC / — | N/A — checkpoint, no code | manual | — | ❌ (no code task) | ✅ resolved (subscription pool confirmed) |
| 04-01-02 | 01 | 1 | RUNTIME-02 | T-04-SC | N/A — checkpoint, no code | manual | — | ❌ (no code task) | ✅ resolved (npm package approved) |
| 04-01-03 | 01 | 1 | RUNTIME-01 / RUNTIME-02 | T-04-01 / T-04-02 / T-04-03 | Zero `@anthropic-ai/` import in orchestration-adapter; no API-key fallback | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` / `pnpm --filter orchestration-adapter typecheck` / `pnpm --filter company-core test -- reducer` | ✅ | ✅ green |
| 04-02-01 | 02 | 2 | RUNTIME-02 | — | pauseTask/resumeTask/sendMessage share one runQuery helper, no duplicated stream loop | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ | ✅ green |
| 04-02-02 | 02 | 2 | RUNTIME-02 | T-04-04 | cancelTask graceful-then-hard-kill; watchdog fires exactly once on bounded silence | unit | `pnpm --filter claude-adapter test -- watchdog` | ✅ | ✅ green |
| 04-03-01 | 03 | 3 | RUNTIME-02 | T-04-07 | canUseTool deny-only (never auto-approve) on classified signals | unit | `pnpm --filter claude-adapter test -- signal-detection` | ✅ | ✅ green |
| 04-03-02 | 03 | 3 | RUNTIME-02 | — | requestHandoff reuses gsd-adapter's observeGsdState, no second `.planning/` parser | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ | ✅ green |
| 04-04-01 | 04 | 4 | RUNTIME-01 / RUNTIME-02 | — | Gated integration test skipped by default; disposable worktree verified isolated | unit + static | `pnpm --filter claude-adapter typecheck` / `grep -c isGitWorktree ...integration.test.ts` | ✅ | ✅ green |
| 04-04-02 | 04 | 4 | RUNTIME-01 / RUNTIME-02 | T-04-10 / T-04-11 | Real task reaches terminal status; every posted event schema-valid; evidence written before cleanup; SyncSmith main untouched | integration (env-gated) | `CLAUDE_CODE_INTEGRATION_TEST=1 pnpm --filter claude-adapter run test:integration` | ✅ | ✅ green (live run, see 04-04-demo-evidence.md) |
| 04-04-03 | 04 | 4 | RUNTIME-01 / RUNTIME-02 | T-04-10 | N/A — checkpoint, no code | manual | — | ❌ (no code task) | ✅ resolved (human approved; independently re-verified) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*None — existing vitest infrastructure (already present from earlier phases) covers all Phase 04 requirements. No new framework install or shared-fixture scaffolding was needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude MAX/Pro subscription billing posture (not API-credit pool) | RUNTIME-02 | Requires visually comparing two authenticated web dashboards (claude.ai, platform.claude.com) — not scriptable from this environment | Run a `claude -p` probe with `ANTHROPIC_API_KEY` unset, then compare each dashboard's usage counter before/after; confirm claude.ai's counter moved |
| `@anthropic-ai/claude-agent-sdk` npm package legitimacy | RUNTIME-02 | 04-RESEARCH.md flagged the package as a heuristic false-positive; policy requires human eyes-on confirmation of publisher org/downloads before install, not just an automated `npm view` | Visit npmjs.com/package/@anthropic-ai/claude-agent-sdk, confirm publisher is the `anthropics` org and weekly downloads are in the millions |
| Disposable-worktree demo evidence + SyncSmith restored-clean state | RUNTIME-01 / RUNTIME-02 | Final confirmation that a real, unscripted live run against a sibling repository left no residue — an independent human check on top of the automated cleanup assertions | Read 04-04-demo-evidence.md for plausibility; run `git status --porcelain`, `git worktree list`, `git branch --list "pixelfirm-demo-*"` against F:/Sidegigs/syncsmith and confirm all three show a clean, unmodified state |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicitly manual-only checkpoints
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only isolated single checkpoint tasks are manual, always adjacent to an automated task)
- [x] Wave 0 covers all MISSING references (none were missing)
- [x] No watch-mode flags (`vitest run`, never `vitest --watch`)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-21

## Validation Audit 2026-09-21

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Every code task (`type="auto"`/`type="tracer"`) across all 4 plans carries at least one `<verify><automated>` command, all confirmed green in each plan's SUMMARY.md. Every `type="checkpoint:human-verify"` task is appropriately manual (billing-posture dashboard comparison, npm package legitimacy, and final demo/cleanup confirmation — none of these are scriptable from this environment). RUNTIME-01 and RUNTIME-02 are both demonstrated by automated unit/typecheck coverage AND a real, non-mocked integration run (04-04) — no reconstruction or auditor dispatch was needed.
