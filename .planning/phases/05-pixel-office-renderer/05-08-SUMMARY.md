---
phase: 05-pixel-office-renderer
plan: 08
subsystem: verification
tags: [playwright, canvas, e2e, dev-server, websocket, nodejs]
status: complete

requires:
  - phase: 05-pixel-office-renderer (05-05)
    provides: WORKER_ALLOWED_EVENT_TYPES extended to admit task.status_changed + the handoff pair; snapshot-before-registration ordering on /ws/browser
  - phase: 05-pixel-office-renderer (05-06)
    provides: real decoded MetroCity pixel data in getCharacterSprites()
  - phase: 05-pixel-office-renderer (05-07)
    provides: the bubble/badge overlay draw pass + bubble-handoff-task.json / bubble-blocked.json assets
provides:
  - "scripts/verify-pixel-office-live.mjs — re-runnable, zero-mock live end-to-end proof of Phase 5's Core Value claim"
  - "Empirical closure of 05-01-SUMMARY.md's D6 and 05-04-SUMMARY.md's D7 human-judgment coverage items"
  - "Bubble overlay clamped into the canvas (renderScene) — top-row agents' status glyph now actually paints"
affects: [06-ceo-dashboard, phase-05-verification]

actuals:
  tokens: 7187
  tasks: 1
  commits: 4

plan_head_before: ee23ce6a7b68657b434dbb9d099970577594e7ed

tech-stack:
  added: []
  patterns:
    - "verify-pixel-office-live — spawn real dev servers (reusing any already-listening instance), drive the real HTTP/WS pipeline, sample real canvas getImageData, assert on colours read from the sprite assets at run time rather than hardcoded"
    - "Distinctive-colour pixel assertion: a bubble's proof colour is derived as (bubble palette) minus (every character sprite colour), so a hit can only come from the overlay"

key-files:
  created:
    - scripts/verify-pixel-office-live.mjs
  modified:
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/src/engine/renderer.test.ts

decisions:
  - "Posted only the event types the real pipeline actually carries (task.status_changed + agent.handoff_requested/completed) instead of the plan's literal agent.online/task.created, which WORKER_ALLOWED_EVENT_TYPES 403s — widening that allow-list to make a demo pass would have faked the proof"
  - "Fixed (not per-run-unique) synthetic agent ids, because the events table is append-only: fixed ids keep re-runs reusing the same three desks instead of accumulating stale agents on the floor"
  - "The script asserts a CLEAN baseline (0 blocked-bubble px, 0 handoff-bubble px) before posting the events under test, so truths 2 and 3 cannot pass on leftover pixels from an earlier run"
  - "Bubble Y clamped to Math.max(0, ...) rather than moving desks off row 1 — smallest fix that covers every near-top-edge case, including a character that walks there"

metrics:
  duration: ~35min
  completed: 2026-09-21
---

# Phase 05 Plan 08: Live End-to-End Pixel Proof Summary

A real headless Chromium, driven by Playwright against real `apps/api` + `apps/web` dev servers, now demonstrably paints a real agent sprite, a real blocked-status bubble, and a real handoff task icon that appears during the walk and clears on completion — all driven by real HTTP/WS traffic through the real event pipeline, with zero mocking, and the run is committed as a re-runnable script.

## What Was Built

`scripts/verify-pixel-office-live.mjs` — a standalone Node ESM script (`node scripts/verify-pixel-office-live.mjs`, not wired into any test runner) that:

1. Brings up the test Postgres (`pnpm --filter api db:test:up`), creates the dev database named by `apps/api/.env`'s `DATABASE_URL` if it does not exist, and applies all four `apps/api/drizzle/*.sql` migrations idempotently.
2. Starts `apps/api` and `apps/web` dev servers as background children — or reuses an already-listening instance — and waits on `GET /health` and the Vite URL.
3. Issues a real worker credential through `POST /admin/workers`.
4. Launches headless Chromium, opens the app, and reads the `#office-canvas` pixel buffer back via `getImageData`.
5. Asserts three truths against those real pixels, then prints `LIVE PROOF: PASS`.

The proof colours are **derived at run time**, never hardcoded: the script reads `character-metrocity.json` to build the set of every colour a character sprite can paint, then reads `bubble-blocked.json` / `bubble-handoff-task.json` and keeps only the palette entries that set does not contain. A hit on one of those colours can therefore only have come from the overlay. Floor and wall RGB are likewise parsed out of `packages/pixel-office/src/constants.ts`.

## Evidence (actual run output, third consecutive clean run, exit 0)

```
baseline canvas 320x176: sprite=882 blocked=0 handoff=0
TRUTH 1 PASS — 882 real sprite pixels on a real canvas
after blocked: sprite=847 blocked=68 handoff=0
TRUTH 2 PASS — 68 blocked-bubble pixels on canvas
after handoff_requested: sprite=613 blocked=68 handoff=28
after handoff_completed: sprite=741 blocked=68 handoff=0
TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion
LIVE PROOF: PASS
```

This closes `05-01-SUMMARY.md`'s **D6** and `05-04-SUMMARY.md`'s **D7** at the mechanical level: the sprites are no longer invisible placeholders, the bubble overlay genuinely paints, and the handoff icon lifecycle is observable on a real canvas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's literal event choice cannot traverse the real pipeline**

- **Found during:** Task 1, while reading `apps/api/src/routes/events.ts` before writing the script.
- **Issue:** The plan's draft script posts `agent.online` (Truth 1) and `task.created` (Truth 2). Neither is in `WORKER_ALLOWED_EVENT_TYPES`, so a worker credential is rejected with `403 event type not permitted for this credential` for both. `agent.online` additionally still has **no producer anywhere in this codebase** — the gap flagged since 05-01 and re-flagged by 05-07.
- **Fix:** Drove the same three truths using only event types the pipeline actually carries today, all of which `ClaudeCodeRuntime` genuinely emits. `task.status_changed`'s reducer handler upserts the owning agent from `sourceAgentId` and derives its `AgentStatus` via `deriveAgentStatus`, so it materialises a rendered character without `agent.online`; `status: "running"` yields `CODING` (Truth 1's sprite), `status: "blocked"` yields `BLOCKED` + the `blocked` bubble (Truth 2). `agent.handoff_requested`/`agent.handoff_completed` are already allowed and already wired straight into `handleHandoffEvent` (Truth 3).
- **Explicitly NOT done:** adding `agent.online` to `WORKER_ALLOWED_EVENT_TYPES`. That would have widened a security control purely to make a demo pass, i.e. faked the proof. The gap is left standing and re-flagged below.
- **Files modified:** `scripts/verify-pixel-office-live.mjs` (design, not a patch).
- **Commit:** `3742846`

**2. [Rule 1 - Bug] The bubble overlay painted entirely off-canvas for every top-row agent**

- **Found during:** Task 1, first live run — Truth 2 failed with `0 px` of `#d62828`.
- **Issue:** `renderScene` computed `bubbleY = drawY - bubbleHeight*zoom - BUBBLE_ICON_GAP_PX*zoom` with no lower bound. The default office seats its **first 18 agents on interior row 1** (`nextDeskPosition`, `interiorCols = 18`), where a 32px-tall sprite anchored at `y = 24` already gives `drawY = -8`; a 13px glyph therefore landed at `y = -23 .. -10`, entirely above the canvas. 05-07's unit tests all used row-3 characters, so the defect was invisible to them — the bubble feature was effectively non-functional for the common case in a real browser.
- **Fix:** `bubbleY = Math.max(0, ...)`. Overlapping the top of the character sprite is strictly better than being invisible. Added a regression test asserting a row-1 character's bubble rects all sit at `y >= 0`.
- **Files modified:** `packages/pixel-office/src/engine/renderer.ts`, `packages/pixel-office/src/engine/renderer.test.ts`
- **Commit:** `9548fa5`

**3. [Rule 3 - Blocking] `apps/api/.env`'s dev database did not exist**

- **Found during:** Task 1, first live run — `database "pixelfirm_dev" does not exist`.
- **Issue:** The test container is created with `POSTGRES_DB=pixelfirm_test`, but `apps/api/.env`'s `DATABASE_URL` names the dev database, which nothing creates. The API dev server could not have started against the committed local env.
- **Fix:** The script connects to the `postgres` maintenance database on the same host/port and `CREATE DATABASE`s the configured name if `pg_database` does not already have it. The user's gitignored `.env` is read but never modified.
- **Files modified:** `scripts/verify-pixel-office-live.mjs`
- **Commit:** `3742846`

## Known Gaps (flagged, deliberately not fixed here)

- **No producer of `agent.online` exists anywhere in this codebase** (flagged since 05-01, re-flagged by 05-04 and 05-07, still true). The literal "a real agent walks into the office when it comes online" demo is still not reproducible end-to-end. This proof demonstrates the same rendering truths through `task.status_changed`, which is what the real runtime actually emits — it does **not** close the `agent.online` gap, and nothing here should be read as having closed it. An agent-identity event producer (plus the corresponding allow-list decision) is still owed.
- **A live, already-connected browser client never re-derives `AgentStatus` from `task.status_changed` / `gsd.phase_observed` / `agent.handoff_completed`** (the gap documented in 05-08-PLAN.md's own objective). The script works around it exactly as the plan specified — by reloading the page to take a fresh snapshot through the already-proven `fold()` path. Phase 6's CEO dashboard will have the identical live-update need; the proper fix is a live-projection-diff broadcast, not a raw-event relay.
- **OFFICE-03's "visually distinguishable at a glance"** remains an open human/UAT judgment call, exactly as the plan's `prohibitions` block states. This script proves the icon *paints* (68 real pixels of its own distinctive colour); it cannot prove the icon *reads clearly* at typical stream scale. Deferred to end-of-phase human visual review per `human_verify_mode: end-of-phase`. The clamp fix above makes this *more* pressing, not less: a row-1 agent's bubble now overlaps the top of its own sprite rather than floating clear above it, which is a legibility trade a human should eyeball.

## Threat Flags

None. The only new surface is a dev-only script that reads already-gitignored local `.env` files and sends them to the localhost dev server it just started (T-05-26, accepted in the plan's own register). No secret is printed to stdout — the script logs event types and agent ids only.

## Verification

| Check | Result |
|-------|--------|
| `node scripts/verify-pixel-office-live.mjs` | exit 0, prints `LIVE PROOF: PASS` (3 consecutive runs) |
| `pnpm --filter pixel-office test` | 7 files, 50 tests passed |
| Re-runnability | 3 consecutive runs from a dirty (already-populated, append-only) events table; baseline scan clean each time |

Pre-existing unrelated failures (`e2e/control-plane.spec.ts` unresolvable `ws` import; `apps/worker/src/poll-loop.test.ts` timing-bound assertion) were not touched.

## Self-Check: PASSED

- `scripts/verify-pixel-office-live.mjs` — FOUND
- `packages/pixel-office/src/engine/renderer.ts` — FOUND
- `packages/pixel-office/src/engine/renderer.test.ts` — FOUND
- Commit `9548fa5` — FOUND in `git log`
- Commit `3742846` — FOUND in `git log`

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*
