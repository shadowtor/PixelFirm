---
phase: "3"
slug: "worker-git-adapter-gsd-adapter"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-19"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.0.1 |
| **Config file** | none — each package (`worker`, `git-adapter`, `gsd-adapter`) runs `vitest run` with defaults, matching `event-schema`/`company-core`'s existing convention |
| **Quick run command** | `pnpm --filter worker test` / `pnpm --filter git-adapter test` / `pnpm --filter gsd-adapter test` |
| **Full suite command** | `pnpm test` (Turborepo `test` task, `dependsOn: ["^test"]`) |
| **Estimated runtime** | N/A — new packages, no baseline yet (Wave 0 creates the first tests) |

---

## Sampling Rate

- **After every task commit:** Run the touched package's quick run command above
- **After every plan wave:** Run `pnpm test` (full Turborepo suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (small, new packages)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (planner assigns) | TBD | TBD | RUNTIME-03 | — | worker validates `--repo`/`WORKER_REPO_PATH` as a real git worktree before connecting, outbound-only | integration | `pnpm --filter worker test -- ws-client` | ❌ W0 | ⬜ pending |
| TBD (planner assigns) | TBD | TBD | RUNTIME-04 | — | online/stale/offline derived from server-receipt heartbeat timing + socket open state | integration | `pnpm --filter api test -- connection-status` | ❌ W0 | ⬜ pending |
| TBD (planner assigns) | TBD | TBD | WORKTREE-01 | — | N/A | unit | `pnpm --filter git-adapter test -- worktree` | ❌ W0 | ⬜ pending |
| TBD (planner assigns) | TBD | TBD | WORKTREE-02 | — | git-adapter source contains no `git merge`/`git rebase` invocation | static/negative | source-scan assertion (no `execa("git", ["merge"`/`"rebase"`, ...])` call site in git-adapter) | ❌ W0 | ⬜ pending |
| TBD (planner assigns) | TBD | TBD | GSD-01 | — | STATE.md status + phase-directory file-presence maps to the correct GSD-01 category, preferring observed over guessed state | unit | `pnpm --filter gsd-adapter test -- state-md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Threat Ref left as "—": the phase's `<threat_model>` block (security capability, ASVS L1) is authored by the planner in step 8 — populate this column once PLAN.md's threat IDs exist.*

---

## Wave 0 Requirements

- [ ] `apps/worker/src/*.test.ts` — new package, add `"test": "vitest run"` script matching `event-schema`/`company-core`'s convention
- [ ] `packages/git-adapter/src/*.test.ts` — new package; needs a temp-git-repo fixture helper (`execa("git", ["init"], { cwd: tmpDir })` under `os.tmpdir()`) to test worktree/commit parsing without depending on the real PixelFirm/SyncSmith repos
- [ ] `packages/gsd-adapter/src/*.test.ts` — new package; needs fixture `.planning/` directories, including the "no `current_phase` key" SyncSmith shape (Pitfall 3)
- [ ] `apps/api/src/routes/ws.test.ts` (or extension of `ws-auth.test.ts`) — new heartbeat/connection-status coverage for the currently-empty `ws.ts` handler

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live demo against SyncSmith showing a real observed GSD state transition | RUNTIME-03, GSD-01 | SyncSmith has zero executed phases right now (verified in research) — proving "observes real state" requires pointing the worker at a live sibling repo and watching it react to an actual filesystem change, not just fixture data | Point the worker at `F:/Sidegigs/syncsmith` via `--repo`; trigger a real `.planning/` change in that repo (e.g. run `/gsd-plan-phase` there far enough to create a phase dir); confirm the corresponding `CompanyEvent`(s) appear in PixelFirm's event log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
