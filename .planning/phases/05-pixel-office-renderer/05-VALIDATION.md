---
phase: "05"
slug: "pixel-office-renderer"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-21"
validated: "2026-09-23"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.1 per package (pnpm workspaces + turbo); Playwright for e2e; Docker-backed live harness |
| **Config file** | none for vitest (defaults); `turbo.json`, `apps/api/docker-compose.test.yml` (Postgres :5434), `playwright.config.ts` (e2e/) |
| **Quick run command** | `pnpm --filter pixel-office test` (~6s); single file: `pnpm --filter <pkg> test -- <stem>` |
| **Full suite command** | `pnpm -r test` (api needs `pnpm --filter api db:test:up` first) |
| **Live proof** | `node scripts/verify-pixel-office-live.mjs` — resets the Docker test DB; manual, outside `pnpm test` |
| **Estimated runtime** | full suite ~20s wall clock; e2e disconnect spec ~4s |

Suite at validation (2026-09-23): 451 passed, 3 skipped (opt-in claude-adapter integration), 0 failed; `e2e/office-disconnect.spec.ts` 1 passed; all package typechecks green.

---

## Sampling Rate

- **After every task commit:** `pnpm --filter <touched pkg> test`
- **After every plan wave:** `pnpm -r test`
- **Before `/gsd-verify-work`:** full suite green + live harness pass
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

Test types: unit = vitest; integ = vitest + Fastify inject against Postgres :5434; live = `scripts/verify-pixel-office-live.mjs`; e2e = Playwright; doc = grep on planning/licence docs. "✅ (live)" = harness passed in the 2026-09-23 verifier run.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | OFFICE-01 | T-05-SC | npm packages vetted before install | manual checkpoint | — | n/a | ✅ (human gate) |
| 05-01-02 | 01 | 1 | OFFICE-01 | T-05-01, 02, 05 | timing-safe token, uniform 401; client safeParse on every relayed event | unit + integ | `pnpm --filter api test -- browser-auth ws-browser` · `pnpm --filter web test -- ws-client` | ✅ | ✅ |
| 05-01-02 | 01 | 1 | OFFICE-01 | T-05-04 | 21st `/ws/browser` upgrade in a minute → 429 (before auth) | integ | `pnpm --filter api test -- ws-browser` | ✅ | ✅ (added 2026-09-23) |
| 05-02-01 | 02 | 2 | OFFICE-01, OFFICE-03 | T-05-06 | all 15 AgentStatus values mapped; stuck states frozen with distinct bubbles | unit | `pnpm --filter pixel-office test -- status-mapping` | ✅ | ✅ |
| 05-02-02 | 02 | 2 | OFFICE-02 | — | licence audit + in-app attribution | doc + unit | grep ASSET-LICENSES.md · `pnpm --filter web test -- App` | ✅ | ✅ |
| 05-03-01..02 | 03 | 2 | OFFICE-01, HANDOFF-01 | T-05-07, 08 | handoff_completed schema; per-agent status derivation, no fabricated OFFLINE/READING | unit | `pnpm --filter event-schema test` · `pnpm --filter company-core test` · `pnpm --filter claude-adapter test` | ✅ | ✅ |
| 05-04-01..02 | 04 | 3 | HANDOFF-01, HANDOFF-02 | T-05-09, 10 | FSM driven only by real event pairs; template-only dialogue, zero network/LLM | unit | `pnpm --filter pixel-office test -- handoff-choreography dialogue-templates` | ✅ | ✅ |
| 05-05-01..03 | 05 | 1 | OFFICE-01, HANDOFF-01/02 | T-05-18..21 | worker event allow-list; snapshot before register; no undefined-keyed agent | integ + unit + doc | `pnpm --filter api test -- events ws-browser` · `pnpm --filter web test -- agent-event-mapper` | ✅ | ✅ |
| 05-06-01..02 | 06 | 1 | OFFICE-01, OFFICE-02 | T-05-SC, 22, 23 | pngjs vetted; real MetroCity sprites, frame count validated | manual + unit | `pnpm --filter pixel-office test -- spriteData` | ✅ | ✅ |
| 05-07-01..02 | 07 | 1 | OFFICE-03, HANDOFF-01 | T-05-24, 25 | exhaustive bubble resolver; overlay over owner sprite | unit | `pnpm --filter pixel-office test -- bubbleSprites renderer` | ✅ | ✅ |
| 05-08-01 | 08 | 2 | OFFICE-01/03, HANDOFF-01 | T-05-26 | real pixels on a real canvas | live | `node scripts/verify-pixel-office-live.mjs` | ✅ | ✅ (live) |
| 05-09-01..03 | 09 | 6 | OFFICE-01/02, HANDOFF-01 | T-05-09-01..04 | live event repaints without reload; handoff participants from live events | unit | `pnpm --filter web test` · `pnpm --filter pixel-office test` | ✅ | ✅ |
| 05-10-01..02 | 10 | 6 | OFFICE-01, OFFICE-03 | T-05-10-01..04 | glyph bound to owner; deterministic identity hue | unit | `pnpm --filter pixel-office test` | ✅ | ✅ |
| 05-11-00..03 | 11 | 6 | HANDOFF-01/02, OFFICE-01 | T-05-11-01..05, WR01 | no fake handoff from role observation; snapshot-window buffering; deferrals recorded | manual + unit + integ + doc | `pnpm --filter claude-adapter test` · `pnpm --filter api test` | ✅ | ✅ |
| 05-12-01..03 | 12 | 7 | OFFICE-01/02/03 | T-05-12-01..04 | no-reload live proof; owner-bound glyph; no destructive SQL; licence evidence | live + doc + unit | harness · `node --check scripts/verify-pixel-office-live.mjs` · `pnpm --filter web test` | ✅ | ✅ (live) |
| 05-13-01..03 | 13 | 8 | HANDOFF-01/02, OFFICE-03 | T-05-13-01..07 | capped owner-bound dialogue; glyphs on top; idempotent re-delivery | unit | `pnpm --filter pixel-office test` · `pnpm --filter web test` | ✅ | ✅ |
| 05-14-01..03 | 14 | 8 | OFFICE-01, HANDOFF-01 | T-05-14-01..04 | desk/hue reclaimed on despawn; ceilings recorded | unit + doc | `pnpm --filter pixel-office test -- index` | ✅ | ✅ |
| 05-15-01..02 | 15 | 8 | OFFICE-01 | T-05-15-01..04 | ≤1 live `query()` per task; superseded invocation cannot act | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ | ✅ |
| 05-16-01..02 | 16 | 9 | HANDOFF-01/02 | T-05-16-01..04 | harness refuses foreign servers; dialogue painted (TRUTH 5) | live + doc | harness | ✅ | ✅ (live) |
| 05-17-01..03 | 17 | 10 | HANDOFF-01, OFFICE-03 | T-05-17-01..04 | status never stops a walk; every ending retires the record | unit + live | `pnpm --filter pixel-office test` · harness | ✅ | ✅ |
| 05-18-01..02 | 18 | 10 | OFFICE-01 | T-05-18-01..04 | overlapping sendMessage → one query; pause/cancel wins | unit + typecheck | `pnpm --filter claude-adapter test -- claude-code-runtime` · `pnpm --filter claude-adapter typecheck` | ✅ | ✅ (typecheck fixed 2026-09-23) |
| 05-19..20 | 19-20 | 11-12 | OFFICE-01/03, HANDOFF-01 | T-05-19-01..05, T-05-20-01..04 | one pose writer; sender identity held; status glyph survives handoff | unit | `pnpm --filter pixel-office test` · `pnpm --filter web test` | ✅ | ✅ |
| 05-21-01..02 | 21 | 13 | OFFICE-03 | T-05-21-01..03 | integer display scale ≥3x | unit + live | `pnpm --filter pixel-office test` · harness | ✅ | ✅ |
| 05-22-01..02 | 22 | 13 | OFFICE-01/02 | T-05-22-01..SC | reproducible decode; traceable sprites; provenance | unit + script + doc | `node packages/pixel-office/scripts/decode-metrocity-interior.mjs --check` · `pnpm --filter pixel-office test -- officeSprites` | ✅ | ✅ |
| 05-23-01..02 | 23 | 14 | OFFICE-03 | T-05-23-01..02 | glyphs distinguishable by shape, not colour alone | unit | `pnpm --filter pixel-office test -- bubbleSprites` | ✅ | ✅ |
| 05-24..25 | 24-25 | 14-15 | OFFICE-01 | T-05-24-01..02, T-05-25-01..02 | furnished render; per-zoom sprite cache; seats + standing overflow | unit | `pnpm --filter pixel-office test` | ✅ | ✅ |
| 05-26-01..02 | 26 | 16 | OFFICE-01/02/03 | T-05-26-01..03 | TRUTH 6/7 live; footer credit | live + unit | harness · `pnpm --filter web test` | ✅ | ✅ |
| 05-27..30 | 27-30 | 17-20 | HANDOFF-01/02, OFFICE-03 | T-05-27-01..T-05-30-01 | occupancy-aware interaction tile; speaker-attributed capped bubble; head-anchored glyph | unit + live | `pnpm --filter pixel-office test` · harness | ✅ | ✅ |
| 05-31..34 | 31-34 | 1-4 | OFFICE-01/02/03, HANDOFF-01/02 | T-05-31-01..T-05-34-02 | full-viewport sizing; seated pose; obstacle-aware bubbles; fixed aisle slots | unit + live | `pnpm --filter pixel-office test` · `pnpm --filter web test` · harness | ✅ | ✅ |
| 05-35-01..02 | 35 | 5 | HANDOFF-02 | T-05-35-01..02 | `getActiveHandoffs()` read path, no host mutation | unit + typecheck | `pnpm --filter pixel-office test` · `pnpm --filter web typecheck` | ✅ | ✅ |
| 05-36-01..03 | 36 | 1 | OFFICE-01/02 | T-05-36-01..04, SC | footer WALL_COLOR backdrop incl. overflow | unit + live | `pnpm --filter web test` · harness | ✅ | ✅ |
| 05-37-01..02 | 37 | 2 | HANDOFF-01/02 | T-05-37-01..05, SC | record-bound slot and speaker; no nondeterminism/network in pixel-office | unit + grep | `pnpm --filter pixel-office test -- handoff-choreography` | ✅ | ✅ |
| 05-38..39 | 38-39 | 1-2 | OFFICE-03 | — | glyph head gap; hourglass separates in grayscale | unit + live | `pnpm --filter pixel-office test -- bubbleSprites` | ✅ | ✅ |
| 05-40-01..03 | 40 | 3 | HANDOFF-01/02 | T-05-40-01..03 | verb-led lines; task id never shown as title | unit | `pnpm --filter pixel-office test -- dialogue-templates handoff-choreography` | ✅ | ✅ |
| 05-40 (must-have) | 40 | 3 | OFFICE-01 (feed liveness) | — | `role="status"` banner only after socket close | e2e | `npx playwright test e2e/office-disconnect.spec.ts` | ✅ | ✅ (added 2026-09-23) |
| 05-41-01..03 | 41 | 1 | HANDOFF-01/02 | T-05-41-01..04 | blank title → no title; `fullTitle` null; dead record frees slot | unit | `pnpm --filter pixel-office test -- dialogue-templates handoff-choreography` | ✅ | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Requirement roll-up:** OFFICE-01, OFFICE-02, OFFICE-03, HANDOFF-01, HANDOFF-02 — all COVERED.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stream-scale legibility (hourglass silhouette, blocked vs waiting, handoff sentence, glyph clearance, seated vs standing) | OFFICE-01, OFFICE-03, HANDOFF-02 | Legibility at viewing scale is a judgment | Run the live harness or view the captured 1280x720 frame; glance 1s. UAT-passed 2026-09-23 (round 4). Truncated destination name deferred as polish. |
| Package legitimacy (react, react-dom, vite, @vitejs/plugin-react, pngjs) | OFFICE-01 | Supply-chain judgment | Blocking human gates 05-01-T1, 05-06-T1 — done |
| Removing the simulated handoff trigger | HANDOFF-01 | Product decision | 05-11 checkpoint — done |
| Footer covering ~20px below the 960x528 minimum viewport | OFFICE-02 | Product call | UAT round 3 test 3: keep as-is |
| Live TRUTH 0-7 harness | all | Resets Docker test DB, spawns dev servers | `node scripts/verify-pixel-office-live.mjs` — passed 2026-09-23 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-23

---

## Validation Audit 2026-09-23

| Metric | Count |
|--------|-------|
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |

1. Disconnect banner — `e2e/office-disconnect.spec.ts` (local vite + `page.routeWebSocket`).
2. `/ws/browser` rate limit (T-05-04) — 21st-upgrade → 429 case in `apps/api/src/routes/ws-browser.test.ts`.
3. Red `claude-adapter typecheck` (TS2835) — explicit `.js` extensions on relative imports in `packages/company-core/src` and `packages/event-schema/src`; claude-adapter, api and worker typechecks now green.

Advisory (not gaps): `apps/worker/src/poll-loop.test.ts` (Phase 3) was intermittently flaky under parallel `pnpm -r test`; green on this run.
