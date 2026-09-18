---
phase: "01"
slug: "event-schema-state-engine"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-18"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^5.0` (verified `5.0.1` on npm) — none installed yet, this phase installs it |
| **Config file** | none yet — Wave 0 creates `vitest.config.ts` (or relies on Vitest's zero-config default) |
| **Quick run command** | `pnpm --filter event-schema test` / `pnpm --filter company-core test` |
| **Full suite command** | `pnpm turbo run test` |
| **Estimated runtime** | ~5 seconds (unit tests, no I/O) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <package> test`
- **After every plan wave:** Run `pnpm turbo run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T3 / 01-02-T1 | 01/02 | 1/2 | EVENT-01 | V5 Input Validation | All 12 seeded event types pass `.safeParse()` when valid, fail when malformed (missing field or wrong discriminator literal) — 25 assertions in envelope.test.ts | unit | `pnpm --filter event-schema test -- envelope.test.ts` | ✅ | ✅ green |
| 01-01-T3 / 01-02-T2 | 01/02 | 1/2 | EVENT-03 | — | Folding the full 12-event fixture into `fold()` produces a fully-populated `ProjectionState` (agents/floors/teams/projects/tasks) | unit | `pnpm --filter company-core test -- reducer.test.ts` | ✅ | ✅ green |
| 01-01-T3 / 01-02-T2 | 01/02 | 1/2 | EVENT-04 | — | `fold(events)` called twice on the identical 12-event fixture array from a fresh state produces `toEqual` results (replay determinism at catalog scale), no memoization | unit | `pnpm --filter company-core test -- reducer.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/event-schema/src/envelope.test.ts` — 25 tests (12 valid + 12 malformed + Plan 01's original 3 minus overlap)
- [x] `packages/company-core/src/reducer.test.ts` — 7 tests (empty/single/unknown-type/full-fixture-projection/replay-determinism)
- [x] `packages/company-core/src/fixtures/stub-events.ts` — shared 12-event causally-ordered fixture, reused by both tests
- [x] Framework install: `pnpm@12.4.2` (via `npm install -g pnpm` fallback, corepack unavailable), `vitest@5.0.1`, `typescript@^5.7`, `turbo@2.10.13`, `zod@4.6.5`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`test` script is `vitest run`, never bare `vitest`)
- [x] Feedback latency < 10s (~2s full-suite via Turborepo)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-09-18 — all three requirements (EVENT-01, EVENT-03, EVENT-04) COVERED by green, non-flaky unit tests. No gaps found; no auditor dispatch needed.

## Validation Audit 2026-09-18

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Note (out of scope for this audit, tracked separately): 01-REVIEW.md flagged a Critical correctness issue (CR-01) in `reducer.ts`'s handling of optional envelope-level correlation ids — unsafe non-null assertions instead of guards. This is a code-quality/robustness finding, not a Nyquist coverage gap: the requirement behaviors (EVENT-01/03/04) are still correctly tested and green against the fixture as specified. Not remediated here; see REVIEW.md for the fix.
