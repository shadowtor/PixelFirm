---
phase: "01"
slug: "event-schema-state-engine"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 01-01-TBD | 01 | 1 | EVENT-01 | V5 Input Validation | Valid event of each of the 12 seeded types passes `.safeParse()`; malformed event (missing field, wrong discriminator literal) fails | unit | `pnpm --filter event-schema test -- envelope.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-TBD | 01 | 1 | EVENT-03 | — | Feeding the 12-event fixture sequence into `fold()` produces the expected `ProjectionState` (one entry per touched agent/floor/team/project/task) | unit | `pnpm --filter company-core test -- reducer.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-TBD | 01 | 1 | EVENT-04 | — | `fold(events)` called twice on the identical fixture array produces `toEqual` results (replay determinism) | unit | `pnpm --filter company-core test -- reducer.test.ts` | ❌ W0 (same file as EVENT-03) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/event-schema/src/envelope.test.ts` — stubs for EVENT-01
- [ ] `packages/company-core/src/reducer.test.ts` — stubs for EVENT-03 and EVENT-04
- [ ] `packages/company-core/src/fixtures/stub-events.ts` — shared 12-event fixture array reused by both tests
- [ ] Framework install: `pnpm add -w -D vitest@^5.0 typescript@^5.7 turbo@^2.10`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
