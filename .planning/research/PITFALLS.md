# Pitfalls Research

**Domain:** Pixel-art AI dev-team visualization / event-driven orchestration / streaming integration (PixelFirm)
**Researched:** 2026-09-18
**Confidence:** MEDIUM (web-sourced, cross-checked against official Twitch/Google/Anthropic docs and the actual pixel-agents-hq repo + its credited asset pack; no primary access to PixelFirm's own future codebase, so integration specifics are pattern-level, not code-verified)

## Critical Pitfalls

### Pitfall 1: Assuming the fork's MIT license covers every bundled sprite/asset

**What goes wrong:**
Teams fork a game repo, see a root `LICENSE` file (MIT), and ship art assets under that license without checking whether the assets were themselves imported from a third party under different terms — then get a takedown, DMCA complaint, or have to re-skin the whole product later.

**Why it happens:**
An MIT license on a repo covers the *code* by default. Bundled binary assets (sprites, tilesets, audio) are frequently sourced from itch.io packs, OpenGameArt, or other creators and are not automatically re-licensed just because they sit in an MIT repo. Repos routinely omit a NOTICE file or per-asset attribution list, so the omission looks like "covered by MIT" when it's actually just undocumented.

**How to avoid:**
Verified directly for this project: pixel-agents-hq/pixel-agents is MIT, and its character sprites are explicitly credited to JIK-A-4's "MetroCity" itch.io pack, which carries its own **CC0 1.0 Universal** license (commercial use explicitly allowed, no attribution required). That specific asset is safe. But do not extrapolate this to every asset in the fork — audit each distinct asset source (tilesets, UI icons, any additional character packs, sound) individually before commercial distribution, exactly as PROJECT.md already flags. Keep a `references/ASSET-LICENSES.md` (or similar) mapping each asset directory to its verified source license, checked at the point the fork is first pulled in, not deferred to a "before launch" audit that never happens.

**Warning signs:**
- No per-asset attribution file in the upstream repo, only a root LICENSE.
- Assets whose filenames/paths don't match anything credited in the README.
- Any asset pack license page that says "personal use only" or requires attribution when your `/stream/...` route is public.

**Phase to address:**
Phase that integrates the Pixel Agents fork (early — before any asset ships to the public stream route). Re-verify at the phase that ships the public OBS-facing overlay, since that's the first point of actual public distribution.

> Superseded by 05-12 (WR-09): 2026-09-21. The "Verified directly for this project" claim above was re-examined during Phase 5 gap closure, and it splits into two links that this paragraph runs together. **The pack's licence holds, and is now cited.** The itch.io page named here is in this file's own Sources list (<https://jik-a-4.itch.io/metrocity-free-topdown-character-pack>); it was re-fetched on 2026-09-21 (HTTP 200) and the publisher's listing metadata reads *Asset license: Creative Commons Zero v1.0 Universal*. That URL had never been carried into `references/ASSET-LICENSES.md`, which asserted "Confirmed CC0" on a README credit line instead — the over-claim WR-09 flagged. It is now cited there. **The second link is not established:** that the file this repo actually ships (the fork's `char_0.png`, decoded) IS that pack's art rests on the fork's README saying its characters are "based on" the pack, which is a credit, not a provenance record. `references/ASSET-LICENSES.md` §1 is the authoritative tier and splits the two; `apps/web`'s footer credits the pack without asserting a licence over the bytes it draws. Closing link 2 is 05-VERIFICATION.md human-verification item 4 (visual comparison against the upstream art). The surrounding guidance is unchanged and vindicated: auditing each asset source individually is precisely what surfaced this.

---

### Pitfall 2: Pixel office state silently drifts from real Claude Code / GSD / git state

**What goes wrong:**
The visualization looks alive and plausible (agents walking, animating, "working") while no longer reflecting what's actually happening in the underlying Claude Code session, git worktree, or GSD workflow state — the exact failure mode PROJECT.md calls out as "the product has failed at its one job." This happens gradually: a dropped event, a reconnect that misses a window, a crash-and-restart of the worker that doesn't replay missed events, or state computed by local optimistic UI logic instead of the real event log.

**Why it happens:**
Event-driven systems assume at-least-once or best-effort delivery from the source (Claude Code hooks, git watchers, GSD state observers) to the event bus, but consumers (the Company State Engine, the Pixel Office renderer) often aren't built to detect gaps. Handlers that aren't idempotent double-apply duplicate events or skip events during a reconnect window, and nothing tracks "how stale is my projection right now" until a demo goes visibly wrong.

**How to avoid:**
Treat the Company State Engine's projection as fully disposable and rebuildable from the event log, never as the source of truth itself (this matches the architecture constraint already in PROJECT.md). Track projection lag explicitly — last-applied event ID/timestamp vs. the event bus head — and surface it (even just in an internal debug panel) so drift is visible before it's a stream-day surprise. Make every event handler idempotent (dedupe by event id) since delivery will not be exactly-once across a worker restart or reconnect. On any detected staleness beyond a threshold, prefer "reset the projection and replay" over "patch state in place."

**Warning signs:**
- Office shows an agent "coding" after the underlying Claude Code process has exited or errored.
- No metric/log for event-bus-to-projection lag exists.
- Worker restarts don't re-emit or don't request replay of events since last-known-good checkpoint.

**Phase to address:**
The Company Event Bus / Company State Engine phase (core architecture, early). Verification: intentionally kill the worker mid-task in a dev environment and confirm the office state either freezes with a visible "stale/disconnected" indicator or recovers via replay — it must never keep animating as if nothing happened.

**Phase to address:** Company Event Bus / Company State Engine phase (foundational, before any visualization work).

---

### Pitfall 3: Claude Code headless/subagent integration breaks unattended automation

**What goes wrong:**
The worker component invokes Claude Code as a controlled subprocess expecting deterministic, unattended behavior, but hits: an interactive resume/session picker prompt blocking headless execution when starting in a directory with prior sessions; subagent fan-outs that silently hit Anthropic rate limits when too many run concurrently; subagent output getting lost because nothing in the parent explicitly captures/relays it; or `--resume` failing because the working directory or session store isn't consistent between the two invocations.

**Why it happens:**
Claude Code's headless mode is not "always non-interactive" — some code paths retain interactive fallbacks (e.g. resume prompts) unless explicitly configured/avoided. Subagents start with a fresh context window; the only channel from parent to subagent is the prompt string, so anything the parent assumes is "known" (task id, worktree path, prior conversation) has to be explicitly passed or it doesn't exist for the subagent.

**How to avoid:**
Run every worker-invoked Claude Code process from a consistent, known working directory per task/worktree; explicitly pass task/session identifiers rather than relying on directory-based session discovery; cap concurrent subagent fan-out and add backoff/retry for rate-limit responses (429s) rather than assuming child processes always succeed; treat "subagent didn't report back" as an expected failure mode the AgentRuntime abstraction (`getStatus`, `sendMessage`) must be able to detect and surface to the company event bus (e.g. an agent stuck in a state with no heartbeat), not something that silently hangs the pixel employee in an in-progress animation forever.

**Warning signs:**
- Worker process hangs with no stdout/stderr progress and no timeout.
- `getStatus()` never returns a terminal state for a task that actually finished or failed on the Claude Code side.
- Office shows an agent stuck "coding" indefinitely.

**Phase to address:** ClaudeCodeRuntime / AgentRuntime abstraction phase. Verification: kill/hang-test a Claude Code subprocess and confirm the runtime surfaces a `failed`/`blocked` company event within a bounded timeout, rather than the office silently freezing an agent in "coding" forever.

---

### Pitfall 4: Twitch EventSub websocket connection dies silently or duplicates events

**What goes wrong:**
The Twitch integration stops receiving events after a period of being live (missed reconnect), or double-fires the same viewer event (e.g. two coffee-delivery animations for one cheer) after a reconnect.

**Why it happens:**
Twitch's EventSub websocket requires the client to treat "no event or keepalive within `keepalive_timeout_seconds`" as a dead connection and reconnect+resubscribe — this is not automatic. On a `session_reconnect` message, a common implementation mistake is calling the reconnect handler with the new URL but never closing the previous socket, or closing the old socket too early (before the new one sends `session_welcome`), which either duplicates events on both sockets briefly or drops in-flight events. The old socket is force-closed by Twitch after a 30-second grace period regardless.

**How to avoid:**
Implement keepalive-timeout detection explicitly (don't assume the socket library handles it) and reconnect+resubscribe on timeout. On `session_reconnect`, open the new socket at the provided `reconnect_url`, wait for `session_welcome` on the **new** socket, and only then close the old one. Make the "harmless deterministic office interaction" (coffee delivery, lights, celebration) handler idempotent per Twitch event ID so a brief dual-socket window can't double-trigger it.

**Warning signs:**
- Stream goes quiet (no follow/sub/cheer reactions) mid-session with no error logged.
- Duplicate office reactions to a single chat event/cheer.

**Phase to address:** Twitch EventSub integration phase. Verification: use Twitch CLI's websocket test/reconnect-testing commands to simulate a forced reconnect and confirm exactly one office reaction fires, with no dead-air gap.

---

### Pitfall 5: Twitch signature verification implemented incorrectly, silently accepting forged events

**What goes wrong:**
Webhook/EventSub signature verification is implemented against the wrong bytes (e.g. re-serialized JSON instead of the raw request body) or without constant-time comparison, either rejecting all legitimate events (breaking the integration) or — worse — being implemented loosely enough that forged events get through.

**Why it happens:**
The signature is `HMAC-SHA256(secret, message_id + timestamp + raw_body)`, and most web frameworks parse the JSON body before your handler ever sees it, so the "raw body" bytes are gone by the time verification code runs unless middleware explicitly preserves them. Developers then verify against a re-serialized version of the parsed object, which has different whitespace/key-ordering than the original bytes and never matches.

**How to avoid:**
Capture and verify against the untouched raw request body (configure the HTTP framework to preserve it before any JSON-parsing middleware runs). Concatenate `Twitch-Eventsub-Message-Id` + `Twitch-Eventsub-Message-Timestamp` + raw body, compute `sha256=` + hex HMAC using the subscription secret (10–100 ASCII chars), compare with a constant-time function, and reject any message with a timestamp older than 10 minutes (replay protection).

**Warning signs:**
- Signature verification "works in dev, fails in prod" (framework body-parsing differences).
- No explicit timestamp-age check in the verification code.

**Phase to address:** Twitch EventSub integration phase, as part of the security baseline requirement already in PROJECT.md.

---

### Pitfall 6: Stream-safe visibility levels leak via URL query params, not just via rendered content

**What goes wrong:**
Teams build the PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC visibility model, sanitize what's *rendered* on the public route, but still pass an auth token, session id, or internal identifier as a URL query parameter on a request the overlay makes — leaking it through browser history, server access logs, and `Referer` headers even though nothing sensitive appears on screen.

**Why it happens:**
Query-param auth is the path of least resistance for a browser-source overlay (no header-setting UI in OBS), and it's easy to reason "this token just lets you view a stream overlay, it's not that sensitive" — but a leaked token can then be replayed to hit the same API from outside OBS, potentially against non-public-scoped endpoints if the token isn't itself scoped down.

**How to avoid:**
Never put credentials/tokens in the query string for the `/stream/company/:companyId` route. If OBS Browser Source can't set custom headers, use a short-lived, narrowly-scoped, single-purpose token minted specifically for that route (scoped to STREAM_SAFE/PUBLIC data only, separate from any CEO-dashboard credential) and treat it as public-adjacent by design — i.e., the token being visible must not grant access to anything above STREAM_SAFE. Enforce visibility filtering server-side on the data query itself (never rely on the client to hide fields), so even a leaked/replayed token can't be used to pull PRIVATE/INTERNAL data — there must be no code path where the public route's query can return prompts, file paths, env vars, or terminal output regardless of what token is presented.

**Warning signs:**
- Any `?token=` or `?key=` on the OBS-facing route.
- The public route's data-fetch function is the *same* function the CEO dashboard uses, with visibility filtering applied only in the UI layer instead of at the query/serialization layer.

**Phase to address:** Stream-safe visibility levels phase and the `/stream/company/:companyId` overlay route phase — these should ship together, not sequentially, since the route is unsafe to expose until visibility enforcement is server-side and token scope is public-safe.

---

### Pitfall 7: Chat/viewer content rendered into the pixel office without sanitization (stored/reflected XSS)

**What goes wrong:**
Twitch/YouTube chat messages, usernames, or redemption text get piped into the office (e.g. as a speech bubble, chat overlay, or event log visible on `/stream/...`) without sanitizing HTML/script content, letting a viewer inject markup that executes in every viewer's browser rendering the OBS source — or in the CEO's own dashboard if the same rendering path is shared.

**Why it happens:**
Viewer-generated text feels "just a string" until someone tests `innerHTML` with a crafted display name or chat message; the risk is easy to miss because most chat clients already sanitize before display and it's tempting to assume the platform did it already.

**How to avoid:**
PROJECT.md already requires chat sanitization before rendering — implement it as textContent/innerText rendering by default (never innerHTML with viewer-sourced strings), plus a strict allowlist if any limited formatting (emotes) is supported, with server-side sanitization at the point the ViewerEvent is normalized (defense in depth), not only client-side.

**Warning signs:**
- Chat/redemption text rendered via any `dangerouslySetInnerHTML` / `innerHTML` / template string concatenation into HTML.
- No test covering a chat message containing `<script>` or event-handler attributes.

**Phase to address:** ViewerEvent normalization phase (Twitch integration) — sanitize at ingestion, re-verify at the render layer when the overlay phase ships.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Polling `liveChatMessages.list` instead of push-based approach for YouTube chat | Simpler to implement first | Burns the 10,000-unit/day quota fast; can exhaust quota mid-stream | Never for MVP if streaming for hours — implement quota-aware polling interval (`pollingIntervalMillis`) from day one |
| Editing the Pixel Agents fork's files directly instead of isolating changes in separate files/subfolders | Faster first integration | Every upstream pull becomes a manual conflict-resolution exercise; conflict surface grows every upstream release | Acceptable only if the fork is explicitly frozen (no intent to pull upstream updates again) |
| Deriving pixel-office animation state from local optimistic UI transitions instead of the event log | Smoother-feeling immediate UI | Silent drift between visualization and real state — the exact failure PROJECT.md calls fatal | Never — Core Value explicitly forbids this |
| Skipping idempotency on event handlers "since duplicates are rare" | Less code in MVP | Reconnect windows and worker restarts cause double-application (duplicate coffee deliveries, double state transitions) | Never — reconnects and restarts are expected, not edge cases |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Twitch EventSub (websocket) | Not detecting keepalive timeout / not closing old socket at the right time on reconnect | Explicit keepalive-timeout reconnect logic; close old socket only after new socket's `session_welcome` |
| Twitch EventSub (signature) | Verifying against re-serialized JSON instead of raw body | Preserve and verify against the untouched raw request body; constant-time compare; reject stale timestamps |
| Twitch EventSub (subscriptions) | Not tracking `total_cost` vs `max_total_cost`, subscriptions silently stop being creatable | Track `total_cost`/`max_total_cost` from subscription responses; budget which event types justify their cost |
| YouTube Live API | Polling `liveChatMessages.list` aggressively | Use `streamList` where available, respect `pollingIntervalMillis`, budget the 10,000/day default quota against stream duration |
| Claude Code subprocess | Assuming headless mode never prompts interactively | Pin working directory per task, pass explicit session/task ids, don't rely on directory-based session auto-discovery |
| Claude Code subagents | Assuming subagent output automatically reaches the parent/company event bus | Parent must explicitly capture and relay subagent output into a company event; treat silence as a failure mode with a timeout |
| Pixel Agents fork | Assuming MIT covers all bundled assets | Verify each asset source individually (confirmed CC0 for the credited MetroCity character pack; audit the rest) |
| OBS Browser Source | Auth token passed as URL query parameter | Use a route-scoped, STREAM_SAFE-only token; never grant PRIVATE/INTERNAL access via a token that must sit in a URL |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Polling instead of event-driven push for viewer platforms | Rising API quota usage, latency in office reactions | Prefer websocket/EventSub push (Twitch) and streamList/push patterns (YouTube) over polling | Breaks first during long streams (multi-hour), exactly the target use case |
| Unbounded subagent fan-out from the worker | Rate-limit errors from Claude Code, stalled tasks | Cap concurrent subagents, add backoff on 429s | Breaks once more than a handful of agents work in parallel (multi-agent office is a stated goal) |
| Rebuilding the entire office projection from the full event log on every drift-recovery | Slow recovery, visible freeze during reconnect | Periodic snapshots/checkpoints of company state + replay only events since the checkpoint | Breaks as event history grows over weeks/months of company activity |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Auth token in OBS overlay URL query string | Token leaks via logs/history/Referer, replayable outside OBS | Route-scoped STREAM_SAFE-only token; never in query string |
| Visibility filtering applied only in UI, not at the data-query layer | Public route can be queried directly (bypassing UI) to pull PRIVATE/INTERNAL fields | Enforce visibility level server-side on every query that can reach the public route, independent of the CEO dashboard's code path |
| Unsanitized viewer chat rendered into the office/overlay | Stored/reflected XSS executing in every OBS/viewer client | Sanitize at ingestion (ViewerEvent normalization) and again at render (textContent, not innerHTML) |
| Twitch/YouTube webhook signature verified loosely (or skipped in a "dev mode" that ships) | Forged viewer events can trigger office actions / pollute event log | Constant-time HMAC verification against raw body + timestamp replay window, enforced in every environment |
| Worker has broad, non-revocable credentials to the control plane | A compromised workstation (the worker's home) compromises the whole company state | Per-worker revocable credentials (already required in PROJECT.md) — verify revocation actually works, not just that issuance does |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Office keeps animating an agent as "coding" after the underlying task has actually failed/hung | CEO (the user) loses trust that the office reflects reality — directly undermines Core Value | Bound every "in progress" animation state with a heartbeat/timeout that transitions to `blocked`/`failed` visibly |
| CEO approval requests get buried by frequent stream/viewer-driven office animations | Missed approvals, delayed real dev workflow | Keep CEO-gated approval UI on a separate, higher-priority channel from ambient stream flavor animations |
| Public stream viewers see raw error states, stack traces, or file paths during a real failure | Leaks PRIVATE data, looks unpolished on stream | STREAM_SAFE failure representation (generic "blocked" animation) distinct from the CEO's detailed internal view |

## "Looks Done But Isn't" Checklist

- [ ] **Twitch EventSub integration:** Often missing keepalive-timeout reconnect logic — verify by forcing a network drop mid-stream and confirming reconnection within the timeout window, no duplicate events.
- [ ] **Asset licensing:** Often assumed "covered by the fork's MIT license" — verify every distinct asset directory has a documented, checked source license, not just the character sprites.
- [ ] **Stream-safe visibility:** Often enforced only in the frontend/renderer — verify by querying the public route's backend directly (bypassing the UI) and confirming PRIVATE/INTERNAL fields are absent from the response itself.
- [ ] **Event bus → state engine drift:** Often untested under failure — verify by killing the worker mid-task and confirming the office either freezes visibly or recovers via replay, never keeps animating as if nothing happened.
- [ ] **CEO approval gate:** Often "approve" wired up but "reject"/"request changes" left as UI-only stubs that don't actually block the underlying agent — verify each action (Approve/Reject/Discuss/Request Changes/Request More Research) actually changes AgentRuntime behavior, not just the pixel office animation.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Projection drift discovered in production | MEDIUM | Reset the Company State Engine's projection and replay from the last durable event-log checkpoint; add lag monitoring so this is caught before a live stream, not during one |
| Asset license issue discovered post-launch | HIGH (if commercial distribution already happened) | Swap the offending asset for a verified-license or commissioned replacement; low-cost if caught pre-launch by an asset audit checklist |
| Leaked overlay token | LOW–MEDIUM | Rotate the STREAM_SAFE token immediately; confirm the token's scope was already limited to STREAM_SAFE data so the blast radius was bounded |
| Twitch signature verification found to be broken (accepting unsigned/forged requests) | MEDIUM | Patch verification, audit event log for any events from unverified sources during the exposure window, purge/flag them |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| Fork's MIT license doesn't cover all bundled assets | Pixel Agents fork integration phase | Per-asset license audit document exists and is checked before the public overlay phase ships |
| Company state drifts from real Claude Code/GSD/git state | Company Event Bus / Company State Engine phase | Kill-worker-mid-task test: office freezes/recovers visibly, never fakes continued progress |
| Claude Code headless/subagent integration hangs or loses output | ClaudeCodeRuntime / AgentRuntime phase | Hang/kill test on a Claude Code subprocess surfaces a `failed`/`blocked` event within a bounded timeout |
| Twitch EventSub websocket reconnect drops or duplicates events | Twitch EventSub integration phase | Forced-reconnect test via Twitch CLI produces exactly one office reaction, no dead-air |
| Twitch signature verification implemented against the wrong bytes | Twitch EventSub integration phase | Unit test with a known-good Twitch signature fixture plus a tampered-body rejection test |
| Stream token or PRIVATE data leaks via the public overlay route | Stream-safe visibility levels + `/stream/company/:companyId` route phase (shipped together) | Direct backend query test against the public route confirms no PRIVATE/INTERNAL fields returned regardless of token used |
| Unsanitized chat rendered into the office (XSS) | ViewerEvent normalization (Twitch) phase | Automated test sends a chat message containing `<script>`/event-handler payloads and asserts it renders as inert text |
| YouTube quota exhausted mid-stream from polling | YouTube Live integration phase | Load-test polling cadence against a multi-hour simulated stream and confirm quota budget holds |

## Sources

- [Handling WebSocket Events | Twitch Developers](https://dev.twitch.tv/docs/eventsub/handling-websocket-events)
- [EventSub websocket "4003 connection unused" after session_reconnect — Twitch Developer Forums](https://discuss.dev.twitch.com/t/eventsub-websocket-4003-connection-unused-after-session-reconnect-message/51858)
- [Twitch EventSub session_reconnect leaves the old socket open — GitHub Issue](https://github.com/Milzstream/OBS-Multi-Chat/issues/40)
- [Handling Webhook Events | Twitch Developers](https://dev.twitch.tv/docs/eventsub/handling-webhook-events)
- [EventSub Signature Verification Failing — Twitch Developer Forums](https://discuss.dev.twitch.com/t/eventsub-signature-verification-failing/63240)
- [EventSub subscription limit cost-based system — Twitch Developer Forums](https://discuss.dev.twitch.com/t/eventsub-subscription-limit-cost-based-system-and-limit-field-deprecation/31377)
- [Managing Subscriptions | Twitch Developers](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/)
- [LiveChatMessages: list | YouTube Live Streaming API](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list)
- [Determine quota cost | YouTube Data API](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Run Claude Code programmatically — Claude Code Docs](https://code.claude.com/docs/en/headless)
- [Claude Code Hooks Explained: The Deterministic Layer Around Your Agent](https://blakecrosley.com/blog/claude-code-hooks-explained)
- [How to Run 10 Parallel Claude Agents Without Everything Breaking — Medium](https://medium.com/@kumaran.isk/how-to-run-10-parallel-claude-agents-without-everything-breaking-5b6346948e59)
- [pixel-agents-hq/pixel-agents — GitHub (fetched directly, MIT license + MetroCity sprite credit confirmed)](https://github.com/pixel-agents-hq/pixel-agents)
- [MetroCity Free Topdown Character Pack — itch.io (fetched directly, confirmed CC0 1.0 Universal)](https://jik-a-4.itch.io/metrocity-free-topdown-character-pack)
- [Adding a license to your open source art project](https://blog.lazerwalker.com/2022/06/14/oss-licensing-for-art.html)
- [Open-source licenses for game developers — GameDevHub](https://www.gamedevhub.dev/guides/open-source-licenses/)
- [Rebuilding Event-Driven Read Models in a safe and resilient way — Architecture Weekly](https://www.architecture-weekly.com/p/rebuilding-event-driven-read-models)
- [Guide to Projections and Read Models in Event-Driven Architecture — Event-Driven.io](https://event-driven.io/en/projections_and_read_models_in_event_driven_architecture/)
- [Read-Model Consistency and Lag — EventSourcingDB](https://docs.eventsourcingdb.io/best-practices/read-model-consistency-and-lag/)
- [OBS token routes bypass shared auth helpers, leak token via URL — GitHub Issue](https://github.com/staff1g/voicestream/issues/18)
- [Best Practices for Keeping a Forked Repository Up to Date — GitHub Discussion](https://github.com/orgs/community/discussions/153608)
- [XSS risk when rendering unsanitized user input — NiceGUI Security Advisory](https://github.com/zauberzeug/nicegui/security/advisories/GHSA-8c95-hpq2-w46f)
- [Do not rely on generic authentication for role-specific dashboards — GitHub Issue](https://github.com/Ridhesh927/Eminence/issues/76)

---
*Pitfalls research for: pixel-art AI dev-team visualization / event-driven orchestration / streaming integration (PixelFirm)*
*Researched: 2026-09-18*
