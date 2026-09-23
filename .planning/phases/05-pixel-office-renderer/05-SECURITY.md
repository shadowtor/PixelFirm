---
phase: "05"
slug: "pixel-office-renderer"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-23"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser client -> apps/api `/ws/browser` | First browser-facing connection into the control plane. Untrusted until token-authenticated. Internal-only until Phase 7. | `?token=` query param, snapshot `ProjectionState`, relayed `CompanyEvent`s |
| apps/api -> forked third-party renderer code | Projection state flows into code copied from pixel-agents (MIT, pinned commit `3537e140`) | Agent/task projection fields |
| Worker credential -> `POST /events` | Authenticated but not subject-scoped: proves a valid worker, not which agent/company it may write for | Event bodies incl. `sourceAgentId`, `companyId`, `visibility`, titles |
| Relayed `CompanyEvent` -> company-core `reduce` / apps/web / handoff FSM | Events may arrive out of order, in bursts, or twice; the office must never paint a state the events no longer support | Status and handoff events, agent/task ids |
| `observeGsdState` filesystem read -> emitted event payload | Observed workflow text becomes asserted company state | GSD phase/role/category |
| `POST /events` commit -> `/ws/browser` connection lifecycle | Ordering between a durable write and a connection's baseline snapshot | Buffered relay payloads |
| Control API caller -> ClaudeCodeRuntime -> Claude Code subprocess | pause/cancel are the human's only stop controls over an agent in a real repo | Stop signals, prompts, subprocess `env` |
| Runtime -> control plane (`POST /events`) | Status events the office renders as agent state | `task.status_changed`, handoff events |
| External asset sources -> dev-time decode scripts (pngjs) -> committed JSON | PNGs from GitHub at a pinned SHA or a user-supplied archive; decoded at script time only | PNG bytes, decoded sprite JSON, SHA-256 hashes |
| Committed sprite/layout JSON -> render loop | Build-time data read by indexed access in the per-frame draw path | `SpriteData`, layout tiles, seats, interaction slots |
| `Character.bubbleType` (closed enum) -> canvas draw | Glyph lookup keyed only by a closed TypeScript union | `BubbleType` |
| Projection text -> canvas / host API | `TaskState.title` and `AgentState.name` become visible text and `ActiveHandoff.fullTitle` | Titles, agent names |
| pixel-office engine -> host page (`getActiveHandoffs` / `getDialogueBox`) | Read accessors Phase 6 will hit-test and route approvals through | Handoff records, dialogue rects |
| Live-proof harness -> local test container and dev servers | Resets a DB volume, spawns api/web servers, issues a real worker credential | Local `.env` secrets, worker token, synthetic events |
| Proof artifact -> verification/release decision | A passing TRUTH is treated as evidence a requirement is met | Pass/fail assertions, screenshots |
| Repo assets -> redistributed derivative / attribution footer -> viewer | Licence and attribution claims shown to end users and on stream | Footer sentence, ASSET-LICENSES claims |
| Browser viewport -> App | Local numbers that size the canvas | `innerWidth` / `innerHeight` |
| Repo -> npm registry | Package installs (05-01 and 05-06 only) | Package code |

---

## Threat Register

Paths relative to repo root. "harness" = `scripts/verify-pixel-office-live.mjs`. Bare `:N` refers to the file named earlier in the same row.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Information Disclosure | apps/api/src/routes/ws-browser.ts | high | mitigate | `authenticateBrowser` length check + `timingSafeEqual` vs `BROWSER_ACCESS_TOKEN`, uniform 401 (auth/browser-auth.ts:27-43); `preValidation` (ws-browser.ts:19); env requires token (env.ts:13) | closed |
| T-05-02 | Tampering | apps/web/src/ws-client.ts | medium | mitigate | `CompanyEventSchema.safeParse` before `onEvent` (ws-client.ts:36-39) | closed |
| T-05-03 | Information Disclosure | ws-browser.ts unfiltered stream | medium | accept | Internal-only until Phase 7 SAFE-01/02; staging `/ws/browser` 404 (probed 2026-09-23) | closed |
| T-05-04 | Denial of Service | ws-browser.ts | low | mitigate | `rateLimit {max:20, timeWindow:"1 minute"}` (ws-browser.ts:20); plugin in server.ts:29 | closed |
| T-05-05 | Tampering | packages/pixel-office forked engine | medium | mitigate | 8 forked files + LICENSE cite `3537e140`; no `eval`/`new Function`/`import(` in src | closed |
| T-05-SC | Tampering | npm installs (react/react-dom/vite/@vitejs/plugin-react; pngjs) | high | mitigate | Blocking-human legitimacy checkpoints approved before install (05-01-SUMMARY:141, 05-06-SUMMARY:92); installed set matches | closed |
| T-05-06 | Repudiation | references/ASSET-LICENSES.md | low | accept | Documentation only | closed |
| T-05-07 | Tampering | company-core reducer.ts trusts `sourceAgentId` | medium | mitigate | Runtime sets it from own task record (claude-code-runtime.ts:83-87); reducer only reads (reducer.ts:241-256) | closed |
| T-05-08 | Repudiation | claude-adapter back-to-back handoff emission | low | accept | Documented single-session simplification | closed |
| T-05-09 | Information Disclosure | dialogue-templates.ts | medium | mitigate | Only title/name interpolated (:14-20, :63-73); forbidden-substring test (dialogue-templates.test.ts:112-128) | closed |
| T-05-10 | Spoofing | handoff-choreography.ts trusts `toAgentId` | low | accept | Only via authenticated, schema-validated relay | closed |
| T-05-18 | Tampering | events.ts `WORKER_ALLOWED_EVENT_TYPES` widened | medium | accept | Same credential trust tier (SEC-02); allow-list events.ts:18-26 | closed |
| T-05-19 | Repudiation / Info Disclosure | claude-code-runtime.ts completeHandoff | low | accept | In-memory bookkeeping on runtime's own data | closed |
| T-05-20 | Information Disclosure | ws-browser.ts WR-01 reorder | low | mitigate | `registerBrowserSocket` before snapshot SELECT (ws-browser.ts:36) | closed |
| T-05-21 | Tampering | agent-event-mapper.ts WR-02 guard | low | mitigate | Delegates to `reduce` (:31-44); reducer no-ops without `sourceAgentId` (reducer.ts:65, :83, :242) | closed |
| T-05-22 | Tampering | decode-metrocity-sprites.mjs | medium | mitigate | Fetch URL pinned to `COMMIT_SHA` (:34-35, :51) | closed |
| T-05-23 | Tampering | character-metrocity.json | low | accept | Committed, reviewable, reproducible | closed |
| T-05-24 | Tampering | bubbleSprites.ts lookup | low | accept | `BubbleType` closed union | closed |
| T-05-25 | Information Disclosure | renderer.ts bubble pass | low | accept | Glyphs only, no text surface | closed |
| T-05-26 | Information Disclosure | harness reads `.env` | low | accept | Local only; no secret in any log call | closed |
| T-05-09-01 | Tampering | ws-client -> `applyLiveEvent` | medium | mitigate | Only from `onEvent` after safeParse (App.tsx:73-78) | closed |
| T-05-09-02 | Spoofing | relayed `sourceAgentId` | medium | accept | Control-plane scope; carried by T-05-11-WR01 | closed |
| T-05-09-03 | Denial of Service | browser `ProjectionState` growth | low | accept | Bounded by snapshot data | closed |
| T-05-09-04 | Information Disclosure | `bubbleText` shows `TaskState.title` | medium | transfer | Phase 7 SAFE-01/02 (05-VERIFICATION Deferred #1; REQUIREMENTS.md:54-55, :144-145) | closed |
| T-05-10-01 | Spoofing | renderer.ts glyph placement | high | mitigate | Owner-bound `resolveBubbleY` (renderer.ts:174-180), centred (:381-395); tests renderer.test.ts:215, :275, :293, :334 | closed |
| T-05-10-02 | Denial of Service | spriteData.ts fixed-index access | medium | mitigate | `assertFrameCount` at module load (spriteData.ts:47, :71-73) | closed |
| T-05-10-03 | Repudiation | per-agent identity hue | medium | mitigate | FNV-1a of agentId, deterministic (index.ts:102-116) | closed |
| T-05-10-04 | Information Disclosure | glyph reveals task state | low | accept | Internal-only (T-05-03) | closed |
| T-05-11-01 | Spoofing | claude-code-runtime.ts role poll | high | mitigate | Role change emits only `gsd.phase_observed` (:258-305); `agentId` written only in startTask (:378); test :486 | closed |
| T-05-11-02 | Repudiation | append-only `events` table | high | mitigate | No path writes a role name as agentId (:258-305, :378) | closed |
| T-05-11-03 | Denial of Service | `/ws/browser` snapshot window | medium | mitigate | Buffer-then-promote (ws/browser-connections.ts); error path unregisters+closes (ws-browser.ts:43-52) | closed |
| T-05-11-04 | Denial of Service | per-socket buffer growth | low | accept | Lives for one SELECT | closed |
| T-05-11-WR01 | Spoofing / EoP | events.ts subject fields taken verbatim | high | accept | Documented with expiry + fix path (deferred-items.md:80-124) | closed |
| T-05-11-05 | Information Disclosure | title in handoff dialogue | medium | transfer | Phase 7 SAFE-01/02 | closed |
| T-05-12-01 | Repudiation | ASSET-LICENSES §1 and footer | high | mitigate | §1 "hair layer credit-only" (ASSET-LICENSES.md:15-67); credit-only footer (App.tsx:194-195) pinned by App.test.tsx:55 | closed |
| T-05-12-02 | Repudiation | harness | high | mitigate | Single page load (`openOffice` :712-717, called :807); clean-baseline truths (:1010-1025) | closed |
| T-05-12-03 | Tampering | harness target and per-run reset | high | mitigate | `assertHarnessOwnedTarget` (:124-167) runs first (:726) before `db:test:down` (:752); no DROP/DELETE | closed |
| T-05-12-04 | Information Disclosure | synthetic proof ids | low | accept | Local container, reset each run | closed |
| T-05-13-01 | Denial of Service | renderScene dialogue pass | medium | mitigate | Code-point caps 14/10, 34 budget (dialogue-templates.ts:31-39); test :85-92 | closed |
| T-05-13-02 | Tampering | canvas text of worker strings | low | accept | `fillText` interprets no markup | closed |
| T-05-13-03 | Spoofing | dialogue attributed to wrong agent | medium | mitigate | Tail binds to speaker (renderer.ts:275-322); sweeps renderer.test.ts:537, :869 | closed |
| T-05-13-04 | Repudiation | stale dialogue after handoff | medium | mitigate | `retireHandoff` clears owned lines (handoff-choreography.ts:183-195); test :397 | closed |
| T-05-13-05 | Tampering | handoff event delivered twice | medium | mitigate | `handledHandoffRequestIds` (:175, :212, :223); tests :287, :303 | closed |
| T-05-13-06 | Information Disclosure | titles visible in office | low | accept | Internal-only; expires with WR01 | closed |
| T-05-13-07 | Denial of Service | `handledHandoffRequestIds` growth | low | accept | `ponytail:` LRU upgrade note (:172) | closed |
| T-05-14-01 | Tampering | two agents on one tile | medium | mitigate | Occupancy-derived `nextDeskPosition` (index.ts:130-133); offline removes (:150) | closed |
| T-05-14-02 | Spoofing | agents indistinguishable | medium | mitigate | Hue collision probe (index.ts:109-115) | closed |
| T-05-14-03 | Denial of Service | desk exhaustion | low | accept | Degrades to last home (index.ts:132) | closed |
| T-05-14-04 | Repudiation | audit record misstating a ceiling | low | mitigate | 05-14 correction present (deferred-items.md:77), but :73 and :186 still say 54 desks; code has 16 seats + 4 standing spots (index.ts:126-133) | open — below high threshold (non-blocking) |
| T-05-15-01 | Elevation of Privilege | runQuery supersede path | high | mitigate | Per-invocation `currentRun` token; old stream stopped first; owner-only `inFlight` clear (claude-code-runtime.ts:145-172, :348) | closed |
| T-05-15-02 | Tampering | superseded invocation posts status | medium | mitigate | `isCurrent()` guards (:197, :219, :241, :244, :318) | closed |
| T-05-15-03 | Denial of Service | orphaned role-poll interval | low | mitigate | Self-clears when `!isCurrent()` (:261-263) | closed |
| T-05-15-04 | Information Disclosure | alternate auth env vars reach subprocess | medium | transfer | Transfer record lost (dropped from 05-REVIEW.md in `45c9a16`); code strips only `ANTHROPIC_API_KEY` (:189) | open — below high threshold (non-blocking) |
| T-05-16-01 | Tampering | harness reusing a dev server | medium | mitigate | TCP preflight refuses before reset/spawn (:728-739); fresh spawn (:459) | closed |
| T-05-16-02 | Repudiation | TRUTH passing on wrong pixels | medium | mitigate | Clean-baseline asserts (:1020-1024); owner-bound TRUTH 4 (:1228-1318) | closed |
| T-05-16-03 | Denial of Service | leaked dev servers | low | mitigate | `killChildren` in `.finally` (:406-416, :1335-1336) | closed |
| T-05-16-04 | Information Disclosure | synthetic ids in test container | low | accept | Cleared by next volume reset | closed |
| T-05-17-01 | Tampering | status mid-walk freezes sender | medium | mitigate | `setRestPose` defers during WALK (characters.ts:160-162); tests :397, :407 | closed |
| T-05-17-02 | Spoofing | stale handoff line | medium | mitigate | `retireHandoff` sole exit (`handoffs.delete` only at :185); tests :453, :470, :487 | closed |
| T-05-17-03 | Denial of Service | handoff request spam | low | accept | Bounded by event rate; WR01 | closed |
| T-05-17-04 | Information Disclosure | handoff dialogue text | low | accept | Fixed templates with caps; Phase 7 | closed |
| T-05-18-01 | Elevation of Privilege | runQuery preemption race | high | mitigate | Token claimed before await (:145-148), re-checked after (:168) | closed |
| T-05-18-02 | Tampering / Repudiation | pause/cancel undone during preemption | high | mitigate | Fresh token claimed (`record.currentRun = {}` :405, :434) | closed |
| T-05-18-03 | Denial of Service | superseded sendMessage | low | accept | Documented last-caller-wins | closed |
| T-05-18-04 | Information Disclosure | alternate auth env vars reach subprocess | medium | transfer | Same as T-05-15-04: transfer target has no record; code unchanged (:189) | open — below high threshold (non-blocking) |
| T-05-19-01 | Tampering | pose written over WALK | medium | mitigate | `setRestPose` sole writer, never over WALK (characters.ts:160-162); `hasArrived` (:136) | closed |
| T-05-19-02 | Tampering | stuck record drops completion | medium | mitigate | Advances on `hasArrived` (:313-314) | closed |
| T-05-19-03 | Spoofing | re-seated sender shown handing off | medium | mitigate | `senderIsCurrent` identity check (:145); new request retires sender's records (:227-232); tests :645, :691 | closed |
| T-05-19-04 | Denial of Service | request scan cost | low | accept | Bounded by event rate | closed |
| T-05-19-05 | Information Disclosure | handoff dialogue text | low | accept | Fixed templates with caps | closed |
| T-05-20-01 | Tampering | handoff erases status glyph | medium | mitigate | `statusBubble` written only in upsert (index.ts:167); `applyBubble` sole writer (:374-375); tests :736, :757 | closed |
| T-05-20-02 | Spoofing | completed branch with stale sender | low | mitigate | `senderIsCurrent` before receiver write (:259-260); test :794 | closed |
| T-05-20-03 | Denial of Service | orphaned ICON_VISIBLE record | low | mitigate | Loop-top `senderIsCurrent` retires it (:307-308); test :775 | closed |
| T-05-20-04 | Information Disclosure | handoff dialogue text | low | accept | Fixed templates with caps | closed |
| T-05-21-01 | Denial of Service | `displayScaleFor` huge viewports | low | mitigate | Integer floor (index.ts:20-27) | closed |
| T-05-21-02 | Tampering | harness screenshots | low | mitigate | Only with `PIXEL_OFFICE_SHOTS`, refused in-repo (:198-205) | closed |
| T-05-21-03 | Information Disclosure | higher-scale stream capture | low | accept | Resolution, not content | closed |
| T-05-22-01 | Tampering | sheets vs decoded JSON drift | medium | mitigate | SHA-256 per sheet (decode-metrocity-interior.mjs:96); `--check` (:140-153) run by officeSprites.test.ts:43 | closed |
| T-05-22-02 | Repudiation | asset provenance / licence | medium | mitigate | §1a listing re-fetched 2026-09-22 + user permission (ASSET-LICENSES.md:69-79) | closed |
| T-05-22-03 | Tampering | malformed PNG crashing pngjs | low | accept | Script-time only, hash-pinned | closed |
| T-05-22-SC | Tampering | package installs | low | accept | No new dependency | closed |
| T-05-23-01 | Repudiation | stuck state misread in grayscale/CVD | medium | mitigate | Outline/contrast/≥20-differing-cells tests (bubbleSprites.test.ts:145-197) | closed |
| T-05-23-02 | Tampering | malformed glyph JSON | low | mitigate | Exhaustiveness + palette tests (bubbleSprites.test.ts:27-47, :86-87) | closed |
| T-05-24-01 | Denial of Service | per-pixel floor fillRect | medium | mitigate | Per-(sprite, zoom) OffscreenCanvas cache (renderer.ts:66-80); fps floor TRUTH 7 (harness :1261) | closed |
| T-05-24-02 | Tampering | malformed layout JSON | low | mitigate | officeLayout.ts throws at load (:41, :59, :103-118); test renderer.test.ts:1105 | closed |
| T-05-25-01 | Repudiation | status animation hidden by seated rule | medium | mitigate | TYPE keeps typing frames (renderer.test.ts:1317, :1326) | closed |
| T-05-25-02 | Denial of Service | more than 20 agents | low | accept | Ceiling documented (index.ts:126-128) | closed |
| T-05-26-01 | Repudiation | harness drifting from engine layout | medium | mitigate | Geometry/colours read from JSON + constants.ts at run time (:178-219, :318-379) | closed |
| T-05-26-02 | Repudiation | footer over-claiming | medium | mitigate | Credit-only sentence pinned (App.test.tsx:55); ASSET-LICENSES :183-193 | closed |
| T-05-26-03 | Denial of Service | render cost regressions | low | mitigate | TRUTH 7 ≥30 fps (:1258-1262) | closed |
| T-05-27-01 | Repudiation | sender hidden / walking through agents | medium | mitigate | `interactionTileFor` + occupancy-aware `blockedTilesFor` (handoff-choreography.ts:54, :100-114); TRUTH 5 (harness :1170-1185) | closed |
| T-05-27-02 | Denial of Service | interaction-tile search | low | accept | ≤18 candidates, once per request | closed |
| T-05-27-03 | Tampering | handoff before participants exist | low | mitigate | Early return on `!fromChar \|\| !toChar` (:219) | closed |
| T-05-28-01 | Repudiation | line attributed to wrong agent | medium | mitigate | Tail binds to speaker (renderer.ts:275-322); tests renderer.test.ts:537, :669-698 | closed |
| T-05-28-02 | Repudiation | layout edit intruding into speaker band | medium | mitigate | Sweep over every home (renderer.test.ts:537-549) | closed |
| T-05-28-03 | Information Disclosure | task title on stream | medium | accept | Phase 7 SAFE-01/02 | closed |
| T-05-29-01 | Tampering / Spoofing | render-time text generation | high | mitigate | Static `DIALOGUE_TEMPLATES` (dialogue-templates.ts:14-20); forbidden-substring test (:112-128); no network code in package | closed |
| T-05-29-02 | Information Disclosure | task title on stream | medium | accept | Phase 7 SAFE-01/02 | closed |
| T-05-29-03 | Denial of Service | very long names/titles | low | mitigate | Caps 14/10 (:31-32); budget test (:85-92) | closed |
| T-05-30-01 | Repudiation | glyph read as neighbour's | medium | mitigate | Head-anchored owner-bound `resolveBubbleY` (renderer.ts:174-180); tests :207, :215, :275, :334; TRUTH 4 | closed |
| T-05-31-01 | Repudiation | licence attribution lost | medium | mitigate | Sentence pin (App.test.tsx:55); TRUTH 0 (harness :869-945) | closed |
| T-05-31-02 | Tampering | harness pointed at dev DB | low | accept | WR-05/WR-06 guards unchanged | closed |
| T-05-32-01 | Repudiation | seated rule on stuck agents | low | mitigate | Seated resting statuses keep pose/frozen/glyph (renderer.test.ts:1233-1245) | closed |
| T-05-32-02 | Repudiation | bubble-waiting distinguishable only by colour | medium | mitigate | 1x silhouette tests (bubbleSprites.test.ts:199-238), :181, :150 | closed |
| T-05-33-01 | Repudiation | resolveDialogueBox | medium | mitigate | Glyphs hard constraint (renderer.ts:346); sweep renderer.test.ts:537 | closed |
| T-05-33-02 | Denial of Service | obstacle scoring per frame | low | accept | ~300 comparisons per bubble, under fps floor | closed |
| T-05-34-01 | Tampering | officeLayout interaction block | low | mitigate | Throws at load (officeLayout.ts:103-118) | closed |
| T-05-34-02 | Repudiation | interactionTileFor | low | mitigate | Receiver TYPE only in completion branch (handoff-choreography.ts:276-278) | closed |
| T-05-35-01 | Information Disclosure | getActiveHandoffs full title | low | accept | Page already receives titles; Phase 7 | closed |
| T-05-35-02 | Tampering | host mutating FSM state | low | mitigate | New objects per call (handoff-choreography.ts:417-452; renderer.ts:492-494); tests :1526, :1543 | closed |
| T-05-36-01 | Information Disclosure | App.tsx footer | low | accept | Compile-time constant | closed |
| T-05-36-02 | Tampering | harness | medium | mitigate | Guards intact (:152, :726-739); `NEAR_BLACK_MAX = 16` (:690) | closed |
| T-05-36-03 | Denial of Service | third-viewport scan | low | accept | Dev-only harness | closed |
| T-05-36-04 | Spoofing | verification evidence | medium | mitigate | Footer background equality (App.test.tsx:114, :137) | closed |
| T-05-36-SC | Tampering | npm installs | high | mitigate | No dependency-file change in 05-36..05-41 (last: `ba31745`) | closed |
| T-05-37-01 | Spoofing | getActiveHandoffs speaker attribution | medium | mitigate | `bubbleTextTaskId` + `showsLineOf` (handoff-choreography.ts:157-158, :286, :337, :424-437); tests :1454, :1479 | closed |
| T-05-37-02 | Tampering | dialogue-line clear paths | medium | mitigate | All gated by `showsLineOf` (:187, :192, :270) | closed |
| T-05-37-03 | Information Disclosure | `ActiveHandoff.fullTitle` | medium | accept | Phase 7 SAFE-01/02 | closed |
| T-05-37-04 | Denial of Service | aisle-slot exhaustion | low | mitigate | Bounded by live records; `retireHandoff` sole exit (:185); test :985 | closed |
| T-05-37-05 | Tampering | pure-consumer Core Value | high | mitigate | No `Math.random`/`Date.now`/`fetch(`/`WebSocket`/`XMLHttpRequest`/timers/`import(` in non-test pixel-office src (only comments at index.ts:90-91) | closed |
| T-05-37-SC | Tampering | npm installs | high | mitigate | As T-05-36-SC | closed |
| T-05-40-01 | Information Disclosure | resolveHandoffDialogue | medium | mitigate | Null title -> fixed literal (dialogue-templates.ts:14-20); privacy header (:1-6, :55-62); test :112-128 | closed |
| T-05-40-02 | Information Disclosure | receiver id fallback | low | accept | Ids already visible; Phase 7 | closed |
| T-05-40-03 | Spoofing | getDialogueBox attribution | low | mitigate | Keyed on (speakerId, taskId) (renderer.ts:492-494); test handoff-choreography.test.ts:1479 | closed |
| T-05-41-01 | Tampering | resolveHandoffDialogue blank title | low | mitigate | `titleOrNull` (dialogue-templates.ts:50-53) at :69 | closed |
| T-05-41-02 | Tampering | `TaskCreatedPayload.title` not tightened | low | accept | Tightening breaks append-only replay; output-side rule covers it | closed |
| T-05-41-03 | Information Disclosure | `fullTitle` exposing task id | low | mitigate | `fullTitle: string \| null` via `titleOrNull` (handoff-choreography.ts:396, :440); tests :1362, :1368 | closed |
| T-05-41-04 | Denial of Service | interactionTileFor reservation loop | low | mitigate | `senderIsCurrent` in reservation check (:114); test :1006 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party / later phase)*

---

## Accepted Risks Log

Rationales were recorded at plan time in each cited `05-NN-PLAN.md` `<threat_model>` block.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-11-WR01 (high) | Worker credential can write events for any subject. Accepted for Phase 5; expires the first time a non-internal consumer or an externally reachable deployment points at the control plane. Fix owned by Phase 6/7 (deferred-items.md:80-124). | plan 05-11 | 2026-09-23 |
| AR-05-02 | T-05-03, T-05-10-04, T-05-13-06 | Unfiltered stream / visible titles and state are internal-only until Phase 7 visibility filtering; route not deployed publicly | plans 05-01/05-10/05-13 | 2026-09-23 |
| AR-05-03 | T-05-28-03, T-05-29-02, T-05-35-01, T-05-37-03, T-05-40-02, T-05-17-04, T-05-19-05, T-05-20-04, T-05-13-02 | Task titles/ids in dialogue: fixed templates with caps, `fillText` has no markup; stream-safety filtering is Phase 7 SAFE-01/02 | plans 05-13..05-40 | 2026-09-23 |
| AR-05-04 | T-05-09-02, T-05-10, T-05-18, T-05-19 | Relay trust: authenticated + schema-validated relay, same credential tier (SEC-02); spoofing carried by WR01 | plans 05-04/05-05/05-09 | 2026-09-23 |
| AR-05-05 | T-05-06, T-05-23, T-05-24, T-05-25, T-05-22-03, T-05-22-SC, T-05-36-01 | Docs/committed data/closed unions/compile-time constants: no runtime surface | plans 05-02..05-36 | 2026-09-23 |
| AR-05-06 | T-05-26, T-05-12-04, T-05-16-04, T-05-31-02, T-05-36-03 | Harness is local/dev-only; test container reset each run; guards unchanged | plans 05-08..05-36 | 2026-09-23 |
| AR-05-07 | T-05-08, T-05-18-03 | Documented behaviours: single-session handoff emission, last-caller-wins sendMessage | plans 05-03/05-18 | 2026-09-23 |
| AR-05-08 | T-05-09-03, T-05-11-04, T-05-13-07, T-05-14-03, T-05-17-03, T-05-19-04, T-05-25-02, T-05-27-02, T-05-33-02, T-05-21-03 | Bounded resource growth/cost (event rate, one SELECT, ≤18 candidates, 20-home ceiling, fps floor) | plans 05-09..05-33 | 2026-09-23 |
| AR-05-09 | T-05-41-02 | Loose `title` schema kept to preserve append-only replay; `titleOrNull` output rule covers it | plan 05-41 | 2026-09-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Open (non-blocking) and Advisory Notes

- **T-05-15-04 / T-05-18-04 (medium):** `packages/claude-adapter/src/claude-code-runtime.ts:189` strips only `ANTHROPIC_API_KEY`; `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY_HELPER`, `CLAUDE_CODE_USE_BEDROCK`/`_VERTEX` still reach the subprocess. The transfer record was lost in `45c9a16`. Close by filtering at :189 or recording a Phase 6-owned transfer in deferred-items.md.
- **T-05-14-04 (low):** deferred-items.md:73 and :186 still say "54 concurrently seated desks"; code has 16 seats + 4 standing spots.
- **Advisory (unregistered):** `BROWSER_ACCESS_TOKEN` travels as `?token=` (apps/web/src/ws-client.ts:15) and Fastify's default request log includes the query string; server.ts:20 redacts only headers. Register in Phase 6/7 before the route leaves internal-only use.
- **Advisory:** WR01's "externally reachable deployment" expiry trigger may already be met by staging `https://test.pixelfirm.dev` (public, pre-Phase-5 code; `/ws/browser` 404). Operator decision.
- **Advisory:** stale numbers in accepted rationales (T-05-14-03 cites 55+ agents, now 20; T-05-17-04/19-05/20-04 cite 16/12 caps, now 14/10). Premises still hold.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-23 | 128 (16 high, 43 medium, 69 low) | 125 | 3 (0 at/above high) | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-23
