---
phase: "6"
slug: "ceo-dashboard-approval-workflow"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-24"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.1 (per package), Playwright 1.63.0 (root `e2e/`) |
| **Config file** | none per package (vitest defaults); `playwright.config.ts` |
| **Quick run command** | `npx pnpm@12.4.2 --filter <pkg> test -- <file-or-name>` |
| **Full suite command** | `npx pnpm@12.4.2 --filter api db:test:up && npx pnpm@12.4.2 -r test` |
| **Estimated runtime** | ~90 seconds (full), < 30 s per package quick run |

---

## Sampling Rate

- **After every task commit:** Run the package quick run for the files touched
- **After every plan wave:** Run `npx pnpm@12.4.2 -r test` + `pnpm --filter web build` + office-bundle check
- **Before `/gsd-verify-work`:** Full suite green, Playwright `/ceo` spec green, live-proof evidence captured
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| CEO-01 | Layout guard: ceoQueue slots valid, reachable, existing coords kept | unit | `pnpm --filter pixel-office test -- officeLayout` | ❌ W0 | ⬜ pending |
| CEO-01 | waiting_for_ceo → walks to CEO slot; leaves after decision/expiry | unit | `pnpm --filter pixel-office test -- ceo-queue` | ❌ W0 | ⬜ pending |
| CEO-02 | Enriched request payload parses; Phase 4 rows still parse | unit | `pnpm --filter event-schema test -- payloads` | ✅ extend | ⬜ pending |
| CEO-02 | readDiff caps/truncation; `--no-ext-diff --no-textconv` | unit | `pnpm --filter git-adapter test -- diff` | ❌ W0 | ⬜ pending |
| CEO-02 | foldDecisions pending/history/expired/decided | unit | `pnpm --filter company-core test -- decisions` | ❌ W0 | ⬜ pending |
| CEO-02 | `/ceo` renders queue/detail/diff/links | e2e | `npx playwright test e2e/ceo-dashboard.spec.ts` | ❌ W0 | ⬜ pending |
| CEO-02 | Office bundle has no ceo chunk / Tailwind preflight | build | `pnpm --filter web build` + bundle check | ❌ W0 | ⬜ pending |
| CEO-03 | Decision → PermissionResult mapping | unit | `pnpm --filter claude-adapter test -- decision-mapping` | ❌ W0 | ⬜ pending |
| CEO-03 | Parked canUseTool resolves; watchdog suspended; superseded → deny | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ extend | ⬜ pending |
| CEO-03 | Decision POST → downlink to worker; 503 offline; 409 repeat | integration | `pnpm --filter api test -- ceo-decisions` | ❌ W0 | ⬜ pending |
| CEO-03 | Worker downlink resolves pending; bootId; resume validates worktree | unit | `pnpm --filter worker test -- decisions` | ❌ W0 | ⬜ pending |
| CEO-04 | PreToolUse hook returns `ask` for classified calls | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ extend | ⬜ pending |
| CEO-04 | Worker cred cannot decide (403); browser token cannot decide (401); JWT/CSRF checks | integration | `pnpm --filter api test -- ceo-auth` | ❌ W0 | ⬜ pending |
| CEO-03/04 | Real session: gated probe parks; approve runs, reject doesn't; allow rule doesn't bypass | live | `node scripts/verify-ceo-approval-live.mjs` | ❌ W0 | ⬜ pending |
| CEO-05 | requested→decision_made→decision_applied audit chain; expiry; unique index | integration | `pnpm --filter api test -- ceo-decisions` | ❌ W0 | ⬜ pending |
| privacy | PRIVATE ceo.* never reaches `/ws/browser`; fold state holds no private strings | integration + unit | `pnpm --filter api test -- ws-browser` ; `pnpm --filter company-core test -- reducer` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/company-core/src/decisions.test.ts`
- [ ] `packages/claude-adapter/src/decision-mapping.test.ts`
- [ ] `packages/git-adapter/src/diff.test.ts`
- [ ] `packages/pixel-office/src/ceo/ceo-queue.test.ts` + layout guard cases
- [ ] `apps/api/src/routes/ceo-decisions.test.ts`, `apps/api/src/auth/ceo-auth.test.ts`
- [ ] `apps/worker/src/decisions.test.ts`
- [ ] `e2e/ceo-dashboard.spec.ts` + local Playwright project
- [ ] `scripts/verify-ceo-approval-live.mjs`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloudflare Access gates `/ceo*` on staging | CEO-04 | Third-party SSO login flow | Visit `test.pixelfirm.dev/ceo` signed out → Access login; `/events` and `/ws` still reachable by worker |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
