# Phase 6: CEO Dashboard & Approval Workflow - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Every decision that needs a human (CEO-gated tool call or a GSD AskUserQuestion checkpoint, both already classified by Phase 4's `classifySignal`/`requestReview`) is routed to the CEO: the agent walks to a CEO office and waits visibly, a private dashboard lists the pending decision with context/recommendation/diff, and the CEO's action (Approve / Reject / Discuss / Request Changes / Request More Research) actually controls the live Claude Code session. Nothing CEO-gated ever proceeds without an explicit human approve; every decision is audit-logged.

Prerequisites this phase must build (none exist today): a control-plane → worker command downlink over the existing worker WS (`apps/api/src/routes/ws.ts` is inbound-only), and the worker actually hosting `ClaudeCodeRuntime` (today `apps/worker` only runs read-only git/gsd poll adapters; the runtime was only driven by a Phase 4 demo script).

Not in scope: visibility-level filtering and the OBS stream route (Phase 7), multi-agent orchestration/role registry, Twitch.

</domain>

<decisions>
## Implementation Decisions

### Approval round-trip
- **D-01:** Hold the SDK `canUseTool` promise open until the CEO decides, instead of Phase 4's immediate deny. Approve → `allow` for the exact parked tool call (original input, plus `updatedInput.answers` for AskUserQuestion); every other action → `deny` with the CEO's message. No grant-matching or re-issue step exists, so nothing can be approved that the CEO did not see. The installed SDK (`packages/claude-adapter/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, CanUseTool doc) states permission prompts have no park deadline. — **Reversibility:** costly — the runtime, worker host, downlink message and dashboard all assume a live parked promise; switching to the SDK `defer` hook later means a resume loop plus decision re-delivery.
- **D-02:** Fail closed on worker restart / disconnect / abort: the pending promise lives only in worker memory, so any lost promise is resolved as deny (on abort) or recorded as an expired decision (event, e.g. `ceo.approval_expired`) on reconnect, and the task goes `blocked`. The CEO re-triggers via `resumeTask`. Never auto-approve, never try to rehydrate the promise.
- **D-03:** While a decision is pending, the D-04 silence watchdog in `claude-code-runtime.ts` is suspended for that invocation, and the `Notification`-hook path must not fire a duplicate `requestReview` for the same parked call.
- **D-04:** New durable events in the append-only log: request enriched with a `decisionId` (plus tool name/input summary, recommendation, links, diff reference), a `ceo.decision_made` (action, note, decider identity), and the expiry/closed event. These events are the audit log (CEO-05) — no separate audit table unless research finds a need.

### Non-approve actions
- **D-05:** Reject, Request Changes, Request More Research and Discuss all `deny` the parked call with a typed-prefix message the agent reads as the tool result: `[CEO:REJECT]`, `[CEO:REQUEST_CHANGES]`, `[CEO:MORE_RESEARCH]`, `[CEO:DISCUSS] <note>`. The agent continues in the same turn. No `cancelTask` on Reject.
- **D-06:** Discuss = deny with `[CEO:DISCUSS]` instructing the agent to reply and ask again (AskUserQuestion); the follow-up request becomes a new decision grouped under the same `threadId` in the dashboard. No new AgentRuntime method.
- **D-07:** Note is required for Request Changes, Request More Research and Discuss; optional for Reject (one-click reject allowed).

### Dashboard + CEO office
- **D-08:** Private `/ceo` view in `apps/web`, separate from the office canvas route so the canvas stays stream-capturable (Phase 7) and decision context/diffs never render on it. Path check in `main.tsx` is enough (no router dependency needed).
- **D-09:** The worker ships the diff (control plane has no repo access): changed-file list, numstat, and a capped unified diff (~64KB / ~400 lines) with a `truncated` flag. Diff/context data is treated as PRIVATE from day one.
- **D-10:** A walled CEO room is added to `packages/pixel-office/src/layout/office-layout.json` with a `ceoQueue` list of waiting-chair slots (same pattern as existing `standing`/`interaction` slots). Agents with `waiting_for_ceo` walk there via the Phase 5 walk/pathfinding system and hold the frozen pose + glyph (Phase 5 D-03). If the queue is full, overflow agents wait at their own desk with the glyph. After a decision the agent walks back to its desk. — **Reversibility:** costly — resizing the 20x11 grid can move existing desk/seat coordinates.

### CEO action auth
- **D-11:** Cloudflare Access (one-user email/passkey policy) in front of pixelfirm.dev; the API verifies `Cf-Access-Jwt-Assertion` server-side (JWKS from the team's `cloudflareaccess.com/cdn-cgi/access/certs`, check `aud`/`iss`) using `jose`. The verified email is recorded as the decider in the audit event. `BROWSER_ACCESS_TOKEN` must NOT authorize decisions.
- **D-12:** CSRF: mutations require JSON body + a custom header (e.g. `X-PixelFirm-CSRF`) and a strict `Origin` allowlist on POSTs and the browser WS upgrade (Phase 2 research Pattern 5), not `@fastify/csrf-protection`. Origin must only be reachable through the Cloudflare tunnel so Access can't be bypassed. Local dev gets an explicit dev-only bypass flag that cannot be enabled in production.

### Claude's Discretion
- Exact event type names/payload shapes (additive to the discriminated union, appended, never reordered).
- Downlink message shape on the worker WS and how the worker hosts/launches `ClaudeCodeRuntime` tasks.
- Diff cap exact numbers, CEO room size/position, number of waiting chairs.
- Dashboard visual design (a `/gsd-ui-phase 6` UI-SPEC is appropriate — roadmap marks UI hint: yes).
- Whether the browser WS read feed also migrates from `?token=` to the Access cookie in this phase or Phase 7.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/ROADMAP.md` §Phase 6 — goal and 4 success criteria
- `.planning/REQUIREMENTS.md` — CEO-01..CEO-05
- `.planning/PROJECT.md` — never auto-approve; security baseline (CSRF, audit log, no secrets in URLs)

### Prior decisions this builds on
- `.planning/phases/04-agentruntime-claudecoderuntime/04-CONTEXT.md` — D-04 watchdog, D-08 requestReview semantics
- `.planning/phases/05-pixel-office-renderer/05-CONTEXT.md` — D-03 waiting glyph + frozen pose, D-04 walk choreography
- `.planning/phases/02-control-plane-skeleton/02-RESEARCH.md` — Pattern 5 (CSRF / cookie-auth note flagged for Phase 6)
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`

### External docs
- Claude Agent SDK user input / permissions: https://code.claude.com/docs/en/agent-sdk/user-input
- Claude Code hooks (defer — rejected alternative, reference only): https://code.claude.com/docs/en/hooks
- Cloudflare Access JWT validation (official Cloudflare docs)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/claude-adapter/src/claude-code-runtime.ts`: `canUseTool` (~l.195, currently always denies), `requestReview` (~l.96), Notification hook (~l.214), watchdog (~l.239).
- `packages/claude-adapter/src/signal-detection.ts`: `classifySignal` + `CEO_GATED_BASH_PATTERNS` (first-pass heuristic).
- `packages/event-schema/src/payloads/index.ts`: `ceo.approval_requested {taskId, reason}` — extend additively.
- `apps/api/src/auth/browser-auth.ts`: timing-safe compare pattern; `apps/api/src/routes/ws-browser.ts` browser feed.
- `packages/pixel-office`: walk/pathfinding from handoff choreography, `bubble-*` glyph sprites, `office-layout.json` slot arrays.

### Established Patterns
- Append-only Postgres event log is the source of truth; projections rebuilt by replay (company-core reducer).
- Worker identity comes from the authenticated connection, never payload fields.
- Discriminated-union members are appended, never reordered.

### Integration Points
- `apps/api/src/routes/ws.ts` + `apps/worker/src/ws-client.ts`: add the downlink.
- `apps/worker/src/index.ts`: host `ClaudeCodeRuntime`.
- `apps/web/src/main.tsx`: `/ceo` path.
- New API decision route (Access-JWT + CSRF protected) that appends `ceo.decision_made` and forwards to the worker.

</code_context>

<specifics>
## Specific Ideas

- Walled CEO room with waiting chairs should read well on stream ("agents queuing for the boss").
- Dashboard must never be the stream-captured page.

</specifics>

<deferred>
## Deferred Ideas

- Durable `defer`-hook approvals that survive worker restarts — revisit if CEO decisions routinely outlast worker uptime.

</deferred>

---

*Phase: 06-ceo-dashboard-approval-workflow*
*Context gathered: 2026-09-23*
