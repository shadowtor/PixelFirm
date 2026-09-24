# Phase 6: CEO Dashboard & Approval Workflow - Research

**Researched:** 2026-09-24
**Domain:** Human-in-the-loop approval over a live Claude Agent SDK session (parked `canUseTool`), control-plane → worker downlink, Cloudflare Access auth, private React dashboard, pixel-office CEO room
**Confidence:** MEDIUM-HIGH (architecture is grounded in files read this session; the SDK "park indefinitely" and hook-precedence behaviours are cited from official docs plus the installed `sdk.d.ts`, and still need one live proof)

## Summary

The locked design (CONTEXT D-01..D-12) is sound and the installed SDK supports it. `sdk.d.ts` for `@anthropic-ai/claude-agent-sdk@0.3.278` says "permission prompts have no park deadline", and the official user-input guide says "The callback can stay pending indefinitely". So holding the `canUseTool` promise open until the CEO decides is a supported path, not a hack. Approve returns `{ behavior: "allow", updatedInput: <the parked input> }`. Question answers go back as `updatedInput: { questions, answers }`, keyed by question text. Every other action returns `deny` with the typed-prefix message.

This research found five problems the CONTEXT does not mention. Each would break CEO-04 or the privacy wall:
1. **Allow rules shadow `canUseTool`.** The SDK loads project and local settings by default. An allow rule is checked *before* the callback. This repo's own `.claude/settings.local.json` allows `Bash(git push *)`, `Bash(git merge *)`, `Bash(pnpm add *)` and `mcp__coolify__deploy`. If the worker is pointed at a repo like this, a force-push or a Coolify deploy is approved without ever reaching `canUseTool`. **Fix:** a programmatic `PreToolUse` hook that returns `permissionDecision: "ask"` for every classified call. `ask` outranks `allow` in the SDK's precedence, so the call is forced back to the callback.
2. **`broadcastToBrowsers` relays every event verbatim to the office feed.** If the enriched `ceo.approval_requested` (title, context, tool input, diff) goes through `/events`, it reaches `/ws/browser` and the office canvas's WS frames. **Fix:** emit it as `visibility: "PRIVATE"` and skip PRIVATE events in the office relay. That one-line filter is also the first step of Phase 7.
3. **After a decision, nothing tells the office the agent stopped waiting.** Today `running` is never emitted as an event. The runtime must emit `task.status_changed: running` after applying a decision. On expiry the control plane must append `task.status_changed: blocked`. Otherwise the agent never leaves the CEO room.
4. **Parallel sibling tool calls.** One assistant message can hold several tool calls, and each gets its own `canUseTool` invocation. More than one decision can be parked per invocation, so watchdog suspension (D-03) must count parked calls rather than toggle a flag.
5. **Resume after a worker restart needs data the worker no longer has.** The runtime's `tasks` map is in-memory. D-02's "CEO re-triggers via `resumeTask`" only works if `sessionId`, `worktreePath` and `agentId` survive, so they must ride in the PRIVATE request event and come back down the downlink. The worker validates `worktreePath` against its own `listWorktrees()` before it uses the path.

**Primary recommendation:** Keep the parked promise inside `ClaudeCodeRuntime`, injected with a host-supplied `awaitDecision(decisionId, signal)`, so the runtime stays transport-agnostic. Add a `PreToolUse` "ask" hook that uses the same `classifySignal`. Make every `ceo.*` event PRIVATE and move office status only through the existing `task.status_changed`. Enforce "one CEO decision per request" with a partial unique index. Serve `/ceo` and `/ceo/api`/`/ceo/ws` from one origin behind a single path-scoped Cloudflare Access application, with `jose` verifying `Cf-Access-Jwt-Assertion`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Classify a tool call as CEO-gated | Worker (claude-adapter) | — | Only the worker sees the live tool call; `classifySignal` already lives there |
| Force gated calls past settings allow rules | Worker (claude-adapter `PreToolUse` hook) | — | Hooks run before permission rules; the control plane can't see settings files |
| Park and resolve the tool call (the actual gate) | Worker (claude-adapter `canUseTool`) | — | The SDK promise exists only in the worker process (D-01/D-02) |
| Collect diff/context for a request | Worker (git-adapter, read-only) | — | The control plane has no repo access (D-09, PROJECT.md) |
| Audit log (request / decision / applied / expired) | API / Backend | Database (append-only `events`) | The event log is the audit log (D-04); a DB unique index enforces one decision per request |
| Authenticate the CEO | CDN / Edge (Cloudflare Access) | API (JWT verify with `jose`) | Access gates the edge; the API must still verify the JWT (Cloudflare docs) |
| CSRF / Origin enforcement | API / Backend | — | Server-side header and Origin checks on POSTs and WS upgrades (D-12) |
| Route a decision to the right worker | API (worker WS downlink) | — | Worker identity comes from the authenticated connection, stamped server-side |
| Pending/history view | Browser (`/ceo`, lazy chunk) | API (`/ceo/ws` snapshot + relay) | Same snapshot-then-relay pattern as `/ws/browser` |
| Office waiting pose, CEO room walk | Browser (pixel-office) | — | Pure consumer of `AgentStatus`; never sees decision content |
| Office status transitions | API (existing `task.status_changed`) | Worker | Reuses the existing reducer path; no `ceo.*` event reaches the office |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Approval round-trip
- **D-01:** Hold the SDK `canUseTool` promise open until the CEO decides, instead of Phase 4's immediate deny. Approve → `allow` for the exact parked tool call (original input, plus `updatedInput.answers` for AskUserQuestion); every other action → `deny` with the CEO's message. No grant-matching or re-issue step exists, so nothing can be approved that the CEO did not see. The installed SDK (`packages/claude-adapter/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, CanUseTool doc) states permission prompts have no park deadline. — **Reversibility:** costly — the runtime, worker host, downlink message and dashboard all assume a live parked promise; switching to the SDK `defer` hook later means a resume loop plus decision re-delivery.
- **D-02:** Fail closed on worker restart / disconnect / abort: the pending promise lives only in worker memory, so any lost promise is resolved as deny (on abort) or recorded as an expired decision (event, e.g. `ceo.approval_expired`) on reconnect, and the task goes `blocked`. The CEO re-triggers via `resumeTask`. Never auto-approve, never try to rehydrate the promise.
- **D-03:** While a decision is pending, the D-04 silence watchdog in `claude-code-runtime.ts` is suspended for that invocation, and the `Notification`-hook path must not fire a duplicate `requestReview` for the same parked call.
- **D-04:** New durable events in the append-only log: request enriched with a `decisionId` (plus tool name/input summary, recommendation, links, diff reference), a `ceo.decision_made` (action, note, decider identity), and the expiry/closed event. These events are the audit log (CEO-05) — no separate audit table unless research finds a need.

#### Non-approve actions
- **D-05:** Reject, Request Changes, Request More Research and Discuss all `deny` the parked call with a typed-prefix message the agent reads as the tool result: `[CEO:REJECT]`, `[CEO:REQUEST_CHANGES]`, `[CEO:MORE_RESEARCH]`, `[CEO:DISCUSS] <note>`. The agent continues in the same turn. No `cancelTask` on Reject.
- **D-06:** Discuss = deny with `[CEO:DISCUSS]` instructing the agent to reply and ask again (AskUserQuestion); the follow-up request becomes a new decision grouped under the same `threadId` in the dashboard. No new AgentRuntime method.
- **D-07:** Note is required for Request Changes, Request More Research and Discuss; optional for Reject (one-click reject allowed).

#### Dashboard + CEO office
- **D-08:** Private `/ceo` view in `apps/web`, separate from the office canvas route so the canvas stays stream-capturable (Phase 7) and decision context/diffs never render on it. Path check in `main.tsx` is enough (no router dependency needed).
- **D-09:** The worker ships the diff (control plane has no repo access): changed-file list, numstat, and a capped unified diff (~64KB / ~400 lines) with a `truncated` flag. Diff/context data is treated as PRIVATE from day one.
- **D-10:** A walled CEO room is added to `packages/pixel-office/src/layout/office-layout.json` with a `ceoQueue` list of waiting-chair slots (same pattern as existing `standing`/`interaction` slots). Agents with `waiting_for_ceo` walk there via the Phase 5 walk/pathfinding system and hold the frozen pose + glyph (Phase 5 D-03). If the queue is full, overflow agents wait at their own desk with the glyph. After a decision the agent walks back to its desk. — **Reversibility:** costly — resizing the 20x11 grid can move existing desk/seat coordinates.

#### CEO action auth
- **D-11:** Cloudflare Access (one-user email/passkey policy) in front of pixelfirm.dev; the API verifies `Cf-Access-Jwt-Assertion` server-side (JWKS from the team's `cloudflareaccess.com/cdn-cgi/access/certs`, check `aud`/`iss`) using `jose`. The verified email is recorded as the decider in the audit event. `BROWSER_ACCESS_TOKEN` must NOT authorize decisions.
- **D-12:** CSRF: mutations require JSON body + a custom header (e.g. `X-PixelFirm-CSRF`) and a strict `Origin` allowlist on POSTs and the browser WS upgrade (Phase 2 research Pattern 5), not `@fastify/csrf-protection`. Origin must only be reachable through the Cloudflare tunnel so Access can't be bypassed. Local dev gets an explicit dev-only bypass flag that cannot be enabled in production.

### Claude's Discretion
- Exact event type names/payload shapes (additive to the discriminated union, appended, never reordered).
- Downlink message shape on the worker WS and how the worker hosts/launches `ClaudeCodeRuntime` tasks.
- Diff cap exact numbers, CEO room size/position, number of waiting chairs.
- Dashboard visual design (a `/gsd-ui-phase 6` UI-SPEC is appropriate — roadmap marks UI hint: yes).
- Whether the browser WS read feed also migrates from `?token=` to the Access cookie in this phase or Phase 7.

### Deferred Ideas (OUT OF SCOPE)
- Durable `defer`-hook approvals that survive worker restarts — revisit if CEO decisions routinely outlast worker uptime.

**Also locked by the approved `06-UI-SPEC.md`:** 24×13 grid growing right/down only, the CEO room tiles and `ceoQueue` slots `[[21, 8], [20, 6], [22, 6], [21, 4]]`, the scope-isolation rule (no Tailwind/shadcn/`ceo` chunk on the office route), the component inventory, the copy, and the Approve confirmation dialog for gated tool calls only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CEO-01 | A CEO office exists; agents requiring human input walk there and enter a visible waiting state | Pattern 7 (CEO room + queue in pixel-office); Pitfall 3 (emit `running` after a decision / `blocked` on expiry so the agent walks back); grid-resize pitfall (re-derive scale tests) |
| CEO-02 | A CEO dashboard lists pending decisions with title, context, the requesting agent's recommendation, and relevant links/diffs | Pattern 2 (enriched PRIVATE request payload); Pattern 5 (`readDiff` with `--no-ext-diff`); Pattern 6 (`/ceo/ws` snapshot + `foldDecisions`); Pattern 8 (lazy `/ceo` chunk) |
| CEO-03 | The CEO can Approve, Reject, Discuss, Request Changes, or Request More Research on each pending decision | Pattern 1 (parked `canUseTool` + `toPermissionResult`); Pattern 4 (decision route → downlink → worker resolves → `ceo.decision_applied`) |
| CEO-04 | No CEO-gated operation is ever auto-approved because an agent requested it | Pattern 1b (`PreToolUse` "ask" hook beats settings allow rules); worker never takes `updatedInput` from the wire; superseded/aborted invocations always deny; `ceo.decision_made` is not in the worker allowlist; widened gate list (Open Question 2) |
| CEO-05 | Every CEO approval/rejection is recorded in an audit log | Pattern 3 (event chain requested → decision_made → decision_applied / approval_expired); partial unique index; decider email from the verified Access JWT |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement:** file changes go through `/gsd-execute-phase` (or `/gsd-quick`/`/gsd-debug`). Do not edit the repo outside a GSD workflow.
- **Project stack skill (global CLAUDE.md, locked defaults):** Kibo UI (a shadcn registry) wherever a component exists; Coolify hosting; Cloudflare DNS/Tunnels/Access; Postgres. The `test.<domain>` branch sits behind Cloudflare Access. Ingress goes through Cloudflare Tunnel, never open origin ports. Use the Cloudflare API/MCP for Access policies. The planner should automate Access app creation through the `cloudflare` skill rather than ask the developer to click through dashboards.
- **Vendor docs win:** prefer official docs over community examples, and flag conflicts (followed here: SDK docs + installed `sdk.d.ts`, Cloudflare's own JWT validation page).
- **Browser-test before human UAT:** any `/ceo` or office-canvas behaviour must be driven through Playwright before a human checkpoint.
- **Deploy staging preference (memory):** use the coolify/cloudflare skills and the tunnel, and test the branch + domain before main.
- **TDD red evidence (memory):** `gsd_run check tdd-red-evidence` false-fails on Vitest. Transcribe RED counters manually.
- **Live harness shot path (memory):** the live harness refuses in-repo screenshot dirs on purpose. Keep that behaviour for any new live proof.
- **Established repo conventions (from STATE.md decisions):** function-first factories (no classes); discriminated-union members appended, never reordered; payloads are plain `z.object()` (unknown keys stripped); identity from the authenticated connection, never payload; `ponytail:` comments on deliberate ceilings; ESM test files set `process.env` and then use dynamic `import()` for env-dependent modules; tests assert properties by equality, not absence.

## Standard Stack

### Core (already installed, reuse)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | 0.3.278 [VERIFIED: packages/claude-adapter/node_modules/.../package.json] | `canUseTool` park, `PreToolUse` hook | Already the runtime; D-01 relies on it |
| `fastify` + `@fastify/websocket` + `@fastify/rate-limit` | ^5.12.5 / ^11.3.0 / ^11.2.0 [VERIFIED: apps/api/package.json] | Decision route, `/ceo/ws`, worker downlink on `/ws` | Existing API stack |
| `drizzle-orm` + `pg` | ^0.45.2 / ^8.23.0 [VERIFIED: apps/api/package.json] | Event inserts, unique-index conflict handling | Existing |
| `zod` | ^4.6.5 [VERIFIED: apps/api/package.json] | Payload + decision-body validation with length caps | Existing |
| `ws` | ^8.21.3 [VERIFIED: apps/worker/package.json] | Worker downlink `message` handler | Existing |
| `execa` | ^10.0.1 [VERIFIED: packages/git-adapter/package.json] | `git diff` read-only, array args | Existing git-adapter pattern |
| `vitest` / `@playwright/test` | ^5.0.1 / ^1.63.0 [VERIFIED: root package.json] | Unit/integration + e2e | Existing |

### New
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jose` (apps/api) | 6.2.12 latest [VERIFIED: npm view jose version] | `createRemoteJWKSet` + `jwtVerify` for `Cf-Access-Jwt-Assertion` | D-11. It's the library Cloudflare's own Node example uses [CITED: developers.cloudflare.com/.../validating-json/] |
| `tailwindcss` + `@tailwindcss/vite` (apps/web) | 4.3.3 [VERIFIED: npm view] | Scoped CSS for the `/ceo` chunk only | UI-SPEC |
| shadcn CLI `shadcn@4.21.0` (one-off `npx`) + its generated deps: `radix-ui` 1.6.7, `lucide-react` 1.47.0, `sonner` 2.0.8, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `tw-animate-css` 1.4.0 | [VERIFIED: npm view, 2026-09-24] | Components in the UI-SPEC inventory + Kibo `choicebox`/`status` | UI-SPEC (locked). Install via `shadcn add`, not by hand |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parked `canUseTool` | `PreToolUse` `defer` + resume | Rejected by D-01; deferred idea |
| Parking inside a `PreToolUse` hook | — | **Don't.** Hooks have a timeout (600 s default for PreToolUse) and a timed-out PreToolUse skips the tool [CITED: code.claude.com/docs/en/agent-sdk/hooks#hook-timeout]. Use the hook only to return `ask`; park in `canUseTool` |
| New `ceo.decision_requested` type | Extend `ceo.approval_requested` with optional fields | Either is additive. Extending matches D-04's "request enriched with a decisionId" and keeps the Phase 4 reducer handler. New fields **must be optional**, because stored Phase 4 rows are re-validated by `rowToCompanyEvent` on every snapshot |
| GET `/ceo/api/decisions` snapshot + WS live | Snapshot sent inside `/ceo/ws` | The in-WS snapshot reuses `/ws/browser`'s proven register-before-SELECT buffer (CR-03), so there's no gap between the snapshot and live events. Keep one tiny `GET /ceo/api/me` so 401/403 is observable (a failed WS upgrade is opaque in browsers) |
| `@testing-library/react` + jsdom | Pure-function tests + Playwright | Nothing in the repo uses a DOM test env today (`App.test.tsx` uses static markup). Test decision logic as pure functions and drive DOM behaviour through Playwright. No new test deps |
| `@fastify/static` to serve `/ceo` | Coolify/Traefik path routing or a Vite dev proxy | Open Question 1 |

**Installation:**
```bash
pnpm --filter api add jose
# UI (per 06-UI-SPEC.md; run from repo root):
npx shadcn@4.21.0 init --base radix --css-variables --no-rtl --pointer --no-monorepo -c apps/web
pnpm --filter web add -D tailwindcss @tailwindcss/vite
npx shadcn@4.21.0 add button badge textarea field label radio-group checkbox tabs scroll-area collapsible alert alert-dialog table skeleton empty separator spinner sonner -c apps/web
npx shadcn@4.21.0 add https://www.kibo-ui.com/r/choicebox.json https://www.kibo-ui.com/r/status.json -c apps/web
```
Note: `pnpm` via the global shim was blocked by Device Guard in this research shell. `npx --yes pnpm@12.4.2 …` works (Environment Availability).

## Package Legitimacy Audit

Seam: `gsd-tools query package-legitimacy check --ecosystem npm …` run 2026-09-24.

| Package | Registry | Latest published | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `jose` | npm | 2026-09-05 (6.2.12) | 94.5M/wk | github.com/panva/jose | SUS (`too-new`: latest release only) | Flagged. Planner adds `checkpoint:human-verify` before install, or pins `6.2.10` (2026-08-21) |
| `shadcn` (CLI via npx) | npm | 2026-09-04 (4.21.0) | 6.7M/wk | github.com/shadcn-ui/ui | SUS (`too-new`) | Flagged. Version already locked by UI-SPEC; checkpoint before init |
| `lucide-react` | npm | 2026-09-17 (1.47.0) | 77.2M/wk | github.com/lucide-icons/lucide | SUS (`too-new`) | Flagged. Checkpoint (pulled in by shadcn init) |
| `tailwind-merge` | npm | 2026-09-12 (3.7.0) | 61.7M/wk | github.com/dcastil/tailwind-merge | SUS (`too-new`) | Flagged. Checkpoint (pulled in by shadcn init) |
| `tailwindcss` | npm | 2026-07-16 | 95.6M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| `@tailwindcss/vite` | npm | 2026-07-16 | 35.1M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| `radix-ui` | npm | 2026-07-24 | 9.8M/wk | github.com/radix-ui/primitives | OK | Approved |
| `sonner` | npm | 2026-08-09 | 37.9M/wk | github.com/emilkowalski/sonner | OK | Approved |
| `class-variance-authority` | npm | 2024-11-26 | 48.0M/wk | github.com/joe-bell/cva | OK | Approved |
| `clsx` | npm | 2024-04-23 | 90.3M/wk | github.com/lukeed/clsx | OK | Approved |
| `tw-animate-css` | npm | 2025-09-24 | 29.1M/wk | github.com/Wombosvideo/tw-animate-css | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `jose`, `shadcn`, `lucide-react`, `tailwind-merge`. The only reason is `too-new`: each latest release is under ~3 weeks old, while each package has tens of millions of weekly downloads and a canonical repo. The planner inserts one `checkpoint:human-verify` before the install wave (or pins to the prior minor). `npm view jose scripts.postinstall` returned nothing.
**Provenance:** `jose` is named in Cloudflare's official Access JWT page [CITED]. The UI packages are the ones shadcn's own init generates (UI-SPEC). Kibo `choicebox`/`status` were vetted by the UI-SPEC Registry Safety gate, and the executor re-runs `npx shadcn view` after init.

## Architecture Patterns

### System Architecture Diagram

```
 Claude Code session (worker process, user's workstation)
   tool call ──► [PreToolUse hook] classifySignal? ──yes──► permissionDecision:"ask" (beats settings allow rules)
                        │ no → normal flow (allow rules / canUseTool → allow)
                        ▼
                 [canUseTool] classifySignal? ── no ──► allow(input)
                        │ yes
                        ▼
      decisionId=uuid, threadId, readDiff(worktree) ─► POST /events  ceo.approval_requested (PRIVATE)
      emit task.status_changed waiting_for_review (INTERNAL) ─────────► office: WAITING_FOR_CEO → walk to CEO room
      watchdog suspended (parked++)                                     
      await awaitDecision(decisionId, signal)  ◄──── worker WS downlink {type:"decision", …}
                        │                                   ▲
                        ▼                                   │
      toPermissionResult(decision, parkedInput)             │
      allow(parkedInput | {questions, answers}) or deny("[CEO:…] note")
      emit task.status_changed running ─► office: walk back to desk
      POST /events ceo.decision_applied (PRIVATE)

 Control plane (apps/api)
   /events ──► stamp payload.workerId = request.workerId ──► INSERT events ──► relay:
                 office sockets: visibility !== PRIVATE      CEO sockets: type startsWith "ceo."
   /ws (worker) ◄─► hello{bootId} → reconcile: expire open decisions with other bootId
                                   (+ append task.status_changed blocked) ; redeliver decided-not-applied
   /ceo/ws  [Origin ✓, Access JWT ✓] ──► snapshot foldDecisions(ceo.* rows) then live ceo.* relay
   POST /ceo/api/decisions/:id [Origin ✓, X-PixelFirm-CSRF ✓, JSON ✓, Access JWT ✓, zod ✓]
        worker socket open? no → 503 (agent still waiting)
        INSERT ceo.decision_made (unique per decisionId → 409 on repeat) ─► send downlink to that worker
   POST /ceo/api/tasks/:taskId/resume  (same guards) → ceo.task_resume_requested → downlink task.resume

 Browser
   /        office canvas (unchanged bundle; never receives PRIVATE events)
   /ceo     lazy CeoApp chunk + Tailwind CSS: GET /ceo/api/me → /ceo/ws → queue/detail/actions/history
 Edge: Cloudflare Access app scoped to /ceo* paths → Tunnel → Traefik → API/web
```

### Recommended Project Structure (new/changed files only)
```
packages/event-schema/src/payloads/index.ts   # extend ceo.approval_requested (optional fields); append 4 ceo.* members
packages/company-core/src/decisions.ts        # pure foldDecisions(events) → {pending, history}; NOT wired into reduce()
packages/claude-adapter/src/
  claude-code-runtime.ts                      # parked canUseTool, PreToolUse ask hook, watchdog count, restoreTask
  decision-mapping.ts                         # pure toPermissionResult + validateAnswers + CEO prefixes
  signal-detection.ts                         # (optional) widen gate list, gate mcp__*
packages/git-adapter/src/diff.ts              # readDiff(worktreePath, caps) — read-only, --no-ext-diff --no-textconv
packages/pixel-office/src/
  constants.ts                                # DEFAULT_COLS 24, DEFAULT_ROWS 13
  layout/office-layout.json                   # 24x13 tiles, CEO room furniture, "ceoQueue"
  layout/officeLayout.ts                      # CEO_QUEUE_SLOTS export + load-time validation
  ceo/ceo-queue.ts                            # slot assignment / walk in / walk home (sibling of handoff/)
apps/api/src/
  auth/ceo-auth.ts                            # verifyAccessJwt + requireCeo preValidation + dev bypass
  auth/csrf.ts                                # Origin allowlist + X-PixelFirm-CSRF check
  ws/worker-connections.ts                    # workerId → socket registry, sendToWorker()
  ws/browser-connections.ts                   # add per-socket filter (office vs ceo)
  routes/ceo.ts                               # GET /ceo/api/me, POST decisions, POST resume, /ceo/ws
  routes/ws.ts                                # hello handling, reconcile, redeliver
  routes/events.ts                            # allowlist += applied/expired; stamp workerId; PRIVATE filter
  drizzle/0004_ceo_decision_once.sql          # partial unique index
apps/worker/src/
  index.ts                                    # host createClaudeCodeRuntime; optional env-launched task
  decisions.ts                                # pending map, downlink handler, hello
apps/web/src/
  main.tsx                                    # path check → import("./ceo/CeoApp")
  ceo/CeoApp.tsx, ceo/ceo.css, ceo/*          # dashboard (Tailwind only here)
  components/ui/*, components/kibo-ui/*       # shadcn/Kibo generated
e2e/ceo-dashboard.spec.ts                     # Playwright against local dev (dev bypass + fake worker)
scripts/verify-ceo-approval-live.mjs          # live proof with a real ClaudeCodeRuntime
```

### Pattern 1: Parked `canUseTool` with an injected decision source
**What:** The runtime parks the call and awaits a host-supplied function. The worker owns the transport. The runtime never parses network input.
**When to use:** Every classified signal (`clarifying_question` or `ceo_gated_tool`).
```typescript
// Source: installed sdk.d.ts CanUseTool (l.203-297), PermissionResult (l.2405-2417);
// code.claude.com/docs/en/agent-sdk/user-input
canUseTool: async (toolName, input, { signal, toolUseID }) => {
  if (!isCurrent()) return { behavior: "deny", message: `Invocation superseded for task ${taskId} — tool call refused.` };
  const cls = classifySignal(toolName, input);
  if (!cls) return { behavior: "allow", updatedInput: input };
  if (!options.awaitDecision) {                      // Phase 4 behaviour when no host is wired (tests, demo)
    await requestReview(taskId, cls.reason);
    return { behavior: "deny", message: "Escalated to CEO — no decision channel configured." };
  }
  const parked = { decisionId: randomUUID(), toolName, input, toolUseID, kind: cls.kind };
  parkedCount++;                                     // D-03: watchdog onTimeout returns early while > 0
  try {
    await emitDecisionRequest(taskId, parked, cls);  // task.status_changed waiting_for_review + PRIVATE ceo.approval_requested
    const decision = await options.awaitDecision(parked.decisionId, signal); // rejects/deny-resolves on abort
    if (!isCurrent()) return { behavior: "deny", message: "Invocation superseded — CEO decision not applied." };
    const result = toPermissionResult(decision, parked); // pure; approve returns parked.input, never wire input
    record.status = "running";
    await emitStatus(taskId, "running");            // office leaves WAITING_FOR_CEO (Pitfall 3)
    await emitDecisionApplied(taskId, parked.decisionId, decision.action);
    return result;
  } finally {
    parkedCount--;
    watchdog.reset();
  }
},
```
The `Notification` hook gets `if (parkedCount > 0) return {};` before `requestReview` (D-03 no duplicate). The watchdog callback gets `if (parkedCount > 0) return;` as its first line. `parkedCount` is per invocation (declared inside `runQuery`), so a superseded invocation's counter can't suspend the successor's watchdog.

### Pattern 1b: `PreToolUse` "ask" hook, the CEO-04 backstop
**What:** A programmatic hook that forces every classified call to the callback, even when a settings allow rule matches.
**Why:** "Auto-approved tools never reach `canUseTool`" and settings allow rules are read by default; "When multiple hooks or permission rules apply, `deny` takes priority over `defer`, which takes priority over `ask`, which takes priority over `allow`" [CITED: code.claude.com/docs/en/agent-sdk/permissions; …/hooks].
```typescript
// Source: code.claude.com/docs/en/agent-sdk/hooks (TS PreToolUse example, adapted)
hooks: {
  PreToolUse: [{ hooks: [async (hookInput) => {
    const pre = hookInput as { tool_name: string; tool_input: unknown };
    if (!classifySignal(pre.tool_name, pre.tool_input)) return {};
    return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask",
             permissionDecisionReason: "CEO-gated: requires an explicit CEO decision" } };
  }] }],
  Notification: [ /* existing, plus parkedCount guard */ ],
},
```
Only a live test can prove that "ask" reaches `canUseTool` in SDK mode (Assumption A1). The live proof must run in a temp repo whose `.claude/settings.local.json` allow-lists the probe command.

### Pattern 2: Event payloads (additive; discretion within D-04)
Existing line to extend [VERIFIED: packages/event-schema/src/payloads/index.ts:19]:
`const CeoApprovalRequestedPayload = z.object({ taskId: z.string(), reason: z.string() });`

Recommended shape. Every new field is optional so Phase 4 rows still parse. Caps apply at the trust boundary:
```typescript
const s = (max: number) => z.string().max(max);
const CeoApprovalRequestedPayload = z.object({
  taskId: z.string(),
  reason: z.string(),
  // Phase 6 additions — optional: stored Phase 4 rows carry only {taskId, reason}
  decisionId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  kind: z.enum(["clarifying_question", "ceo_gated_tool"]).optional(), // = ClassifiedSignal["kind"]
  toolName: s(200).optional(),
  toolInput: s(16_000).optional(),          // JSON.stringify of the exact parked input (display only)
  questions: z.array(z.object({ question: s(2000), header: s(64), multiSelect: z.boolean(),
    options: z.array(z.object({ label: s(500), description: s(2000), preview: s(16_000).optional() })).max(4) })).max(4).optional(),
  title: s(300).optional(), context: s(8000).optional(), recommendation: s(4000).optional(),
  links: z.array(s(2000)).max(10).optional(),
  diff: z.object({ files: z.array(z.object({ path: s(1000), added: z.number().int(), removed: z.number().int() })).max(500),
    unified: s(65_536), truncated: z.boolean(), totalAdded: z.number().int(), totalRemoved: z.number().int() }).optional(),
  sessionId: s(200).optional(), worktreePath: s(1000).optional(),   // for resume after restart (Pattern 4)
  workerBootId: z.string().uuid().optional(),
  workerId: s(200).optional(),              // STAMPED by apps/api from request.workerId, never trusted from body
});
const CeoDecisionMadePayload = z.object({ decisionId: z.string().uuid(), taskId: z.string(),
  action: z.enum(["approve", "reject", "request_changes", "more_research", "discuss"]),
  note: s(4000).optional(), answers: z.record(s(2000), s(2000)).optional(), decidedBy: z.string().email() });
const CeoDecisionAppliedPayload = z.object({ decisionId: z.string().uuid(), taskId: z.string(), action: /* same enum */ });
const CeoApprovalExpiredPayload = z.object({ decisionId: z.string().uuid(), taskId: z.string(),
  reason: z.enum(["worker_restarted", "aborted", "superseded"]) });
const CeoTaskResumeRequestedPayload = z.object({ taskId: z.string(), decidedBy: z.string().email() });
// append (never reorder) after "agent.handoff_completed" in CompanyEventSchema
```
The `kind` values quote `ClassifiedSignal` verbatim [VERIFIED: packages/claude-adapter/src/signal-detection.ts:15-18: `kind: "clarifying_question" | "ceo_gated_tool";`]. **Visibility:** every `ceo.*` event is `"PRIVATE"` (the enum is `["PRIVATE", "INTERNAL", "STREAM_SAFE", "PUBLIC"]` [VERIFIED: packages/event-schema/src/envelope.ts:3]).

The reducer needs **no new handler.** The existing `ceo.approval_requested` handler only sets `task.status = "awaiting_approval"`. Office status moves through `task.status_changed`, whose status enum already has `"running"`, `"blocked"` and `"waiting_for_review"` [VERIFIED: packages/event-schema/src/payloads/index.ts:40-53]. Guard test: `JSON.stringify(fold(eventsWithPrivateCeoPayloads))` contains none of the private strings.

### Pattern 3: One decision per request, enforced in the database
```sql
-- apps/api/drizzle/0004_ceo_decision_once.sql
CREATE UNIQUE INDEX IF NOT EXISTS events_ceo_decision_once
  ON events ((payload->>'decisionId'), type)
  WHERE type IN ('ceo.decision_made', 'ceo.approval_expired', 'ceo.decision_applied');
```
The decision route inserts with a bare `.onConflictDoNothing()` (no `target`) and maps 0 returned rows to **409**. `/events` currently uses `.onConflictDoNothing({ target: events.id })` [VERIFIED: apps/api/src/routes/events.ts:63]. A conflict on this *new* index would raise 23505 and surface as a 500, so switch `/events` to a bare `.onConflictDoNothing()` too (this covers a duplicate `decision_applied`/`approval_expired` from a worker retry). `scripts/migrate.mjs` applies every `.sql` in order and skips `42P07`, so no journal entry is needed (0003 has none either).

### Pattern 4: Downlink, hello, reconcile (discretion: message shape)
- Worker registry `workerId → socket` in a new `ws/worker-connections.ts`, next to `connection-status.ts`.
- Worker → API on open: `{ type: "hello", bootId }`. `bootId` is `randomUUID()` per worker process, and the worker also puts it in every request payload.
- API on hello: (a) for each open request (no `decision_made`/`expired`) stamped with this `workerId` and a **different** `workerBootId`: append `ceo.approval_expired {reason:"worker_restarted"}` **and** `task.status_changed {status:"blocked"}` with `sourceAgentId` = the request's agent. This is D-02, and the second event makes the office agent leave the room (Pitfall 3). (b) For requests with the **same** bootId that have `decision_made` but no `decision_applied`: resend the decision. The worker's single-resolve map makes this idempotent.
- API → worker: `{ type: "decision", decisionId, action, note?, answers? }` and `{ type: "task.resume", taskId, sessionId, worktreePath, agentId }`. A closed set: the worker ignores any other `type`. There is no "start task with prompt" command, which keeps SEC-03 intact.
- The worker validates `answers` against the **parked** questions (every key is one of the parked question texts, every question is answered, values are non-empty strings) and denies on mismatch. `worktreePath` for `task.resume` must equal a path from `listWorktrees(repoPath)` (git-adapter, existing).
- The decision route checks `getConnectionStatus`/socket open **before** appending. If offline it returns 503 and appends nothing, so the agent keeps waiting and the UI shows "Decision not sent … The agent is still waiting."

### Pattern 5: `readDiff`, read-only and hardened
```typescript
// packages/git-adapter/src/diff.ts — execa array args (T-03-05 pattern), no mutating subcommand
const BASE_ARGS = ["--no-ext-diff", "--no-textconv", "--no-color"]; // repo config can't run external diff drivers
// base: merge-base with @{upstream} when one exists (what a push would send + uncommitted), else HEAD
await execa("git", ["diff", ...BASE_ARGS, "--numstat", base], { cwd: worktreePath });
await execa("git", ["diff", ...BASE_ARGS, base], { cwd: worktreePath, maxBuffer: 8 * 1024 * 1024 });
// cap to 400 lines / 64 KiB, set truncated, keep full numstat totals
```
`no-mutating-git.test.ts` scans every non-test `.ts` in `git-adapter/src` for quoted `merge`/`rebase`/`--force`/`-D`/`checkout`, so `diff.ts` is covered automatically. Untracked files don't appear in `git diff`. Accept that and mention it in the "No diff" copy only if it matters.

### Pattern 6: `/ceo/ws` snapshot + relay (reuse the CR-03 buffering)
Generalise `browser-connections.ts` to hold a per-socket filter: `registerBrowserSocket(socket, accepts)`. Office sockets use `e => e.visibility !== "PRIVATE"`. CEO sockets use `e => e.type.startsWith("ceo.")`. Keep register → SELECT → send snapshot → flush. The CEO snapshot is `foldDecisions(rows where type like 'ceo.%')`. The client applies the same `foldDecisions` step per live event: the Phase 5 "same code for snapshot and live" rule (05-09).

### Pattern 7: CEO room queue (pixel-office)
- `constants.ts`: `DEFAULT_COLS = 24`, `DEFAULT_ROWS = 13` (currently `20`/`11` [VERIFIED: packages/pixel-office/src/constants.ts:15-16]). The `officeLayout.ts` load check already throws if the tiles don't match the constants.
- `office-layout.json` gets `"ceoQueue": [[21, 8], [20, 6], [22, 6], [21, 4]]` (UI-SPEC, locked) next to the existing `"seats"`, `"standing"` and `"interaction"` keys [VERIFIED: packages/pixel-office/src/layout/office-layout.json].
- `ceo/ceo-queue.ts` is called from `upsertCharacterFromAgent` when the status crosses into or out of `"waiting_for_ceo"` [VERIFIED: packages/event-schema/src/agent-status.ts:20 `WAITING_FOR_CEO: "waiting_for_ceo",`]. Keep `occupant: Map<agentId, slotIndex>`. On entry, take the lowest free slot and `walkCharacterTo(ch, slot, getTileMap(), blockedTilesFor(ch, slot))`, reusing the handoff module's exported `blockedTilesFor`. On exit, release the slot and walk home. No shuffling. Overflow: no walk.
- Arrival facing: `characters.ts` WALK-end currently faces DOWN only at the seat. Extend that condition to "or a `ceoQueue` slot".
- The status visual stays as is: `[AgentStatus.WAITING_FOR_CEO]: { pose: CharacterState.IDLE, bubble: "permission", frozen: true }` [VERIFIED: packages/pixel-office/src/status/status-mapping.ts:43]. Frozen holds only the frame during the walk (05-17), so the glyph shows while walking, as the UI-SPEC requires.

### Pattern 8: `/ceo` lazy route (D-08, UI-SPEC scope isolation)
```tsx
// apps/web/src/main.tsx
const root = createRoot(rootElement);
if (location.pathname === "/ceo" || location.pathname.startsWith("/ceo/")) {
  import("./ceo/CeoApp").then(({ CeoApp }) => root.render(<StrictMode><CeoApp /></StrictMode>));
} else {
  root.render(<StrictMode><App /></StrictMode>);
}
```
`ceo/ceo.css` (`@import "tailwindcss"` plus theme vars) is imported only from `ceo/CeoApp.tsx`. Vite emits it with the async chunk (A5; asserted by a build-manifest test). Dev: `vite.config.ts` `server.proxy` for `/ceo/api` → `http://localhost:3000` and `/ceo/ws` → `{ target: "ws://localhost:3000", ws: true }`, so the browser stays same-origin and CORS never enters.

### Anti-Patterns to Avoid
- **Approving with input from the wire:** approve must return `parked.input` (or the parked `questions` plus validated answers). Never an `updatedInput` from the downlink or the API. That is D-01's "nothing can be approved that the CEO did not see".
- **Putting decisions in `ProjectionState`:** `/ws/browser` sends the full `ProjectionState` snapshot to the office. Keep `foldDecisions` separate and out of `reduce()`.
- **Parking in a hook:** see Alternatives.
- **Letting the worker author `ceo.decision_made`:** it must never enter `WORKER_ALLOWED_EVENT_TYPES`. Add only `ceo.decision_applied` and `ceo.approval_expired`, which are fail-closed and can't grant anything.
- **`dangerouslySetInnerHTML` or a markdown renderer for agent text or AskUserQuestion `preview`:** render as text / `<pre>` (UI-SPEC). HTML previews only exist when `toolConfig.askUserQuestion.previewFormat: "html"` is set, so don't set it.
- **Using `request.ip` for the dev-bypass loopback check:** `trustProxy: true` makes it follow `X-Forwarded-For`. Use `request.socket.remoteAddress`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signature/claims/JWKS rotation | Manual RS256 verify, a cert cache | `jose` `createRemoteJWKSet` + `jwtVerify({issuer, audience})` | Key rotation, `kid` selection, clock skew, alg confusion |
| "One decision per request" | App-level check-then-insert | Partial unique index + `onConflictDoNothing` | Two concurrent POSTs race; the DB is the only real serializer |
| Tool-call interception | Regex over transcript / killing the process | SDK `canUseTool` + `PreToolUse` `ask` | Only the SDK knows the exact call and can resume it |
| Pathfinding to the CEO room | New walker | `walkCharacterTo` + `blockedTilesFor` (Phase 5) | Occupancy/furniture rules are already tested |
| Snapshot/live race | New pub-sub | `browser-connections.ts` register-before-SELECT buffer | CR-03 already solved it |
| Relative time, radio cards, toasts | Custom | `Intl.RelativeTimeFormat`, Kibo `choicebox`, shadcn `sonner` | UI-SPEC inventory |
| CORS for dev | `@fastify/cors` | Vite `server.proxy` | `server.ts` explicitly forbids a CORS plugin (SEC-04 posture) |

**Key insight:** the safety property is structural (the SDK won't run the call until the promise resolves, and only the worker holds it). Everything else (the dashboard, the downlink, auth) can fail, and the failure mode is "the agent keeps waiting or gets denied", never "it ran".

## Common Pitfalls

### Pitfall 1: Settings allow rules silently bypass the gate (CEO-04)
**What goes wrong:** A gated `git push --force` or `mcp__coolify__deploy` runs with no CEO decision.
**Why:** The permission order is hooks → deny → ask → mode → **allow rules** → `canUseTool`. Project/local settings are loaded by default [CITED: code.claude.com/docs/en/agent-sdk/permissions]. This repo's own `.claude/settings.local.json` allows `"Bash(git push *)"`, `"Bash(git merge *)"`, `"Bash(pnpm add *)"`, `"mcp__coolify__deploy"` [VERIFIED: .claude/settings.local.json:5,9,11,17]. Read-only Bash can also be self-approved at the allow step.
**How to avoid:** Pattern 1b's `PreToolUse` "ask" hook. Do **not** remove `"user"` from `settingSources`: the GSD slash commands the Phase 4 demo ran (`/gsd-discuss-phase 1`) come from `~/.claude`.
**Warning signs:** A live test where a temp repo allow-lists the probe command and the command runs without a `ceo.approval_requested`.

### Pitfall 2: PRIVATE decision content reaches the office WS
**What goes wrong:** Title, context and diff appear in `/ws/browser` frames. That breaks D-08/D-09 and the UI-SPEC privacy backstop.
**Why:** `broadcastToBrowsers({ type: "event", event })` relays every inserted event [VERIFIED: apps/api/src/routes/events.ts:86].
**How to avoid:** The per-socket filter (Pattern 6), plus a test that posts a PRIVATE `ceo.approval_requested` and asserts the office socket receives nothing while the CEO socket receives it.

### Pitfall 3: The agent never leaves the CEO room
**What goes wrong:** After Approve, the office still shows WAITING_FOR_CEO. After a worker restart, the agent waits forever.
**Why:** `runQuery` sets `record.status = "running"` in memory only (no event) [VERIFIED: claude-code-runtime.ts:319-324]. The Phase 4 demo event list goes `waiting_for_review` → `completed` with nothing in between.
**How to avoid:** Emit `task.status_changed running` after applying a decision. The control plane appends `task.status_changed blocked` on expiry.

### Pitfall 4: The watchdog kills a parked session
**What goes wrong:** At 100 s of CEO think-time the watchdog fires `attemptGracefulStop` → abort → `blocked`.
**Why:** `DEFAULT_WATCHDOG_TIMEOUT_MS = 100_000` [VERIFIED: watchdog.ts:10], and no messages arrive while parked.
**How to avoid:** The `parkedCount` guard in `onTimeout`, plus `watchdog.reset()` on resolve. The live proof must hold a decision for **more than 120 s**, which proves both D-03 and "no park deadline".

### Pitfall 5: Superseded or aborted invocations approve anyway
**What goes wrong:** The CEO approves after `pauseTask`/`cancelTask`/`sendMessage` has claimed a new `currentRun` token, and the old stream's tool runs.
**How to avoid:** Re-check `isCurrent()` **after** the await and deny if false. On `signal` abort, resolve deny and emit `ceo.approval_expired {reason:"aborted"}`. Unit-test both with the existing `pausableQuery`/`hangingQuery` fakes in `claude-code-runtime.test.ts`.

### Pitfall 6: A Cloudflare Access scope that breaks the worker, or that can be bypassed
**What goes wrong:** An Access app on the whole hostname 302s the worker's `/events` and `/ws` calls (no Access cookie). Or the origin is reachable around the tunnel.
**How to avoid:** Scope the Access application to the `/ceo` path prefix only (UI + `/ceo/api` + `/ceo/ws`). Still verify the JWT in the API: Cloudflare says "Validation of the header alone is not sufficient — the JWT and signature must be confirmed" [CITED: developers.cloudflare.com search result, Validate JWTs]. Optionally turn on the tunnel origin setting that makes `cloudflared` require the Access JWT [CITED: developers.cloudflare.com …/cloudflared-parameters/origin-parameters/]. Reject tokens with no `email` claim (service tokens), and match `email` against a `CEO_EMAIL` env value.

### Pitfall 7: The dev bypass ships to production
**How to avoid:** Three guards, each small. (1) The env schema throws at boot if `CEO_DEV_AUTH_BYPASS` is on and `NODE_ENV === "production"`. (2) Add `ENV NODE_ENV=production` to `apps/api/Dockerfile`, which sets no `NODE_ENV` today [VERIFIED: apps/api/Dockerfile]. (3) Honour the bypass only when `request.socket.remoteAddress` is loopback. The UI shows the dev-bypass banner (UI-SPEC).

### Pitfall 8: Secrets in logs
**What goes wrong:** The Access JWT and `CF_Authorization` cookie get logged on every request.
**How to avoid:** Extend the logger `redact` [VERIFIED: apps/api/src/server.ts:21 `redact: ["req.headers.authorization", "req.headers['x-bootstrap-secret']"]`] with `"req.headers['cf-access-jwt-assertion']"` and `"req.headers.cookie"`. (The existing `?token=` query-string logging is a Phase 5 STATE blocker. Fixing the office feed stays Phase 7, but `/ceo/ws` must not use query tokens.)

### Pitfall 9: The grid resize breaks scale tests
**What goes wrong:** These fail once the grid is 24 × 13 (384 × 208): `App.test.tsx` expects `displayScaleFor(1280, 720) === 4` and `(1920, 1080) === 6`; `index.test.ts` has cases like `[1920, 1056, 6]` and `[3840, 2136, 12]`; `renderer.test.ts:1053,1067` pass the literals `320, 176`.
**How to avoid:** Re-derive every expected value from `DEFAULT_COLS * TILE_SIZE` (for example, 1920 × 1080 becomes 5 and 1280 × 720 becomes 3), per the UI-SPEC. The live harness already reads engine data.

### Pitfall 10: `git diff` runs repo-configured programs
**Why:** `diff.external` and `.gitattributes` textconv drivers run arbitrary commands.
**How to avoid:** Always pass `--no-ext-diff --no-textconv` (Pattern 5).

### Pitfall 11: Env leakage into the subprocess (open Phase 5 blocker)
`claude-code-runtime.ts:189` strips only `ANTHROPIC_API_KEY`. Phase 6 is the first time the worker runs the runtime for real, so the security blocker in STATE.md becomes live. Also strip `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY_HELPER`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, and `CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS`. The last one is a dialog deadline override [VERIFIED: sdk.d.ts:8609, which documents it as remote-client only]; stripping it is cheap insurance.

## Code Examples

### Pure decision → PermissionResult mapping
```typescript
// packages/claude-adapter/src/decision-mapping.ts
// PermissionResult shape: sdk.d.ts l.2405-2417; answers keyed by question text
// (code.claude.com/docs/en/agent-sdk/user-input "Return answers to Claude")
const PREFIX = { reject: "[CEO:REJECT]", request_changes: "[CEO:REQUEST_CHANGES]",
  more_research: "[CEO:MORE_RESEARCH]", discuss: "[CEO:DISCUSS]" } as const;
export function toPermissionResult(d: Decision, p: Parked): PermissionResult {
  if (d.action === "approve") {
    if (p.toolName !== "AskUserQuestion") return { behavior: "allow", updatedInput: p.input };
    const answers = validateAnswers(p.input.questions, d.answers); // throws → caller denies
    return { behavior: "allow", updatedInput: { questions: p.input.questions, answers } };
  }
  const note = d.note?.trim();
  return { behavior: "deny", message: note ? `${PREFIX[d.action]} ${note}` : PREFIX[d.action] };
}
```
Multi-select answers are the labels joined with `", "`. "Other" puts the CEO's text as the value [CITED: user-input doc]. The installed output type says "multi-select answers are comma-separated" [VERIFIED: sdk-tools.d.ts:3907-3911].

### Access JWT verification (testable without network)
```typescript
// apps/api/src/auth/ceo-auth.ts — Source: Cloudflare "Validate JWTs" Node example + jose docs
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export function makeAccessVerifier(teamDomain: string, aud: string, jwks?: JWTVerifyGetKey) {
  const keys = jwks ?? createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keys, { issuer: teamDomain, audience: aud, algorithms: ["RS256"] });
    if (typeof payload.email !== "string") throw new Error("no email claim");
    return payload.email.toLowerCase();
  };
}
// tests: generateKeyPair("RS256") + createLocalJWKSet + SignJWT → no network, no Cloudflare account
```

### CSRF/Origin guard (D-12)
```typescript
// POST: JSON only, custom header, exact Origin match. WS upgrade: Origin only (browsers can't set headers).
export function requireCsrf(req: FastifyRequest, reply: FastifyReply) {
  if (!env.CEO_ALLOWED_ORIGINS.includes(req.headers.origin ?? "")) return reply.code(403).send({ error: "forbidden" });
  if (req.method !== "GET" && (req.headers["x-pixelfirm-csrf"] !== "1" || !req.headers["content-type"]?.startsWith("application/json")))
    return reply.code(403).send({ error: "forbidden" });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 4: `canUseTool` always denies classified calls | Park until the CEO decides | This phase (D-01) | The runtime becomes the gate |
| An allow result had to include `updatedInput` | Optional since Claude Code v2.1.207 [CITED: user-input doc] | CLI 2.1.207 | Always pass it anyway (original input), because it is the "exact call" guarantee |
| PreToolUse hook timeout reported as a user rejection | Since v2.1.210, a tool result saying the hook timed out; the turn continues [CITED: hooks doc] | CLI 2.1.210 | Another reason not to park in hooks |
| TS SDK `canUseTool` shadowing was silent | SDK emits `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` for bypass mode / bare `allowedTools` only, and **not** for settings-file rules [CITED: permissions doc] | recent | The warning won't catch Pitfall 1; the hook will |

Installed CLI: `claude --version` → `2.1.280 (Claude Code)`, above every version gate cited here.

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A programmatic `PreToolUse` hook returning `permissionDecision: "ask"` routes the call to `canUseTool` in SDK mode, even when a settings allow rule matches | Pattern 1b, Pitfall 1 | CEO-04 bypass stays open. Fallback: have the hook return `deny` for classified calls when no decision channel exists, and in canUseTool-less configs, park inside `canUseTool` only. Must be proven live before sign-off |
| A2 | With a **string** prompt (runQuery's current shape), the TS SDK keeps the control channel open so a `canUseTool` promise can stay parked for minutes (the Python docs need a streaming prompt + dummy hook) | Pattern 1 | Parked calls die. Fallback: switch `runQuery` to an async-iterable prompt. The live proof's >120 s hold settles it (Phase 4's demo proved only a short park) |
| A3 | Cloudflare Access forwards `Cf-Access-Jwt-Assertion` on WebSocket upgrade requests (docs say "for all L7 requests") | Pattern 6 | `/ceo/ws` auth fails. Fallback: verify the `CF_Authorization` cookie value with the same verifier |
| A4 | An Access application can be scoped to a path prefix (`pixelfirm.dev/ceo`) | Pitfall 6 | The worker gets 302'd. Fallback: a Cloudflare service token (`CF-Access-Client-Id/Secret`) on the worker, or a separate hostname for `/events`/`/ws` |
| A5 | Vite emits CSS imported only by an async chunk as a separate file loaded with that chunk (`build.cssCodeSplit` default) | Pattern 8 | Tailwind preflight leaks into the office route. Caught by the build-manifest test |
| A6 | Access JWTs are RS256 and carry an `email` claim for identity-provider logins | Code Examples | Verification rejects valid tokens. Adjust `algorithms` after decoding a real token |
| A7 | The assistant message holding a tool_use is yielded before `canUseTool` fires, so "last assistant text" is available as request context | Pattern 2 (`context`) | Context field empty. The UI already has empty-state copy |

## Open Questions

1. **Where does `/ceo` get served in staging/production?**
   - Known: only `apps/api` has a Dockerfile; the web app has so far run on Vite dev. `/ceo` and `/ceo/api` must be same-origin (no CORS plugin allowed; Access cookie scope).
   - Recommendation: one hostname (`test.pixelfirm.dev`) with Traefik path routing (`/ceo/api`, `/ceo/ws`, `/events`, `/ws`, `/admin`, `/health` → api; everything else → a static web container with SPA fallback), and the Access app on `/ceo*`. Verify the phase locally (Vite proxy) first, then stage it with the coolify/cloudflare skills. The planner should make the deploy a separate, final plan.
2. **Widen the gate list?**
   - Known: `CEO_GATED_BASH_PATTERNS` covers `"force-push"`, `"destructive filesystem op"`, `"destructive DB op"`, `"publish/deploy"` [VERIFIED: signal-detection.ts:20-29]. On this developer's stack, pushing to `main` deploys through Coolify, and MCP tools (e.g. `mcp__coolify__deploy`) aren't classified at all.
   - Recommendation (fits CEO-04's list): gate any `git push`, `git merge|rebase|reset --hard`, package-manager `add|remove|install <pkg>|update`, and **every `mcp__*` tool** (fail closed). Confirm with the user, because gating plain `git push` adds CEO round-trips.
3. **How are tasks launched on the worker?**
   - Recommendation: env/argv only (`WORKER_TASK_PROMPT`, `WORKER_AGENT_ID`, optional `WORKER_TASK_TITLE`). The worker starts one task on boot, and the control plane can only `decision`/`task.resume`. This keeps SEC-03 and gives the live proof a real driver.
4. **Should the office `?token=` feed move to Access now?** Recommendation: no. Phase 7 rebuilds that route; `/ceo/ws` uses Access from day one.
5. **What about a decision recorded but not applied because the worker restarted?** Both `decision_made` and `approval_expired` exist, which the unique index allows because it keys on type. History should show it as Expired with the decision attached. The planner should add a fixture test.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | ✓ | v25.9.0 | — |
| pnpm | all scripts | ✓ (via `npx --yes pnpm@12.4.2`) | 12.4.2 | The global `pnpm` shim was **blocked by Device Guard** in this Bash shell; use `npx pnpm@12.4.2` or PowerShell |
| Docker (test Postgres on :5434) | api tests | ✓ | 29.6.2 | — (ports 5432/5433 are taken by another project; 5434 is free as before) |
| Claude Code CLI (subscription auth) | live proof | ✓ | 2.1.280 | — |
| git | readDiff | ✓ | 2.55.0 | — |
| Playwright | e2e | ✓ | 1.63.0 | — |
| cloudflared | Access/tunnel setup | ✓ | installed at `C:\Program Files (x86)\cloudflared` | — |
| Cloudflare Access app (team domain + AUD) | D-11 in staging | ✗ (not created) | — | Local dev bypass. Create the app via the Cloudflare API/skill in the deploy plan |

Baseline: `npx pnpm@12.4.2 --filter claude-adapter test` → 35 passed, 3 skipped (run this session).

**Missing dependencies with no fallback:** none for local completion. Staging verification needs the Access app (the user's Cloudflare account).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1 (per package), Playwright 1.63.0 (root `e2e/`) |
| Config file | none per package (vitest defaults); `playwright.config.ts` (baseURL from `PIXELFIRM_STAGING_URL`) |
| Quick run command | `npx pnpm@12.4.2 --filter <pkg> test -- <file-or-name>` |
| Full suite command | `npx pnpm@12.4.2 --filter api db:test:up && npx pnpm@12.4.2 -r test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CEO-01 | 24×13 layout keeps every existing coordinate; ceoQueue slots Chebyshev ≥ 2, glyph boxes clear, reachable via door | unit (layout guard) | `pnpm --filter pixel-office test -- officeLayout` | ❌ Wave 0 |
| CEO-01 | waiting_for_ceo → walks to lowest free slot, faces DOWN; no shuffle; 5th waits at desk; leaving walks home | unit (stepOffice) | `pnpm --filter pixel-office test -- ceo-queue` | ❌ Wave 0 |
| CEO-01 | Office route sees WAITING_FOR_CEO then leaves it after decision/expiry (running/blocked emitted) | unit + live | `pnpm --filter claude-adapter test -- claude-code-runtime` ; live script | partial |
| CEO-02 | Enriched payload parses; Phase 4 `{taskId, reason}` row still parses | unit | `pnpm --filter event-schema test -- payloads` | ✅ extend |
| CEO-02 | readDiff caps/truncated/numstat; uses `--no-ext-diff --no-textconv`; no-mutating-git green | unit (temp repo) | `pnpm --filter git-adapter test -- diff` | ❌ Wave 0 |
| CEO-02 | foldDecisions: pending (one per thread, FIFO), history 50, expired, decided | unit | `pnpm --filter company-core test -- decisions` | ❌ Wave 0 |
| CEO-02 | `/ceo` renders queue/detail/diff/links (http/https only) with dev bypass + fake worker | e2e | `npx playwright test e2e/ceo-dashboard.spec.ts` | ❌ Wave 0 |
| CEO-02 | Office bundle has no ceo chunk / Tailwind preflight | build check | `pnpm --filter web build && node scripts/check-office-bundle.mjs` (or a vitest over `dist/.vite/manifest.json`) | ❌ Wave 0 |
| CEO-03 | toPermissionResult: approve→parked input; answers validated; 4 deny prefixes; note rules (D-07) | unit | `pnpm --filter claude-adapter test -- decision-mapping` | ❌ Wave 0 |
| CEO-03 | Parked canUseTool resolves from awaitDecision; watchdog suspended while parked; Notification no dup; superseded/aborted → deny | unit (fake timers) | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ extend |
| CEO-03 | Decision POST → downlink reaches the stamped worker; 503 if offline; 409 on repeat | integration (test DB + ws client) | `pnpm --filter api test -- ceo-decisions` | ❌ Wave 0 |
| CEO-03 | Worker: downlink resolves pending; unknown ids ignored; hello bootId; resume validates worktree | unit | `pnpm --filter worker test -- decisions` | ❌ Wave 0 |
| CEO-03/04 | Real session: AskUserQuestion answered; gated probe approved runs; rejected probe doesn't; hold >120 s | live (real Claude) | `node scripts/verify-ceo-approval-live.mjs` | ❌ Wave 0 |
| CEO-04 | PreToolUse hook returns `ask` for classified calls, `{}` otherwise | unit | `pnpm --filter claude-adapter test -- claude-code-runtime` | ✅ extend |
| CEO-04 | Temp repo with allow rule for the probe still parks (A1) | live | same live script | ❌ Wave 0 |
| CEO-04 | Worker credential cannot POST `ceo.decision_made` (403); `BROWSER_ACCESS_TOKEN` cannot decide (401) | integration | `pnpm --filter api test -- ceo-auth` | ❌ Wave 0 |
| CEO-04 | Access JWT: bad sig/aud/iss/no-email → 401; bad Origin / missing CSRF header → 403; dev bypass refused when NODE_ENV=production | unit (local JWKS) | `pnpm --filter api test -- ceo-auth` | ❌ Wave 0 |
| CEO-05 | Chain requested→decision_made(decidedBy email)→decision_applied recorded; expiry on bootId mismatch appends expired + task blocked; unique index | integration | `pnpm --filter api test -- ceo-decisions` | ❌ Wave 0 |
| privacy | PRIVATE ceo.* never reaches `/ws/browser`; `fold()` state holds no private strings | integration + unit | `pnpm --filter api test -- ws-browser` ; `pnpm --filter company-core test -- reducer` | ✅ extend |

### Sampling Rate
- **Per task commit:** the package quick run for the files touched (< 30 s; the api ones need `db:test:up` once).
- **Per wave merge:** `npx pnpm@12.4.2 -r test` + `pnpm --filter web build` + bundle check.
- **Phase gate:** full suite green, Playwright `/ceo` spec green, live proof transcript captured (evidence file like `04-04-demo-evidence.md`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `packages/company-core/src/decisions.test.ts`
- [ ] `packages/claude-adapter/src/decision-mapping.test.ts`
- [ ] `packages/git-adapter/src/diff.test.ts` (temp repo fixture, same as `worktree.test.ts`)
- [ ] `packages/pixel-office/src/ceo/ceo-queue.test.ts` + layout guard cases
- [ ] `apps/api/src/routes/ceo-decisions.test.ts`, `apps/api/src/auth/ceo-auth.test.ts` (migration list must include `0004_ceo_decision_once.sql`; the STATE blocker on the parallel enum-migration race still applies, so keep `applyIdempotently`)
- [ ] `apps/worker/src/decisions.test.ts`
- [ ] `e2e/ceo-dashboard.spec.ts` + a local Playwright project (current config targets staging only)
- [ ] `scripts/verify-ceo-approval-live.mjs` (real ClaudeCodeRuntime, disposable worktree, harmless non-read-only probe matching a gated pattern, e.g. `node -e "console.log('deploy-probe')"`)
- Framework install: none.

## Security Domain

ASVS level 1 (`security_asvs_level: 1`, `security_block_on: high`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Cloudflare Access (edge) + `jose` `jwtVerify` (iss/aud/alg) in the API; `CEO_EMAIL` match; no app-issued sessions |
| V3 Session Management | yes (delegated) | Access's `CF_Authorization` cookie; the API is stateless per request |
| V4 Access Control | yes | Only the CEO route writes `ceo.decision_made`; worker allowlist excludes it; decisions go only to the stamped `workerId`; `BROWSER_ACCESS_TOKEN` grants read of the office feed only |
| V5 Input Validation | yes | zod with length caps on the decision body and all `ceo.*` payloads; answers validated against the parked questions worker-side; `worktreePath` validated against `listWorktrees` |
| V6 Cryptography | yes | `jose` only; nothing hand-rolled |
| V7 Error/Logging | yes | Audit events (CEO-05); `redact` Access header + cookie; never log payloads (existing T-02-03 rule) |
| V13 API/Web Service | yes | Origin allowlist + `X-PixelFirm-CSRF` + JSON-only on POST; Origin check on `/ceo/ws` upgrade; rate limits on the new routes; no CORS plugin |
| V14 Config | yes | Dev bypass triple-guarded; `NODE_ENV=production` in the Dockerfile |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on the decision POST | Tampering | Custom header + Origin allowlist + JSON-only (D-12) |
| Direct-to-origin request skipping Access | Spoofing | Verify the JWT in the API always; tunnel-only ingress; optional `cloudflared` access-required origin setting |
| Approve-different-input (TOCTOU) | Elevation | Worker returns the parked input; the downlink carries no `updatedInput` |
| Replay / double decision | Tampering | Partial unique index + single-resolve pending map |
| Settings allow rule or MCP tool bypasses the gate | Elevation | `PreToolUse` "ask" hook; gate `mcp__*` (OQ2) |
| Agent prints fake `[CEO:APPROVE]` text | Spoofing | Irrelevant to the gate: approval is the SDK promise result, not text |
| PRIVATE data leaking to the office/stream feed | Info disclosure | Per-socket filter; guard tests; decisions kept out of `ProjectionState` |
| XSS through agent text, links, previews | Tampering | React text nodes only; `http:`/`https:` links with `rel="noopener noreferrer"`; no HTML previews |
| `git diff` external driver execution | Elevation | `--no-ext-diff --no-textconv` |
| Worker forges a request for another worker's task | Spoofing | `workerId` stamped server-side; decisions route only to the stamped worker (accepted residual: T-05-11-WR01, single trusted worker) |
| Credential exposure in the subprocess env | Info disclosure | Extend the env strip list (Pitfall 11) |

**Out-of-band finding for the user (not phase scope):** `.claude/settings.local.json:18` holds a staging bootstrap secret in plaintext inside a permission rule. The file is git-ignored (global `~/.config/git/ignore`), but it's readable by any Claude session in this repo, including a worker-hosted one if the worker is pointed here. Consider rotating it.

## Sources

### Primary (HIGH confidence)
- Installed `@anthropic-ai/claude-agent-sdk@0.3.278`: `sdk.d.ts` l.203-297 (CanUseTool, "no park deadline"), l.2405-2417 (PermissionResult), l.8600-8615 (dialog expiry env); `sdk-tools.d.ts` l.1102-1262 (AskUserQuestionInput, `multiSelect`), l.3905-3935 (answers/annotations/afkTimeoutMs)
- Repo files read this session: `claude-code-runtime.ts`, `signal-detection.ts`, `watchdog.ts`, `event-emitter.ts` (both), `orchestration-adapter/src/types.ts`, `event-schema` payloads/envelope/agent-status, `company-core` reducer/projections/derivation, `apps/api` server/env/schema/events/ws/ws-browser/browser-connections/browser-auth/connection-status/event-row/migrations, `apps/worker` index/ws-client/env/event-emitter, `apps/web` main/App/ws-client/index.html, `pixel-office` index/characters/officeLayout/office-layout.json/status-mapping/constants/handoff-choreography (head), `git-adapter` commit/no-mutating-git, `.claude/settings.local.json`
- npm registry (`npm view`) + GSD package-legitimacy seam, 2026-09-24

### Secondary (MEDIUM confidence)
- [Handle approvals and user input](https://code.claude.com/docs/en/agent-sdk/user-input): indefinite pending, allow/deny semantics, AskUserQuestion answers format, subagent limitation
- [Configure permissions](https://code.claude.com/docs/en/agent-sdk/permissions): evaluation order, allow-rule shadowing, settings sources
- [Hooks](https://code.claude.com/docs/en/agent-sdk/hooks): PreToolUse decisions, deny>defer>ask>allow, 600 s default timeout
- [Cloudflare: Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): certs URL, header, iss/aud, jose example
- [Cloudflare: cloudflared origin parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cloudflared-parameters/origin-parameters/): Access JWT sent for all L7 requests; tunnel-side enforcement
- [Cloudflare: Application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [jose createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)

### Tertiary (LOW confidence)
- None relied on without a primary cross-check. Context7 was unavailable (monthly quota exceeded).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Existing deps read from manifests; new ones verified on the registry; UI stack locked by the UI-SPEC.
- Architecture: MEDIUM-HIGH. Every integration point was read in code. A1/A2 (hook "ask" routing; long park with a string prompt) need the live proof.
- Pitfalls: HIGH for the repo-grounded ones (1, 2, 3, 4, 8, 9, 11 were verified in files); MEDIUM for Cloudflare scoping (A3, A4).

**Research date:** 2026-09-24
**Valid until:** 2026-10-08 (the SDK and CLI ship weekly; re-check `sdk.d.ts` if the SDK version is bumped)
