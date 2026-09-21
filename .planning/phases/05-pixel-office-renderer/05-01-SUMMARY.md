---
phase: 05-pixel-office-renderer
plan: 01
subsystem: api
tags: [websocket, fastify, react, vite, canvas2d, event-sourcing, zod, fork-attribution]

requires:
  - phase: 04-agentruntime-claudecoderuntime
    provides: agent.handoff_requested event (Phase 4, observation-only) that 05-01's reducer changes retype against the new AgentStatus contract
  - phase: 02-controlplane-broadcasthub
    provides: apps/api's worker-facing WS route (routes/ws.ts) and auth pattern (worker-auth.ts) that browser-auth.ts/ws-browser.ts mirror
provides:
  - Canonical 15-value AgentStatus contract (packages/event-schema) — single source of truth for every other Phase 5 plan
  - Browser-facing Broadcast Hub: GET /ws/browser (shared-token auth, snapshot-on-connect, live event relay)
  - apps/web — new Vite+React workspace member, the first browser-facing app in this monorepo
  - packages/pixel-office — new workspace member, forked Canvas2D office-rendering engine (types/constants/colorize/tileMap/spriteData/characters/gameLoop/renderer), trimmed to an IDLE-only render pipeline
affects: [05-02-status-mapping, 05-03-real-derivation, 05-04-handoff-choreography, 06-ceo-dashboard]

actuals:
  tokens: 20366
  tasks: 2
  commits: 2

tech-stack:
  added: [react@19.3.0, react-dom@19.3.0, vite@8.3.0, "@vitejs/plugin-react@6.1.1"]
  patterns:
    - "Shared-token WS auth (authenticateBrowser) mirroring requireBootstrapSecret's timing-safe length-check-then-timingSafeEqual pattern, not the per-worker HMAC credential pattern — proportionate for a single trusted browser viewer"
    - "Snapshot-on-connect + live relay: GET /ws/browser folds every stored event via company-core's fold() and sends it as the first message, before any live event"
    - "Client-side event re-validation: apps/web/src/ws-client.ts re-parses every relayed event through CompanyEventSchema.safeParse — never trusts the wire payload's shape a second time"
    - "Forked-code attribution: every packages/pixel-office/src/*.ts file carries a 3-line header (source URL, commit SHA, licence) per OFFICE-02"

key-files:
  created:
    - packages/event-schema/src/agent-status.ts
    - apps/api/src/auth/browser-auth.ts
    - apps/api/src/ws/browser-connections.ts
    - apps/api/src/db/event-row.ts
    - apps/api/src/routes/ws-browser.ts
    - apps/web/src/ws-client.ts
    - apps/web/src/App.tsx
    - packages/pixel-office/src/index.ts
    - packages/pixel-office/src/engine/characters.ts
    - packages/pixel-office/src/engine/renderer.ts
    - packages/pixel-office/LICENSE
  modified:
    - packages/company-core/src/projections.ts
    - packages/company-core/src/reducer.ts
    - apps/api/src/routes/events.ts
    - apps/api/src/env.ts
    - apps/api/src/server.ts

key-decisions:
  - "Trimmed the forked engine to the primitives this plan's IDLE-only acceptance bar needs (tile grid + one character), dropping the fork's furniture/carpet/area/pet/matrix-effect/editor-overlay layers and its PNG-sprite-cache pipeline — none of that surface exists in this repo and none of it is in scope until a later plan needs it (human-approved deviation, see below)"
  - "spriteData.ts always returns transparent placeholder frames — no real pixel art exists yet (D-02's sourcing triage is 05-02+ scope); this plan proves the real event -> Character.state -> canvas pipeline, not the visual art"
  - "BROWSER_ACCESS_TOKEN is a single shared token (timing-safe compared), not a per-client HMAC credential table — proportionate for this MVP's one trusted browser viewer; documented upgrade path if independently-revocable multi-client credentials are ever needed"

patterns-established:
  - "Pattern: forked third-party code gets a 3-line attribution header (source URL / commit SHA / licence) on every file, plus a top-of-file comment documenting what was trimmed and why, so a later plan re-adding a dropped subsystem isn't guessing at intent"

requirements-completed: [OFFICE-01]

coverage:
  - id: D1
    description: "AgentStatus is a real 15-member union matching PROJECT.md/REQUIREMENTS.md verbatim, correcting CONTEXT.md D-01's inherited 14-count"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/event-schema/src/agent-status.test.ts#AgentStatus has exactly 15 members"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /ws/browser rejects any connection without the exact BROWSER_ACCESS_TOKEN with a uniform 401 (no-token and wrong-token responses are byte-identical)"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "apps/api/src/auth/browser-auth.test.ts#authenticateBrowser"
        status: pass
      - kind: integration
        ref: "apps/api/src/routes/ws-browser.test.ts#GET /ws/browser auth"
        status: pass
    human_judgment: false
  - id: D3
    description: "A newly-connected, authenticated browser socket receives a real company-core fold()-derived snapshot before any live event, and a subsequent real POST /events causes a live relayed event on that same socket"
    requirement: "OFFICE-01"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ws-browser.test.ts#POST /events relay > relays a real posted event to an already-open, authenticated browser socket"
        status: pass
    human_judgment: false
  - id: D4
    description: "apps/web's ws-client re-validates every relayed event client-side before applying it, and rejects a malformed one without calling onEvent"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "apps/web/src/ws-client.test.ts#connectOfficeSocket"
        status: pass
    human_judgment: false
  - id: D5
    description: "packages/pixel-office's forked findPath/gameLoop/renderer/characters compile, and upsertCharacterFromAgent(id, AgentStatus.IDLE) produces a Character with state === CharacterState.IDLE"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#upsertCharacterFromAgent"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/index.test.ts#layout/tileMap findPath (forked, sanity check)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real agent, observed live end-to-end through apps/api's real dev server + apps/web's real dev server in a browser, visibly renders as an idle character on the canvas — the phase's literal Core Value claim"
    verification: []
    human_judgment: true
    rationale: "No producer of agent.online exists anywhere in this codebase yet (grepped; only referenced in schema/reducer/fixtures) — apps/worker's WORKER_ALLOWED_EVENT_TYPES doesn't even include agent.online, so it cannot currently be posted 'through the worker pipeline' at all. The wiring that WOULD render it (App.tsx's onEvent handler, upsertCharacterFromAgent) is unit-proven (D5), but a literal browser-visible live demo needs an upstream agent-identity event producer this plan's file list does not include. Flagging for a human/future-plan decision rather than fabricating a producer or claiming an unverifiable pass."

duration: 25min (Task 2, post-checkpoint-approval; excludes the earlier research/checkpoint-prep window already reported in the CHECKPOINT REACHED handoff)
completed: 2026-09-21
status: complete
---

# Phase 5 Plan 1: Browser Broadcast Hub + Pixel Office Render Skeleton Summary

**A shared-token-authenticated `GET /ws/browser` route (snapshot-on-connect + live relay) drives a forked, attribution-preserved Canvas2D engine in a new `apps/web` Vite+React app, proving one real `AgentStatus.IDLE` value flows from a stored event through `company-core`'s `fold()` to a rendered `Character`.**

## Performance

- **Duration:** ~25 min (Task 2 implementation, after Task 1's human-approved checkpoint)
- **Completed:** 2026-09-21T02:48:17Z
- **Tasks:** 2 (Task 1: package-legitimacy checkpoint, human-approved; Task 2: the full tracer build)
- **Files modified:** 46 (per commit `5be2437`)

## Accomplishments

- `packages/event-schema/src/agent-status.ts` — the canonical 15-value `AgentStatus` contract every later Phase 5 plan builds on
- `apps/api`'s first browser-facing route: `authenticateBrowser` (shared-token, timing-safe) + `GET /ws/browser` (real `company-core.fold()` snapshot + live relay), with `POST /events` now broadcasting every accepted event to open browser sockets
- `apps/web` stood up as a real (not throwaway) Vite+React app per RESEARCH.md Pattern 4 — Phase 6's CEO dashboard extends this same app rather than building fresh
- `packages/pixel-office` forked from `pixel-agents-hq/pixel-agents` (commit `3537e14`, MIT), trimmed to the tile-grid + one-character render pipeline this plan's acceptance bar needs, with attribution headers on every file and the fork's LICENSE preserved verbatim
- `packages/company-core`'s reducer now emits real `AgentStatus` values (`IDLE`/`CODING`/`WAITING_FOR_AGENT`) instead of ad hoc strings

## Task Commits

1. **Task 1: Package legitimacy check** — no commit (checkpoint:human-verify gate; approved by the user directly in chat, not via a "verified" resume-signal string, before Task 2 began)
2. **Task 2: End-to-end tracer** — `5be2437` (feat)

**Plan metadata:** `e8caf63` (docs)

## Files Created/Modified

- `packages/event-schema/src/agent-status.ts` — canonical `AgentStatus` const + type (15 members)
- `packages/event-schema/src/agent-status.test.ts` — structural guard against the 14/15 miscount ever reappearing (not in the plan's `files_modified` list — added per Rule 2, the acceptance criteria explicitly required this test)
- `packages/event-schema/src/index.ts` — re-exports `AgentStatus`
- `packages/company-core/src/projections.ts` — `AgentState.status` retyped `string` → `AgentStatus`
- `packages/company-core/src/reducer.ts` — `agent.online`→`IDLE`, `session.started`→`CODING`, `agent.handoff_requested` receiver→`WAITING_FOR_AGENT`
- `packages/company-core/src/reducer.test.ts` — two stale string assertions updated to the new `AgentStatus` values
- `apps/api/src/env.ts` — `BROWSER_ACCESS_TOKEN` added to `EnvSchema`
- `apps/api/src/auth/browser-auth.ts` + `.test.ts` — shared-token WS auth
- `apps/api/src/ws/browser-connections.ts` — in-memory browser-socket registry + `broadcastToBrowsers`
- `apps/api/src/db/event-row.ts` — `rowToCompanyEvent` (DB row → validated `CompanyEvent`, throws on corruption)
- `apps/api/src/routes/ws-browser.ts` + `.test.ts` — the Broadcast Hub route itself
- `apps/api/src/routes/events.ts` — now calls `broadcastToBrowsers` after a successful insert
- `apps/api/src/server.ts` — registers the new route
- `apps/api/package.json` — added `company-core` workspace dependency
- `apps/web/*` — new workspace member (package.json, vite.config.ts, tsconfig.json/tsconfig.node.json, index.html, src/main.tsx, src/App.tsx, src/ws-client.ts + test, src/vite-env.d.ts)
- `packages/pixel-office/*` — new workspace member (package.json, LICENSE, tsconfig.json, src/{types,constants,colorize}.ts, src/layout/tileMap.ts, src/sprites/spriteData.ts, src/engine/{characters,gameLoop,renderer}.ts, src/index.ts + test)
- `apps/api/.env`, `apps/web/.env` — created locally (gitignored), each carrying the same generated `BROWSER_ACCESS_TOKEN`/`VITE_BROWSER_ACCESS_TOKEN` value; not committed
- `.planning/phases/05-pixel-office-renderer/deferred-items.md` — pre-existing out-of-scope issues found this session

**Existing test files patched for the new required env var** (Rule 3 — my new `BROWSER_ACCESS_TOKEN` env var broke every existing apps/api test file that parses `env.ts`): `apps/api/src/auth/credentials.test.ts`, `apps/api/src/db/append-only.test.ts`, `apps/api/src/routes/{admin-workers,connection-lifecycle,events,ws-auth}.test.ts`.

## Decisions Made

- **Trimmed the forked renderer/types/constants instead of byte-verbatim copying them (human-approved deviation).** The fork's `renderer.ts` (1048 lines) and `types.ts`/`constants.ts` pull in ~10 fork-internal modules that don't exist in this repo and aren't in the plan's own `<files>` list (floor/wall/carpet/pet sprite pipelines, a PNG sprite cache, matrix-effect/editor-overlay code, a UI-component `ColorValue` type). I flagged this at the Task 1 checkpoint; the coordinator approved trimming to only the primitives this plan's acceptance criteria need (tile grid + one idle character), matching the same trim discipline the plan itself already directs for `characters.ts` (remove wander AI) and `spriteData.ts` (IDLE pose only). Every trimmed file's header documents exactly what was dropped and why, so a later plan re-adding furniture/carpets/pets/bubbles isn't guessing at original intent.
- **`spriteData.ts` returns fully-transparent placeholder frames.** No PNG asset-loading pipeline exists in this repo and D-02's real pixel-art sourcing triage is 05-02+ scope — this plan proves the real event → `Character.state` → canvas pipeline, not the visual art itself.
- **`characters.ts`'s WALK-state path-following logic was kept** (not trimmed) even though nothing in this plan drives a character into WALK yet — it's genuinely reusable infrastructure for 05-04's handoff walk-to-desk choreography (RESEARCH.md Pattern 1), exposed via a new `walkCharacterTo` helper.
- **`BROWSER_ACCESS_TOKEN` is one shared token**, timing-safe compared exactly like `requireBootstrapSecret`, not a per-client HMAC credential table — proportionate for this MVP's single trusted browser viewer (matches the plan's own stated rationale).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing apps/api test files broke when `BROWSER_ACCESS_TOKEN` became a required env var**
- **Found during:** Task 2, first full `pnpm --filter api test` run
- **Issue:** `env.ts`'s `EnvSchema.parse(process.env)` now requires `BROWSER_ACCESS_TOKEN`; every existing test file that sets `process.env.*` before dynamically importing `env.ts`-dependent modules didn't set this new var, so `credentials.test.ts` and every route test failed at import time with a ZodError.
- **Fix:** Added `process.env.BROWSER_ACCESS_TOKEN = "test-browser-access-token"` to the same env-setup block in each affected file.
- **Files modified:** `apps/api/src/auth/credentials.test.ts`, `apps/api/src/db/append-only.test.ts`, `apps/api/src/routes/{admin-workers,connection-lifecycle,events,ws-auth}.test.ts`
- **Verification:** `pnpm --filter api test` — 9 files, 36/36 tests passing
- **Committed in:** `5be2437` (Task 2 commit)

**2. [Rule 1 - Bug] `append-only.test.ts`'s intentionally-minimal test row poisoned every other test file's Broadcast Hub snapshot fold**
- **Found during:** Task 2, `ws-browser.test.ts`'s "accepts the correct token" test timing out
- **Issue:** `append-only.test.ts` inserts one `company.started` row directly via raw SQL with `payload: '{}'::jsonb` (row content is irrelevant to what it's testing — an UPDATE/DELETE trigger). This row is never deleted (that's the point) and persists in the shared test Postgres for the rest of the suite run. `ws-browser.ts`'s snapshot logic folds every row in the `events` table and — by design (`rowToCompanyEvent` must throw, never silently swallow a corrupt row) — throws on this row's missing `payload.name`, which surfaced as the WS handler crashing mid-request and the client-side test timing out waiting for a message that never arrived.
- **Fix:** Changed the inserted row's payload to a schema-valid `{"name":"Append Only Test Co"}` — zero change to what `append-only.test.ts` itself verifies (it never reads the payload back).
- **Files modified:** `apps/api/src/db/append-only.test.ts`
- **Verification:** Reset the test DB (`docker compose down -v && up -d --wait`, re-ran migrations), then `pnpm --filter api test` — 9 files, 36/36 passing
- **Committed in:** `5be2437` (Task 2 commit)

**3. [Rule 1 - Bug] `characters.ts` imported `TILE_SIZE` from the wrong module after the types.ts/constants.ts split**
- **Found during:** Task 2, `tsc --noEmit` on the new pixel-office package
- **Issue:** The fork's original `types.ts` re-exported `TILE_SIZE` from `constants.ts`; this plan's trimmed `types.ts` doesn't re-export it (constants.ts is the sole source now), but `characters.ts`'s import statement still pulled `TILE_SIZE` from `../types.js`, matching the fork's original (now-stale) import.
- **Fix:** Import `TILE_SIZE` from `../constants.js` alongside the other timing constants already imported from there.
- **Files modified:** `packages/pixel-office/src/engine/characters.ts`
- **Verification:** `pnpm --filter pixel-office test` passes; manual `tsc --noEmit` against the package shows no more `TILE_SIZE`-related error
- **Committed in:** `5be2437` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3/blocking, 1 Rule 1/bug) + 1 human-approved architectural trim (documented above under Decisions Made, not re-listed here since it was explicitly approved mid-plan rather than auto-fixed)
**Impact on plan:** All three auto-fixes were necessary for the required verify commands to pass at all; none expanded scope beyond what Task 2 already touched. The approved trim reduced scope (fewer forked files/lines) rather than expanding it.

## Known Stubs

- **`packages/pixel-office/src/sprites/spriteData.ts`'s `getCharacterSprites`** always returns fully-transparent placeholder sprite frames (no real pixel art). This is intentional and documented in the file's own header: no PNG asset-loading pipeline exists in this repo yet, and D-02's real pixel-art sourcing triage (existing-asset reuse → AI-assisted generation → procedural variation → commission) is explicitly 05-02+ scope per RESEARCH.md. This plan's goal is proving the real event → `Character.state` → canvas pipeline, not shipping visual art — a rendered idle character is currently invisible pixels at the correct position, not a missing feature. Resolved when 05-02 wires real sprite data through this same function.

## Issues Encountered

- **Pre-existing repo-wide TS module-resolution inconsistency** (`event-schema/src/index.ts` and `company-core/src/index.ts` re-export without explicit `.js` extensions, which `tsc --noEmit` flags under `moduleResolution: "NodeNext"`). Confirmed pre-existing (predates this session; `pnpm --filter api typecheck` was already broken on this before I touched anything) and does not block any of this plan's required `<verify>` commands (`apps/web`'s typecheck deliberately uses `moduleResolution: "bundler"`, and every other required command runs via Vitest's esbuild transform, which doesn't type-check). Logged in `deferred-items.md`, not fixed — it's a repo-wide convention question, not something scoped to this plan's files.
- **No live browser demo was run.** All required automated verify commands pass and the individual mechanism pieces (auth, snapshot format, relay, client-side revalidation, `Character.state` production) are each unit/integration-tested, but I did not start `apps/api`'s and `apps/web`'s real dev servers and visually confirm a canvas render in an actual browser — see coverage `D6`'s `human_judgment: true` and its rationale: no producer of `agent.online` exists anywhere in this codebase yet, so the plan's literal "a real agent.online event, posted through the worker pipeline, renders as an idle character" demo isn't currently reproducible even manually. This is a pre-existing gap outside this plan's file list, not something introduced here.

## User Setup Required

**Local `.env` files were generated automatically** (gitignored, not committed): `apps/api/.env` (`DATABASE_URL`, `CREDENTIAL_PEPPER`, `BOOTSTRAP_SECRET`, `BROWSER_ACCESS_TOKEN`) and `apps/web/.env` (`VITE_BROWSER_ACCESS_TOKEN` — same value as `apps/api/.env`'s, `VITE_WS_BASE_URL=ws://localhost:3000`). No dashboard configuration needed. The local test Postgres container (`apps/api`'s `docker-compose.test.yml`) is currently running on port 5434 with migrations applied — left running for the next plan/session; tear down with `pnpm --filter api db:test:down` if not needed.

## Next Phase Readiness

- 05-02 (status-mapping fidelity) can build directly on `AgentStatus`, the `getCharacterSprites`/`getCharacterSprite` seam, and the bubble-overlay pattern RESEARCH.md already scoped — no rework needed to what 05-01 shipped.
- 05-04 (handoff choreography) has `findPath` and `walkCharacterTo` already forked and ready to drive off real `agent.handoff_requested`/`agent.handoff_completed` event pairs.
- **Known gap for a future plan:** nothing in this codebase currently produces `agent.online` (or any event outside `WORKER_ALLOWED_EVENT_TYPES` from the worker's side) — the literal "real agent shows up in the office" demo needs an upstream producer before it's fully reproducible end-to-end, live, in a browser. Not blocking 05-02/05-03/05-04's own scoped work.

## Self-Check: PASSED

All claimed created/modified files verified present on disk; commit `5be2437` verified present in `git log`.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*
