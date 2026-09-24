# Phase 6: CEO Dashboard & Approval Workflow - Pattern Map

**Mapped:** 2026-09-24
**Files analyzed:** 27 (new + modified, from 06-RESEARCH.md "Recommended Project Structure" + 06-UI-SPEC.md)
**Analogs found:** 23 / 27

All analog paths below verified with `git ls-files`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/event-schema/src/payloads/index.ts` (mod) | model/schema | transform | itself (l.19 `CeoApprovalRequestedPayload`, l.84-106 union) | exact |
| `packages/company-core/src/decisions.ts` (new) | utility (pure fold) | transform | `packages/company-core/src/reducer.ts` (`fold` l.290) / `agent-status-derivation.ts` | role-match |
| `packages/claude-adapter/src/claude-code-runtime.ts` (mod) | service | event-driven | itself (l.185-250) | exact |
| `packages/claude-adapter/src/decision-mapping.ts` (new) | utility (pure) | transform | `packages/claude-adapter/src/signal-detection.ts` | role-match |
| `packages/claude-adapter/src/signal-detection.ts` (mod, optional) | utility | transform | itself | exact |
| `packages/git-adapter/src/diff.ts` (new) | service (read-only git) | file-I/O | `packages/git-adapter/src/worktree.ts` | exact |
| `packages/pixel-office/src/constants.ts` (mod) | config | — | itself (l.15-16) | exact |
| `packages/pixel-office/src/layout/office-layout.json` (mod) | config | — | itself (`seats`/`standing`/`interaction`) | exact |
| `packages/pixel-office/src/layout/officeLayout.ts` (mod) | config loader | transform | itself (l.40-41, 76-81, 103-118) | exact |
| `packages/pixel-office/src/ceo/ceo-queue.ts` (new) | component (engine) | event-driven | `packages/pixel-office/src/handoff/handoff-choreography.ts` | exact |
| `packages/pixel-office/src/engine/characters.ts` (mod: face DOWN at ceoQueue slot) | component | event-driven | itself | exact |
| `apps/api/src/auth/ceo-auth.ts` (new) | middleware | request-response | `apps/api/src/auth/browser-auth.ts` | exact |
| `apps/api/src/auth/csrf.ts` (new) | middleware | request-response | `apps/api/src/auth/browser-auth.ts` | role-match |
| `apps/api/src/ws/worker-connections.ts` (new) | store (registry) | pub-sub | `apps/api/src/ws/connection-status.ts` + `browser-connections.ts` | exact |
| `apps/api/src/ws/browser-connections.ts` (mod: per-socket filter) | store | pub-sub | itself | exact |
| `apps/api/src/routes/ceo.ts` (new) | controller + WS route | request-response + streaming | `apps/api/src/routes/ws-browser.ts` + `routes/events.ts` | exact |
| `apps/api/src/routes/ws.ts` (mod: hello/reconcile/downlink) | route | event-driven | itself | exact |
| `apps/api/src/routes/events.ts` (mod: allowlist, stamp workerId, bare onConflict) | controller | CRUD | itself | exact |
| `apps/api/src/env.ts` (mod: CF Access + CEO_EMAIL + dev bypass) | config | — | itself | exact |
| `apps/api/src/server.ts` (mod: redact, register ceo route) | config | — | itself (l.21) | exact |
| `apps/api/drizzle/0004_ceo_decision_once.sql` (new) | migration | — | `apps/api/drizzle/0003_no_truncate_trigger.sql` | exact |
| `apps/api/Dockerfile` (mod: `ENV NODE_ENV=production`) | config | — | itself | exact |
| `apps/worker/src/index.ts` (mod: host runtime) | service entry | event-driven | itself | exact |
| `apps/worker/src/decisions.ts` (new) | service (pending map + downlink) | event-driven | `apps/worker/src/ws-client.ts` | role-match |
| `apps/web/src/main.tsx` (mod: `/ceo` lazy) | config/entry | — | itself | exact |
| `apps/web/src/ceo/*` (CeoApp.tsx, ceo.css, feed client) | component | streaming | `apps/web/src/ws-client.ts` + `App.tsx` (feed only) | partial |
| `apps/web/src/components/ui/*`, `components/kibo-ui/*` | component (generated) | — | none (shadcn CLI output) | none |
| `e2e/ceo-dashboard.spec.ts` (new) | test | — | `e2e/office-disconnect.spec.ts` | exact |
| `scripts/verify-ceo-approval-live.mjs` (new) | test (live harness) | — | `scripts/verify-pixel-office-live.mjs` | role-match |

## Pattern Assignments

### `packages/claude-adapter/src/claude-code-runtime.ts` (service, event-driven) — modify

**Current `canUseTool`** (l.195-207) — replace the immediate deny with the parked `awaitDecision` flow (RESEARCH Pattern 1); keep the superseded-deny first line verbatim:
```typescript
canUseTool: async (toolName, input) => {
  if (!isCurrent()) {
    return { behavior: "deny", message: `Invocation superseded for task ${taskId} — tool call refused.` };
  }
  const signal = classifySignal(toolName, input);
  if (!signal) return { behavior: "allow", updatedInput: input };
  await requestReview(taskId, signal.reason);
  return { behavior: "deny", message: `Escalated to CEO for review ...` };
},
```
Note: the name `signal` collides with the SDK's `{ signal }` option arg — rename the classification (`cls`) when adding the 3rd param.

**Notification hook** (l.214-229): add `if (parkedCount > 0) return {};` right after the `isCurrent()` guard. Add `PreToolUse` as a sibling key in the same `hooks:` object (Pattern 1b).

**Watchdog** (l.239-248): add `if (parkedCount > 0) return;` as the first line inside the async IIFE, next to `if (!isCurrent()) return;`. Declare `parkedCount` inside `runQuery` next to `isCurrent` (l.146).

**Env strip** (l.189): extend the filter to a Set of keys (Pitfall 11):
```typescript
env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ANTHROPIC_API_KEY")),
```

**Status emission:** reuse existing `emitStatus(taskId, "running")` (same helper used at l.247 for `"blocked"`).

---

### `packages/claude-adapter/src/decision-mapping.ts` (utility, pure)

**Analog:** `signal-detection.ts` — pure exported function + interface, no classes (`export interface ClassifiedSignal` l.15, `export function classifySignal(toolName, input): ClassifiedSignal | null` l.31). Copy RESEARCH "Pure decision → PermissionResult mapping" for the body. Test file sibling `decision-mapping.test.ts`, same style as `signal-detection.test.ts`.

---

### `packages/git-adapter/src/diff.ts` (read-only git, file-I/O)

**Analog:** `packages/git-adapter/src/worktree.ts` (full file, 56 lines)

Imports + execa array-args pattern (l.1, 21):
```typescript
import { execa } from "execa";
const { stdout } = await execa("git", ["worktree", "list", "--porcelain"], { cwd: repoPath });
```
Export a plain async function + result interface (l.3-9 `WorktreeRecord`, l.20 `listWorktrees`). Always prepend `["--no-ext-diff", "--no-textconv", "--no-color"]`. Export from `packages/git-adapter/src/index.ts`. `no-mutating-git.test.ts` covers it automatically. `listWorktrees` is also what the worker uses to validate `worktreePath` on `task.resume`.

---

### `packages/company-core/src/decisions.ts` (pure fold)

**Analog:** `packages/company-core/src/reducer.ts` l.285-290:
```typescript
export function reduce(state: ProjectionState, event: CompanyEvent): ProjectionState
export function fold(events: CompanyEvent[], initial: ProjectionState = emptyState()): ProjectionState
```
Mirror as `foldDecisions(events)` + a per-event `applyDecisionEvent(state, event)` so the client uses the same step for snapshot and live (05-09 rule). Do NOT touch `reduce()`; export from `company-core/src/index.ts` alongside `fold` (l.1).

---

### `packages/event-schema/src/payloads/index.ts` (schema)

Extend l.19 `CeoApprovalRequestedPayload` with **optional** fields; append new members after l.106 (`agent.handoff_completed`) in the same form as l.93:
```typescript
z.object({ ...BaseEnvelope.shape, type: z.literal("ceo.approval_requested"), payload: CeoApprovalRequestedPayload }),
```
Never reorder. Payload shapes: RESEARCH Pattern 2.

---

### `packages/pixel-office/src/ceo/ceo-queue.ts` (engine, event-driven)

**Analog:** `packages/pixel-office/src/handoff/handoff-choreography.ts`

Imports (l.16): `import { setRestPose, walkCharacterTo } from "../engine/characters.js";`
Reuse exported `blockedTilesFor` (l.54-65) — do not copy it:
```typescript
export function blockedTilesFor(walker: Character, target: Tile): Set<string> { ... }
```
Walk call shape (l.201, 235, 272):
```typescript
walkCharacterTo(fromChar, target.col, target.row, getTileMap(), blockedTilesFor(fromChar, target));
```
Walk-home is the l.272 `seat` variant. Module-state `Map<agentId, slotIndex>` + `_reset...ForTests()` like `browser-connections.ts` l.55.

### `packages/pixel-office/src/layout/officeLayout.ts` + `office-layout.json` + `constants.ts`

Add `export const CEO_QUEUE_SLOTS = toTiles(layout.ceoQueue);` next to l.79-81:
```typescript
export const SEATS = toTiles(layout.seats);
export const STANDING_SPOTS = toTiles(layout.standing);
```
Load-time validation style (throw naming the problem), l.40-41 and l.103-118:
```typescript
if (OFFICE_TILE_MAP.length !== DEFAULT_ROWS || OFFICE_TILE_MAP.some((r) => r.length !== DEFAULT_COLS)) {
  throw new Error(`office-layout.json: tiles must be ${DEFAULT_ROWS} rows of ${DEFAULT_COLS} chars`);
}
```
`constants.ts` l.15-16: `DEFAULT_COLS` 20→24, `DEFAULT_ROWS` 11→13. Then re-derive scale tests (Pitfall 9: `apps/web/src/App.test.tsx`, pixel-office `index.test.ts`, `renderer.test.ts:1053,1067`).

---

### `apps/api/src/auth/ceo-auth.ts` + `apps/api/src/auth/csrf.ts` (middleware)

**Analog:** `apps/api/src/auth/browser-auth.ts` (full file, 43 lines)

Uniform rejection const (l.9) + fastify request augmentation (l.14-18) + preValidation signature (l.27-42):
```typescript
const UNAUTHORIZED = { error: "unauthorized" } as const;
declare module "fastify" {
  interface FastifyRequest { browserAuthed?: boolean; }   // -> ceoEmail?: string
}
export async function authenticateBrowser(request: FastifyRequest, reply: FastifyReply) {
  ...
  if (!ok) { reply.code(401).send(UNAUTHORIZED); return; }
  request.browserAuthed = true;
  // Auth passed — return without replying so Fastify proceeds to the handler.
}
```
Use `timingSafeEqual` length-check pattern (l.31-34) for the `CEO_EMAIL` compare if desired. JWT verify via `jose` per RESEARCH "Access JWT verification" (injectable JWKS for tests). Dev bypass: check `request.socket.remoteAddress`, not `request.ip` (`server.ts` sets `trustProxy: true`). Test analog: `apps/api/src/auth/browser-auth.test.ts`.

---

### `apps/api/src/ws/worker-connections.ts` + `browser-connections.ts` (registry)

**Analog:** `apps/api/src/ws/connection-status.ts` (module-level `Map`, `markSocketOpen/Closed`, `_resetRegistryForTests` l.13, 28-34, 54-56) and `browser-connections.ts`.

`browser-connections.ts` change: map value becomes `{ queue: string[] | null; accepts: (e) => boolean }`; `broadcastToBrowsers` (l.44-53) stops stringifying once for all — filter per socket first:
```typescript
export function broadcastToBrowsers(message: unknown): void {
  const payload = JSON.stringify(message);
  for (const [socket, queued] of browserSockets) {
    if (queued) queued.push(payload);
    else if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
```
Keep register → SELECT → send snapshot → `flushBrowserSocket` ordering (CR-03).

---

### `apps/api/src/routes/ceo.ts` (controller + WS)

**Analog (WS):** `apps/api/src/routes/ws-browser.ts` l.14-62 — copy whole structure for `/ceo/ws`, swapping `preValidation: authenticateBrowser` for `[requireOrigin, requireCeo]`, the SELECT for `where type like 'ceo.%'`, and `fold` for `foldDecisions`:
```typescript
fastify.get("/ws/browser", { websocket: true, preValidation: authenticateBrowser,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (socket) => {
  registerBrowserSocket(socket);
  try {
    const rows = await db.select().from(events).orderBy(events.occurredAt);
    const state = fold(rows.map(rowToCompanyEvent));
    socket.send(JSON.stringify({ type: "snapshot", state }));
    flushBrowserSocket(socket);
  } catch (err) {
    fastify.log.error({ err }, "ws/browser: snapshot failed, closing socket");
    unregisterBrowserSocket(socket); socket.close(); return;
  }
  socket.on("close", () => unregisterBrowserSocket(socket));
  socket.on("error", () => unregisterBrowserSocket(socket));
});
```
**Analog (POST decision):** `apps/api/src/routes/events.ts` l.29-89 — `safeParse` → 400, `db.insert(events).values({...})...returning({ id })`, `inserted.length === 0` branch (→ 409 here), then `broadcastToBrowsers({ type: "event", event })`. Offline check before insert: `getConnectionStatus(workerId)` from `connection-status.ts` l.43 (→ 503). Never log payload (T-02-03 comment l.67-69).

---

### `apps/api/src/routes/ws.ts` (worker WS) — modify

Current handler (l.13-24): identity from `request.workerId`, never the message. Add `registerWorkerSocket(workerId, socket)` next to `markSocketOpen`, a `socket.on("message", ...)` for `{type:"hello", bootId}` → reconcile (RESEARCH Pattern 4), unregister in the existing close/error handlers.

### `apps/api/src/routes/events.ts` — modify

- `WORKER_ALLOWED_EVENT_TYPES` (l.18-26): append `"ceo.decision_applied"`, `"ceo.approval_expired"` only. Never `ceo.decision_made`.
- l.63 `.onConflictDoNothing({ target: events.id })` → bare `.onConflictDoNothing()`.
- Before insert: stamp `payload.workerId = request.workerId` for `ceo.approval_requested` (same rationale as heartbeat comment l.76-80).
- l.86 relay goes through the filtered broadcaster.

### `apps/api/src/env.ts` / `server.ts`

Add keys to `EnvSchema` (env.ts l.6-15) with a comment per key, same style as `BROWSER_ACCESS_TOKEN`. Add a `.superRefine` that throws when `CEO_DEV_AUTH_BYPASS` is on with `NODE_ENV === "production"`. `server.ts` l.21 redact: append `"req.headers['cf-access-jwt-assertion']"`, `"req.headers.cookie"`. Do not add a CORS plugin (server.ts l.15-18 comment).

### `apps/api/drizzle/0004_ceo_decision_once.sql`

Analog `0003_no_truncate_trigger.sql`: leading `--` comment explaining why, then one statement. No journal entry (0003 has none; `scripts/migrate.mjs` applies every `.sql`). SQL body: RESEARCH Pattern 3.

---

### `apps/worker/src/index.ts` + `apps/worker/src/decisions.ts`

**Analog:** `apps/worker/src/index.ts` l.13-40 (`startWorker()` returns `{ stop() }`, composes sub-starters) and `ws-client.ts` l.59-104.

Hook the downlink via the existing `onOpen` callback — no new connection code:
```typescript
const connection = startReconnectingConnection(env.controlPlaneUrl, env.token);
// ws-client.ts: startReconnectingConnection(controlPlaneUrl, token, onOpen?: (ws) => void, onClose?: () => void)
```
In `onOpen`: send `{type:"hello", bootId}` and `ws.on("message", handleDownlink)`. `decisions.ts` = factory `createDecisionBroker()` returning `{ awaitDecision(decisionId, signal), handleDownlink(raw), bootId }`; closed `type` set, ignore unknown. Add its `stop()` into the returned `stop()` (l.34-38). Emit events via `buildEnvelope`/`postEvent` from `apps/worker/src/event-emitter.ts` (as `ws-client.ts` l.2, 37).

---

### `apps/web/src/main.tsx` — modify

Current (l.10-14) static render; replace with the RESEARCH Pattern 8 path check. Keep the `#root` guard (l.5-8) and the static `App` import. `ceo.css` imported only from `ceo/CeoApp.tsx`.

### `apps/web/src/ceo/*`

Feed client: follow `apps/web/src/ws-client.ts` (reconnecting browser WS, snapshot-then-event messages) but connect to same-origin `/ceo/ws` with no `?token=`. Dev: add `server.proxy` for `/ceo/api` and `/ceo/ws` in `apps/web/vite.config.ts` (none exists today). UI components: generated by shadcn CLI per 06-UI-SPEC.md — no in-repo analog.

### `e2e/ceo-dashboard.spec.ts`

**Analog:** `e2e/office-disconnect.spec.ts` l.1-25 — spawn vite on a fixed port, poll until up, fake the WS with `page.routeWebSocket`:
```typescript
vite = spawn("pnpm", ["--filter", "web", "exec", "vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  shell: true, env: { ...process.env, VITE_WS_BASE_URL: "ws://fake-office.test", VITE_BROWSER_ACCESS_TOKEN: "t" },
});
```
Also assert `/` loads no `ceo` chunk / Tailwind preflight (UI-SPEC scope backstop).

### `scripts/verify-ceo-approval-live.mjs`

**Analog:** `scripts/verify-pixel-office-live.mjs` — keep its refusal of in-repo shot dirs (memory note). Must hold a decision >120 s (Pitfall 4) in a temp repo whose `.claude/settings.local.json` allow-lists the probe (Pitfall 1).

## Shared Patterns

### Identity from the authenticated connection
**Source:** `apps/api/src/routes/ws.ts` l.14-16, `events.ts` l.76-80
**Apply to:** ws.ts downlink registry, events.ts workerId stamping, ceo.ts decider (`request.ceoEmail` from verified JWT, never body).

### Uniform-401 preValidation guards
**Source:** `apps/api/src/auth/browser-auth.ts` l.9, 27-42
**Apply to:** ceo-auth.ts, csrf.ts, every `/ceo/*` route. Per-route `config: { rateLimit: {...} }` (ws.ts l.11).

### Module-state registries with test reset
**Source:** `apps/api/src/ws/connection-status.ts` l.13, 54-56
**Apply to:** worker-connections.ts, worker decisions.ts pending map, pixel-office ceo-queue.ts.

### Append-only insert + dedup
**Source:** `apps/api/src/routes/events.ts` l.47-73
**Apply to:** decision route, resume route, hello-reconcile expiry inserts (all `visibility: "PRIVATE"` for `ceo.*`).

### Snapshot-then-relay (CR-03)
**Source:** `apps/api/src/routes/ws-browser.ts` l.36-60 + `browser-connections.ts`
**Apply to:** `/ceo/ws`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/web/src/components/ui/*`, `components/kibo-ui/*` | component | — | Generated by shadcn CLI; no shadcn in repo yet |
| `apps/web/src/ceo/CeoApp.tsx` (UI parts) | component | — | First forms/list UI; follow 06-UI-SPEC.md |
| `apps/web/src/ceo/ceo.css` | config | — | First Tailwind in repo |
| JWT verification inside `ceo-auth.ts` | middleware | — | No `jose` usage yet; use RESEARCH code example |

## Metadata

**Analog search scope:** apps/api/src, apps/worker/src, apps/web/src, packages/{claude-adapter,git-adapter,company-core,event-schema,pixel-office}/src, apps/api/drizzle, e2e, scripts
**Files scanned:** ~85 tracked
**Pattern extraction date:** 2026-09-24
