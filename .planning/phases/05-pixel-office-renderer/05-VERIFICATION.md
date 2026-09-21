---
phase: 05-pixel-office-renderer
verified: 2026-09-21T16:55:00Z
status: gaps_found
score: 1/4 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
  - "apps/api/src/routes/events.ts"
  - "apps/api/src/routes/ws-browser.ts"
  - "apps/web/src/App.tsx"
  - "apps/web/src/agent-event-mapper.ts"
  - "packages/claude-adapter/src/claude-code-runtime.ts"
  - "packages/company-core/src/reducer.ts"
  - "packages/pixel-office/LICENSE"
  - "packages/pixel-office/src/constants.ts"
  - "packages/pixel-office/src/engine/characters.ts"
  - "packages/pixel-office/src/engine/renderer.ts"
  - "packages/pixel-office/src/handoff/dialogue-templates.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.ts"
  - "packages/pixel-office/src/index.ts"
  - "packages/pixel-office/src/sprites/bubbleSprites.ts"
  - "packages/pixel-office/src/sprites/spriteData.ts"
  - "references/ASSET-LICENSES.md"
  - "scripts/verify-pixel-office-live.mjs"
covered_digest: "v1:sha256:4f86994943d7526a21cb9c98abe718740be65dc43d8c782c87d1799474c429b9"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 1/4
  gaps_closed:
    - "Invisible sprites — getCharacterSprites() now returns real decoded MetroCity pixel data (05-06); renderer paints genuine non-transparent pixels"
    - "No bubble/icon render pass — renderScene now draws Character.bubbleType via resolveBubbleSprite (05-07); 12/12 BubbleType members resolve to real distinct-silhouette assets"
    - "CR-01 (old) worker allow-list — WORKER_ALLOWED_EVENT_TYPES now carries all 7 producer-emitted types (events.ts:18-26)"
  gaps_remaining:
    - "Criterion 1 is not true live — the client never re-derives AgentStatus from any event that actually flows; appearance changes only on page reload"
    - "Criterion 3 cannot fire in production — the choreography's unknown-character guard plus role-name toAgentId means the real producer path animates nothing"
  regressions:
    - "CR-02 (new): the 05-08 bubble clamp paints a row-2 agent's status glyph entirely inside the row-1 agent's sprite — empirically reproduced this session. 05-07 shipped a correct overlay; 05-08's clamp broke whose agent it belongs to."
    - "CR-04 (new): 05-05's completeHandoff ownership reassignment writes a GSD role string into record.agentId, so every later event's sourceAgentId is a role name, permanently, in an append-only table."
    - "WR-01 -> CR-03 (new): 05-05 moved registerBrowserSocket after the snapshot send, converting a recoverable duplicate-delivery race into an unrecoverable silent event-drop window."
gaps:
  - truth: "Agents are visible on screen on one floor, with sprites/animations matching their real current state (15 AgentStatus values)"
    status: partial
    reason: "Agents are now genuinely VISIBLE (05-06 wired real MetroCity pixel data; verified by direct read of spriteData.ts and by the live proof's non-zero sprite pixel count). But their appearance does not track real current state LIVE. apps/web/src/agent-event-mapper.ts:11 returns non-null only for agent.online and session.started; a repo-wide grep over apps/ packages/ scripts/ finds ZERO producers of either type (only schema, reducer, fixtures, tests, comments). The one status-bearing event that actually flows end-to-end is task.status_changed, and App.tsx's onEvent has no branch for it. A connected browser therefore receives the relayed event, the mapper returns null, and nothing changes: no pose, no bubble, no despawn. Agent appearance is frozen at whatever the connect-time snapshot fold produced until the user reloads the page. The 05-08 live proof concedes this in its own comment at line 374-376 and calls page.reload() before asserting the blocked bubble. Separately, CR-04 means the identity the office renders is wrong: claude-code-runtime.ts:249 calls completeHandoff(taskId, observed.role) and completeHandoff does record.agentId = toAgentId (:124), writing a GSD role label (\"Engineering\") into agentId, which becomes sourceAgentId on every later event and makes the reducer upsert a phantom role-named agent while the real agent is orphaned mid-task."
    artifacts:
      - path: "apps/web/src/agent-event-mapper.ts"
        issue: "Maps only agent.online/session.started — two event types no producer emits and neither of which is in WORKER_ALLOWED_EVENT_TYPES. The type that actually flows (task.status_changed) has no branch, here or in App.tsx's onEvent."
      - path: "packages/claude-adapter/src/claude-code-runtime.ts"
        issue: "Line 249 passes observed.role (a GSD role label) as toAgentId; line 124 writes it into record.agentId, corrupting sourceAgentId on every subsequent event in an append-only table."
      - path: "scripts/verify-pixel-office-live.mjs"
        issue: "Both Truth 1 and Truth 2 are asserted through the snapshot/reload path, not the live relay — the artifact named 'live end-to-end proof' does not exercise the live status path for the state it proves."
    missing:
      - "A task.status_changed branch in deriveCharacterUpsertFromStatusEvent reusing company-core's deriveAgentStatus, so the live path and the fold path cannot drift"
      - "A test asserting a relayed task.status_changed with status 'blocked' yields a BLOCKED upsert"
      - "Removal of page.reload() from the live proof's Truth 2 once the above lands, so the proof proves the live path it names"
      - "Separate role observation from agent identity at claude-code-runtime.ts:248-250 — a GSD role change is not a handoff to an agent named after the role"
  - truth: "A blocked or waiting-for-input agent is visually distinguishable at a glance from an active agent"
    status: failed
    reason: "Empirically falsified this session with a throwaway vitest against the real renderScene and a recording ctx (two characters, same column, interior rows 1 and 2, only the row-2 one carrying bubbleType 'blocked'). Measured result: row-1 agent's sprite occupies x 49-63, y -5..23; the row-2 agent's blocked glyph paints at x 52-61, y 1..11 — ENTIRELY INSIDE the row-1 agent's sprite box, and it does not touch its own sprite at all (row-2 sprite starts at y=11, glyph ends at y=11). renderer.ts:109's Math.max(0, ...) clamp collapses both row 1 and row 2 to bubbleY=0, and row 2 sorts later by zY (renderer.ts:116) so it paints last, over row 1's already-drawn head. nextDeskPosition() (index.ts:68-74) with interiorCols = DEFAULT_COLS-2 = 18 puts the first 36 agents on exactly these two rows. The office therefore reports the WRONG agent as blocked for effectively every agent in a normal-sized company — worse than showing no indicator. Compounding it, createCharacter is always called as createCharacter(agentId, col, row) with palette=0/hueShift=0 (index.ts:98) and getCharacterSprites ignores paletteIndex entirely (spriteData.ts:37-47), so every agent renders pixel-identical with no name label — verified: two different agent ids produce byte-identical sprite data. A viewer cannot tell which desk is which agent even before the glyph lands on the wrong one."
    artifacts:
      - path: "packages/pixel-office/src/engine/renderer.ts"
        issue: "Line 109 clamps bubbleY against canvas 0 rather than giving the glyph a position attached to its owner; rows 1 and 2 collapse to the same y and the later-sorted row-2 glyph paints over the row-1 agent. bubbleX is not clamped at all, so an edge-column agent's glyph runs off the side."
      - path: "packages/pixel-office/src/engine/renderer.test.ts"
        issue: "The 'strictly above its own base sprite' invariant test only ever exercises row 3; the clamp test only checks y >= 0, never whose sprite the glyph lands on. The defect is invisible to a green suite."
      - path: "packages/pixel-office/src/sprites/spriteData.ts"
        issue: "paletteIndex is accepted and folded into the cache key but never read; all agents render identical pixels (WR-08)."
    missing:
      - "Draw the glyph inside the character's own sprite box when there is no room above it, instead of clamping it into the row above — and clamp bubbleX against the map bounds"
      - "A renderer test with two characters in the same column, rows 1 and 2, asserting no bubble-palette pixel lands inside the row-1 character's painted extent"
      - "A top gutter row in buildDefaultTileMap so interior row 1 is never a desk (the durable fix)"
      - "A per-agent hue (or a name label) so two desks are tellable apart at all"
  - truth: "When one agent hands off work to another, the office shows the first agent walking over, a task icon appearing, and the second agent accepting it and moving to work — using deterministic, template-based dialogue, never LLM-generated at render time"
    status: partial
    reason: "The deterministic-dialogue half is genuinely VERIFIED: dialogue-templates.ts is a pure template map, its test suite grep-proves the absence of any forbidden LLM/network substring in both dialogue-templates.ts and handoff-choreography.ts, and the FSM correctly refuses to show acceptance before a real agent.handoff_completed arrives (test-enforced, handoff-choreography.test.ts:70, :98, :131). Handoff events also genuinely ride the LIVE relay (they are in WORKER_ALLOWED_EVENT_TYPES, and App.tsx:50-52 routes both halves to handleHandoffEvent) — this is the one part of the phase that is live rather than reload-bound. But the choreography cannot fire on the real producer path. handoff-choreography.ts:48 guards `if (!fromChar || !toChar) return;` and NOTHING creates a Character from a live event (see truth 1 — the live mapper handles only never-emitted types). So in production both getCharacter() lookups return undefined and the handler silently no-ops. CR-04 makes it strictly worse: the real toAgentId is a GSD role string, so even after a reload the office seats a phantom desk named 'Engineering' in a static CODING pose rather than showing any walk. The 05-08 live proof passes Truth 3 only because it pre-seeds BOTH synthetic agents (statusChanged(SENDER,...) and statusChanged(RECEIVER,...) at lines 353-354) through the snapshot fold on first page load before posting the handoff pair — it never exercises ClaudeCodeRuntime's actual emission path."
    artifacts:
      - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
        issue: "Line 48's unknown-character guard is correct defensively, but combined with the absent live character-creation path it means the production handoff path no-ops silently rather than animating."
      - path: "packages/claude-adapter/src/claude-code-runtime.ts"
        issue: "Lines 248-250 emit requestHandoff/completeHandoff with observed.role as toAgentId, so the receiving 'agent' is a workflow role name that will never have a desk."
      - path: "scripts/verify-pixel-office-live.mjs"
        issue: "Truth 3 pre-seeds both participants with synthetic ids via the snapshot path; it does not prove the real producer's handoff renders."
    missing:
      - "Live character creation (the truth-1 fix) so getCharacter() can resolve both handoff participants without a reload"
      - "A real agent id for toAgentId — resolve the observed GSD role through a role-to-agent registry, or stop emitting handoff events for role changes and emit gsd.phase_observed instead (the reducer already consumes it)"
      - "An end-to-end check that drives ClaudeCodeRuntime's own emission path rather than hand-posted synthetic events"
deferred: []
advisory:
  - finding: "CR-03 — /ws/browser registers the socket after the snapshot send (ws-browser.ts:34-39), so an event committed during the awaited SELECT is in neither the snapshot nor the relay and is lost for the connection's lifetime; ws-client.ts has no resync."
    category: architectural
    reason: "New scope relative to the carried-forward gap set (WR-01's fix introduced it in 05-05). Confirmed by source read, but reproducing the drop needs a gated db.select spy that does not exist yet. Fix: register with a buffering sink first, send snapshot, then promote and flush."
    evidence_status: "none provided"
  - finding: "WR-01 — a worker credential can author state for any agent, any company, any visibility. sourceAgentId/companyId/visibility are taken verbatim from the request body (events.ts:47-62); only the heartbeat path keys on the authenticated request.workerId. Widening the allow-list in 05-05 widened the blast radius."
    category: security
    reason: "Subject authorization, not event-type authorization, is the gap. Needs workers to carry agentId/companyId columns. If that is Phase 6/7 work it should be recorded as an accepted threat with the same rigour as T-05-03 rather than left implied."
    evidence_status: "none provided"
  - finding: "WR-09 — references/ASSET-LICENSES.md §1 is titled 'Confirmed CC0' for the MetroCity pack on the sole evidence of a credit line in the fork's README, while §4 of the same document states the rule 'never silently upgraded to confirmed'. App.tsx:86-87 now asserts that CC0 claim to every end user, and the repo redistributes a decoded derivative (character-metrocity.json). The 12 bubble/badge JSON assets appear nowhere in the document while §3 asserts 'None' for provenance-undocumented assets in use."
    category: other
    reason: "Does not break criterion 4 (attribution is preserved and visible), but the audit over-claims. Resolving requires a human to locate a primary CC0 source by URL. Routed to human verification below."
    evidence_status: "none provided"
unverified_prohibitions:
  - statement: "MUST NOT preserve attribution only in a planning document while the deployed apps/web application itself shows no visible credit"
    requirement_id: OFFICE-02
    verification: test
    disposition: "unverified — flagged. The footer IS present (App.tsx:73-88, confirmed by direct read), but NO wired test enforces it; apps/web's suite is 2 files (agent-event-mapper, ws-client) and neither renders App. Fail-closed per the test-tier rule: a test-tier prohibition reaching verify with no enforcement is never green."
  - statement: "MUST NOT present provenance-undocumented assets (furniture/floor/wall/carpet/pet) as 'confirmed' licensed in references/ASSET-LICENSES.md"
    requirement_id: OFFICE-02
    verification: test
    disposition: "unverified — flagged. Literally satisfied for its named subjects (§3 says 'None', §4 defers all five packs). But no test enforces it, and the sibling over-claim on the MetroCity pack (WR-09) shows the discipline is not mechanically held."
  - statement: "MUST NOT rely solely on colour/hue to distinguish blocked/waiting from active — the distinction must remain legible in a grayscale/colourblind-simulated view"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: the 12 glyphs are distinct-silhouette and test-asserted as such, so the shape-not-colour rule is honoured in the asset data. Moot in practice while CR-02 paints the glyph on the wrong agent. unverified-prohibition — human review recommended."
  - statement: "MUST NOT ship a state-signal overlay that is technically data-correct and mechanically confirmed to paint SOME pixels, but is practically illegible at typical stream/viewing scale"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: FAILS on a stronger ground than legibility — the glyph is not merely hard to read, it is attached to the wrong agent for the first 36 desks (CR-02, empirically reproduced). unverified-prohibition — human review recommended."
  - statement: "MUST NOT treat TaskState.title as inherently safe to interpolate into rendered handoff dialogue/bubble text without limit or filtering"
    requirement_id: HANDOFF-02
    verification: null
    disposition: "carried forward as explicitly unresolved by 05-05-PLAN.md, scoped to Phase 7 (SAFE-01/02). Legitimately out of phase boundary — flagged forward, not a phase-05 gap."
  - statement: "MUST NOT credit/attribute an asset pack in-app or in ASSET-LICENSES.md that the shipped renderer does not actually load"
    requirement_id: OFFICE-02
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: RESOLVED — 05-06 decodes the real pinned-commit char_0.png into character-metrocity.json and spriteData.ts:22 imports it, so the credit now tracks what is drawn. Both 05-05 and 05-06 requested a human visual spot-check that the decoded frames genuinely resemble the upstream art; that check has not been performed. unverified-prohibition — human review recommended."
human_verification:
  - test: "Open the office, leave the page open, and post a task.status_changed event moving a real agent to 'blocked' WITHOUT reloading. Watch the canvas."
    expected: "The agent's pose freezes and a blocked glyph appears above that agent, live, with no navigation."
    why_human: "This is the phase's headline claim and the one the automated proof routes around with page.reload(). Source analysis says it cannot work today; a human watching an un-reloaded page settles it beyond dispute."
  - test: "Seat at least 20 agents (so rows 1 and 2 both fill), put ONLY an agent on interior row 2 into 'blocked', and look at which figure the glyph sits on."
    expected: "The glyph sits on the blocked row-2 agent, not on the agent in front of it."
    why_human: "Reproduced mechanically this session (glyph lands entirely inside the row-1 sprite), but 'which agent does a viewer think is blocked' is the actual user-facing bar and deserves one human look before the fix is scoped."
  - test: "Locate a primary CC0 source for the MetroCity character pack (itch.io / OpenGameArt page, or a LICENSE inside the upstream asset pack) and cite it by URL in references/ASSET-LICENSES.md §1."
    expected: "Either a citable primary source is found and §1's 'Confirmed CC0' stands, or the pack moves to a 'credited, licence not independently verified' tier and App.tsx's footer softens to match."
    why_human: "Licence provenance cannot be established by reading this repo — it requires visiting the upstream asset source."
  - test: "Visually compare a rendered character against the fork's own MetroCity art (webview-ui/public/assets/characters/char_0.png at the pinned commit)."
    expected: "The rendered figure recognisably matches the upstream sprite — not a mis-decoded, mirrored, or corrupted frame."
    why_human: "Requested explicitly by both 05-05 and 05-06's OFFICE-02 prohibitions; 'looks like the source art' is not reducible to a pixel-count assertion."
---

# Phase 5: Pixel Office Renderer Verification Report

**Phase Goal:** The forked Pixel Agents office renders real company state on screen as a pure consumer of projections — never a fabricated animation.
**Verified:** 2026-09-21T16:55:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure plans 05-05 … 05-08

## The Specific Question: is criterion 1 true live, or only after a reload?

**Only after a reload.** This is settled by source, not inference:

1. `apps/web/src/agent-event-mapper.ts:11` returns non-null for exactly two event types: `agent.online` and `session.started`.
2. A repo-wide grep over `apps/ packages/ scripts/` for those two types hits **only** the schema definition, the reducer, `company-core`'s fixtures, three test files, two comments, and the live-proof script's own explanatory header. **No producer emits either one.** Neither is in `WORKER_ALLOWED_EVENT_TYPES`, so even a hypothetical producer would be 403'd.
3. The only status-bearing event that actually flows is `task.status_changed`. `App.tsx`'s `onEvent` (lines 41-53) has no branch for it — it calls the mapper (returns `null`), checks `task.created`, and checks the two handoff types. Nothing else.
4. Therefore a connected browser receives the relayed status event and does nothing with it. Agent appearance is fixed at the connect-time snapshot fold until the page is reloaded.
5. The phase's own live proof confirms this in a comment it wrote itself (`verify-pixel-office-live.mjs:373-376`): *"A live-connected client does not currently re-derive AgentStatus from task.status_changed (documented gap …), so reload to take a fresh snapshot."* It then calls `page.reload()` before asserting Truth 2. Truth 1 is likewise asserted against a first page load, i.e. also the snapshot path.

The live relay is real and works — it is exercised end-to-end for the **handoff** event pair (Truth 3), which is why the phase is not wholly reload-bound. But agent *state* rendering, which is criteria 1 and 2, runs entirely through the fold-on-navigate path.

Against the phase goal — "renders real company state on screen as a pure consumer of projections" — a renderer that requires a human to press F5 to see a state change is not rendering company state. **The goal is not met.**

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agents visible on one floor, sprites/animations matching real current state (15 AgentStatus values) | ✗ FAILED (partial) | **Visibility: closed.** 05-06 wired real decoded MetroCity pixel data into `getCharacterSprites` (`spriteData.ts:22,42-67`) — agents genuinely paint. **State fidelity: broken.** Live path is dead (see section above). Identity is also wrong: `claude-code-runtime.ts:249` passes `observed.role` to `completeHandoff`, which writes it to `record.agentId` (`:124`), so a GSD role string becomes `sourceAgentId` on every later event and the reducer upserts a phantom role-named agent into an append-only table while the real agent is orphaned. |
| 2 | Blocked/waiting agent visually distinguishable at a glance from an active agent | ✗ FAILED | **Empirically reproduced this session.** Ran the real `renderScene` with a recording ctx: two characters, same column, interior rows 1 and 2, only row 2 blocked. Row-1 sprite = x 49-63, y −5..23. Row-2's blocked glyph = x 52-61, y 1..11 — **entirely inside the row-1 agent**, and not touching its own sprite at all. `renderer.ts:109`'s `Math.max(0, …)` collapses rows 1-2 to `bubbleY=0`; row 2 sorts later (`:116`) so it paints last, over row 1's head. `nextDeskPosition()` puts the first 36 agents on exactly those rows. The office reports the **wrong agent** as blocked. Also verified: two different agent ids produce byte-identical sprite data (`paletteIndex` accepted but never read, `spriteData.ts:37-47`; `createCharacter(agentId, col, row)` always defaults, `index.ts:98`) with no name label — desks are not tellable apart at all. |
| 3 | Handoff shows walk / task icon / acceptance, with deterministic template dialogue | ✗ FAILED (partial) | **Dialogue half verified.** Pure template map; test-proven absence of any LLM/network substring in both handoff files; acceptance is test-gated on a real `agent.handoff_completed` (`handoff-choreography.test.ts:70,:98,:131`). Handoff events genuinely ride the live relay. **Choreography half cannot fire in production.** `handoff-choreography.ts:48` guards `if (!fromChar || !toChar) return;` and nothing creates a Character from a live event — so both lookups return `undefined` and the handler no-ops. CR-04 compounds it: the real `toAgentId` is a role string that will never have a desk. The 05-08 proof passes only by pre-seeding both synthetic agents via the snapshot on first load (`:353-354`) before posting the handoff. |
| 4 | Pixel Agents attribution and licence notices remain visible and preserved | ✓ VERIFIED | `packages/pixel-office/LICENSE` reproduces the MIT text verbatim with source URL and pinned commit `3537e140…`; every forked file under `src/` carries a 3-line attribution header (spot-checked across 10 files); `App.tsx:73-88` renders an always-on fixed footer crediting `pixel-agents-hq/pixel-agents (MIT)` and the MetroCity pack, not gated behind a menu; `references/ASSET-LICENSES.md` exists with all four sections. ⚠️ See WR-09 in Advisory — §1's "Confirmed CC0" over-claims on README-credit evidence, and the footer now asserts that claim to end users. Attribution is preserved; the licence *audit* over-claims. |

**Score:** 1/4 truths verified

### Deferred Items

None. No later milestone phase (6, 7, or 8) covers live status relay, bubble positioning, or agent-identity correctness. Phase 7's SAFE-01/02 covers the carried-forward `TaskState.title` filtering prohibition only.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | CR-03 — `/ws/browser` silently drops events committed during the snapshot SELECT window | architectural | New scope (introduced by 05-05's WR-01 fix). Confirmed by source read; reproducing the drop needs a gated `db.select` spy that does not exist. |
| 2 | WR-01 — worker credential can author state for any agent/company/visibility | security | Subject authorization gap, not event-type. Needs schema columns; plausibly Phase 6/7 work. |
| 3 | WR-09 — `ASSET-LICENSES.md` §1 upgrades MetroCity to "Confirmed CC0" on evidence §4 calls insufficient | other | Resolving needs a human to find a primary upstream source. Routed to human verification. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/pixel-office/src/sprites/spriteData.ts` | Real, non-transparent pixel data | ✓ VERIFIED | Imports `character-metrocity.json`; frame→pose mapping matches the fork verbatim. Closes the prior invisible-sprite gap. (`paletteIndex` dead — WR-08.) |
| `packages/pixel-office/src/sprites/bubbleSprites.ts` | 12 distinct-silhouette glyphs | ✓ VERIFIED | All 12 `BubbleType` members resolve; distinctness test-asserted. |
| `packages/pixel-office/src/engine/renderer.ts` | Bubble draw pass above own character | ⚠️ HOLLOW | Draw pass exists and paints real pixels, but positions the glyph over a *different* agent for the first 36 desks (CR-02, reproduced). |
| `packages/pixel-office/src/status/status-mapping.ts` | Exhaustive 15-value STATUS_MAP | ✓ VERIFIED | 15/15, no fallthrough, correct `frozen` flags, distinct waiting bubbles. |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | Walk/icon/accept FSM | ⚠️ ORPHANED in production | Logic correct and test-covered; unreachable on the real producer path (unknown-character guard + role-name `toAgentId`). |
| `packages/pixel-office/src/handoff/dialogue-templates.ts` | Deterministic template dialogue | ✓ VERIFIED | Pure map; grep-proven zero LLM/network surface. |
| `apps/api/src/routes/events.ts` | Allow-list covering producer-emitted types | ✓ VERIFIED | All 7 types present (`:18-26`), 202 regression tests exist. Closes old CR-01. |
| `apps/web/src/agent-event-mapper.ts` | Live status→character mapper | ✗ STUB (in effect) | Pure and correctly guarded, but maps only never-emitted types. Dead code in production. |
| `apps/api/src/routes/ws-browser.ts` | Snapshot-then-relay | ⚠️ VERIFIED w/ defect | Snapshot fold is real; registration ordering opens a silent drop window (CR-03, advisory). |
| `packages/pixel-office/LICENSE` | Verbatim MIT + provenance | ✓ VERIFIED | Correct text, URL, pinned SHA. |
| `references/ASSET-LICENSES.md` | D-05 asset-licence audit | ⚠️ VERIFIED w/ over-claim | All 4 sections present; §1 over-claims (WR-09), bubble assets unlisted. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `claude-adapter/claude-code-runtime.ts` | `apps/api/routes/events.ts` | `postEvent` → `POST /events` | ✓ WIRED | All 4 runtime-emitted types now accepted (old CR-01 closed). |
| `apps/api/routes/events.ts` | `ws/browser-connections.ts` | `broadcastToBrowsers` | ✓ WIRED | Called after every non-duplicate insert. |
| `apps/web/ws-client.ts` | `apps/api/routes/ws-browser.ts` | `ws/browser?token=` | ✓ WIRED | Re-validates every relayed event. |
| relayed `task.status_changed` | `pixel-office` `upsertCharacterFromAgent` | `agent-event-mapper` → `App.tsx onEvent` | ✗ NOT WIRED | **The break.** Mapper has no branch for the type; `onEvent` has none either. Live status never reaches the renderer. |
| relayed handoff pair | `handleHandoffEvent` | `App.tsx:50-52` | ✓ WIRED (but inert) | Reaches the FSM live; FSM returns early because neither participant has a Character. |
| `claude-code-runtime` role poll | `record.agentId` | `completeHandoff(taskId, observed.role)` | ✗ BROKEN (CR-04) | Writes a GSD role label where an agent id belongs; propagates to `sourceAgentId` permanently. |
| `App.tsx` | attribution footer | always-on `<footer>` | ✓ WIRED | Not gated behind a menu/modal. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Character sprite pixels | `SpriteData` from `getCharacterSprites()` | Decoded real MetroCity `char_0.png` | Yes | ✓ FLOWING |
| `Character.state` / `bubbleType` on **connect** | snapshot `fold()` over real stored rows | Real append-only event log | Yes | ✓ FLOWING |
| `Character.state` / `bubbleType` on **live event** | `deriveCharacterUpsertFromStatusEvent` | Returns `null` for every type that flows | No | ✗ DISCONNECTED |
| `Character.palette` / `hueShift` | always `0` / `0` at the call site | Hardcoded defaults | No | ✗ HOLLOW_PROP |
| Handoff walk path | `walkCharacterTo` via real `findPath` BFS | Real tile coords — but unreachable in prod | No (prod) | ✗ DISCONNECTED |
| Attribution footer text | static JSX | Intentionally static | N/A | ✓ (correct as static) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Row-2 agent's blocked glyph stays off the row-1 agent | throwaway vitest against real `renderScene` + recording ctx | `BUBBLE_OVERLAPS_ROW1_AGENT: true`; glyph y 1..11 inside row-1 sprite y −5..23; `bubbleTouchesOwnSprite: false` | ✗ FAIL (CR-02 confirmed) |
| Two different agent ids render different pixels | same run | `ALL_AGENTS_PIXEL_IDENTICAL: true` | ✗ FAIL (WR-08 confirmed) |
| Any producer emits `agent.online` / `session.started` | `grep -rn` over `apps packages scripts` | Only schema, reducer, fixtures, tests, comments, proof-script header | ✗ FAIL (CR-01 confirmed) |
| `WORKER_ALLOWED_EVENT_TYPES` covers runtime-emitted types | direct read `events.ts:18-26` | All 7 present | ✓ PASS (old CR-01 closed) |
| `getCharacterSprites` returns non-transparent data | direct read `spriteData.ts:22,42-67` | Real JSON-backed frames | ✓ PASS (invisible-sprite gap closed) |
| `completeHandoff` receives a real agent id | direct read `claude-code-runtime.ts:248-250, :117-130` | Receives `observed.role`; writes it to `record.agentId` | ✗ FAIL (CR-04 confirmed) |
| `pixel-office` suite | `npx vitest run --root packages/pixel-office` | 7 files, 50 tests, all passed | ✓ PASS |
| `apps/web` suite | `npx vitest run --root apps/web` | 2 files, 9 tests, all passed | ✓ PASS |
| Debt markers in phase-touched files | `grep -rn "TBD\|FIXME\|XXX"` | None | ✓ PASS |

**Note on green suites:** both suites pass while all four criticals are live. That is the central signal of this verification — every defect found here sits in a seam the tests do not cover (row-1/row-2 collision, producer/consumer event-type drift, role-vs-agent-id semantics, snapshot registration timing).

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes exist in this repo. `scripts/verify-pixel-office-live.mjs` is the phase's live proof; it was **not** executed here because it starts two dev servers, connects to Postgres, and `CREATE DATABASE`s against whatever `DATABASE_URL` names with no locality guard (WR-05) — a state-mutating side effect this verification must not cause. Its logic was read in full instead, which is how the `page.reload()` and pre-seeding workarounds were found.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| OFFICE-01 | 05-01, 05-02, 05-03, 05-05, 05-06, 05-07, 05-08 | 15-value status→sprite fidelity on one floor | ✗ BLOCKED | Sprites visible and mapping exhaustive, but state only updates on reload; rendered agent identity corrupted by CR-04 (Truth 1) |
| OFFICE-02 | 05-02, 05-05, 05-06 | Attribution/licence preserved | ✓ SATISFIED | LICENSE verbatim + per-file headers + always-on footer + audit doc (Truth 4). ⚠️ audit over-claims (WR-09); no test pins the footer |
| OFFICE-03 | 05-02, 05-07, 05-08 | Blocked/waiting glanceable signal | ✗ BLOCKED | Glyph paints on the wrong agent for the first 36 desks; all agents pixel-identical (Truth 2) |
| HANDOFF-01 | 05-03, 05-04, 05-05, 05-07, 05-08 | Physical walk/icon/accept handoff | ✗ BLOCKED | FSM correct and live-wired but unreachable in production (Truth 3) |
| HANDOFF-02 | 05-04, 05-05 | Deterministic/template dialogue, never LLM | ✓ SATISFIED | Pure template map, grep-proven zero LLM/network surface, test-enforced |

No orphaned requirements — all five Phase 5 IDs are claimed by at least one plan's `requirements` frontmatter, and REQUIREMENTS.md maps no additional IDs to Phase 5.

**REQUIREMENTS.md accuracy:** lines 31-46 and 134-138 mark all five as `[x]` / "Complete". For OFFICE-01, OFFICE-03 and HANDOFF-01 that is premature — three of the four criteria they serve are not achieved. 05-05's own must_have truth said these should stay marked Gaps Found until 05-06/07/08 landed; they landed but did not close. Recommend reverting those three to Gaps Found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pixel-office/src/engine/renderer.ts` | 109 | Clamp-to-canvas that relocates an owner-bound overlay onto a neighbour | 🛑 Blocker | Reports the wrong agent as blocked (CR-02) |
| `packages/pixel-office/src/engine/renderer.ts` | 115 | Comment states the opposite of the ascending sort below it | ℹ️ Info | It is the comment a future reader will trust while reasoning about exactly the overlay ordering that broke (IN-06) |
| `apps/web/src/agent-event-mapper.ts` | 11 | Guard clause filtering to types no producer emits — dead branch | 🛑 Blocker | Live status rendering is a no-op (CR-01) |
| `packages/claude-adapter/src/claude-code-runtime.ts` | 124, 249 | Type-level-valid but semantically wrong value (role string as agent id) | 🛑 Blocker | Phantom agents in an append-only table (CR-04) |
| `packages/pixel-office/src/sprites/spriteData.ts` | 37-47 | Parameter accepted, cached on, never read | ⚠️ Warning | All agents pixel-identical (WR-08) |
| `packages/pixel-office/src/sprites/spriteData.ts` | 42-66 | Unvalidated fixed-index access `d[0]`..`d[6]` | ℹ️ Info | A regenerated JSON with a different frame count crashes inside the render loop rather than at load (IN-04) |

No `TBD` / `FIXME` / `XXX` debt markers in any phase-touched file.

**Re-verification evidence gate:** the two blockers that are *not* carried-forward gaps (CR-02 in `renderer.ts`, CR-04 in `claude-code-runtime.ts`) both sit in files git-modified after the prior verification's `2026-09-21T14:10` timestamp, and both additionally carry deterministic evidence — CR-02 a red test run live this session, CR-04 a direct two-site source read. Both block unconditionally. CR-03 and WR-01 are new-scope without deterministic reproduction and are recorded as Advisory only.

### Human Verification Required

1. **Live status change without reload** — post `task.status_changed` → `blocked` for a real agent with the office page open and untouched. Expect: pose freezes, glyph appears, no navigation. This is the claim the automated proof routes around with `page.reload()`.
2. **Whose agent is blocked** — seat 20+ agents so rows 1 and 2 both fill, block only a row-2 agent, and look. Expect the glyph on the blocked agent. Mechanically it lands on the agent in front of it.
3. **MetroCity CC0 provenance** — find a primary CC0 source by URL, or downgrade §1 and soften the in-app footer. Cannot be resolved from inside this repo.
4. **Decoded sprite fidelity** — compare a rendered character against the fork's `char_0.png` at the pinned commit. Requested by both 05-05 and 05-06's OFFICE-02 prohibitions; never performed.

### Gaps Summary

The four gap-closure plans did real work. Three prior gaps are genuinely closed: sprites are no longer transparent (05-06 decoded the real pinned-commit MetroCity art), the bubble overlay draw pass exists with all 12 glyphs authored and distinct (05-07), and the worker allow-list now carries every type the runtime emits (05-05). Those are not paper fixes — each is confirmed by direct source read.

But the phase goal is still not met, and two of the remaining failures were **introduced** by the closure round rather than surviving it:

- **CR-02 is a regression.** 05-07 shipped an overlay that drew correctly above its own character. 05-08 then clamped it to the canvas to rescue row-1 agents from an invisible glyph — and in doing so collapsed rows 1 and 2 onto the same y. Because row 2 sorts later, its glyph now paints on top of the row-1 agent's head. Reproduced here with a real `renderScene` run: the glyph lands **entirely inside** the other agent's sprite and never touches its own. For a blocked indicator that is worse than the original problem: an invisible glyph shows nothing, this one accuses the wrong agent. And it affects the first 36 desks, i.e. every agent in a normal company.
- **CR-04 is a regression.** The prior verification asked for `completeHandoff` to reassign `record.agentId`. 05-05 implemented exactly that — with the wrong value. The only caller passes `observed.role`, a GSD workflow label, so a role name is now written into `agentId` and rides out as `sourceAgentId` on every later event into an **append-only** table that cannot be corrected by an UPDATE. The test codifies it as intended (`expect(pausedCall![2].sourceAgentId).toBe("Engineering")`).

And the original headline gap was never closed at all. The old CR-01 fix widened the *server* allow-list to the four types the runtime emits, while the *client* mapper was left handling the two types nobody emits. The two halves of that fix point in opposite directions, and the seam between them is where live rendering lives. **Answering the question this verification was asked:** criterion 1 is true only after a page reload. The office's agent state is a snapshot taken at navigation time, not a live projection. The phase's own live-proof script documents this in a comment and works around it with `page.reload()` — which means the artifact named "live end-to-end proof" does not exercise the live path for the thing it proves. Criterion 3 is worse still: the choreography is correctly wired to the live relay, but its unknown-character guard can never be satisfied in production because nothing creates a Character from a live event, so the real handoff path silently animates nothing.

The unifying root cause is narrow and cheap to fix: **`apps/web` has no live path that creates or updates a Character.** One branch in `deriveCharacterUpsertFromStatusEvent` for `task.status_changed`, reusing `company-core`'s existing `deriveAgentStatus` so the live and fold paths cannot drift, resolves criterion 1 and unblocks criterion 3's guard in a handful of lines. CR-02 needs the glyph attached to its owner rather than clamped to the canvas (plus a two-character regression test that would have caught it). CR-04 needs role observation kept separate from agent identity at the single call site.

One structural note for the next round: every defect here passed a green suite. The tests assert the right things about single characters, pure functions, and allow-list membership; the bugs all live in the seams between two components (row 1 vs row 2, producer vs consumer type sets, role vs agent id, registration vs snapshot timing). Gap-closure plans for this phase should each carry at least one test that spans two components, not one.

---

*Verified: 2026-09-21T16:55:00Z*
*Verifier: Claude (gsd-verifier)*
