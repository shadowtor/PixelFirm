---
phase: 05-pixel-office-renderer
verified: 2026-09-21T20:50:00Z
status: gaps_found
score: 3/4 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
  - ".planning/phases/05-pixel-office-renderer/05-01-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-01-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-02-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-02-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-03-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-03-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-04-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-04-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-05-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-05-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-06-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-06-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-07-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-07-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-08-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-08-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-09-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-09-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-10-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-10-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-11-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-11-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-12-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-12-SUMMARY.md"
  - "apps/api/src/routes/events.ts"
  - "apps/api/src/routes/ws-browser.ts"
  - "apps/api/src/ws/browser-connections.ts"
  - "apps/web/src/App.test.tsx"
  - "apps/web/src/App.tsx"
  - "apps/web/src/agent-event-mapper.test.ts"
  - "apps/web/src/agent-event-mapper.ts"
  - "apps/web/src/ws-client.ts"
  - "packages/claude-adapter/src/claude-code-runtime.ts"
  - "packages/company-core/src/reducer.ts"
  - "packages/pixel-office/LICENSE"
  - "packages/pixel-office/src/engine/characters.ts"
  - "packages/pixel-office/src/engine/renderer.ts"
  - "packages/pixel-office/src/handoff/dialogue-templates.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.ts"
  - "packages/pixel-office/src/index.ts"
  - "packages/pixel-office/src/sprites/bubbleSprites.ts"
  - "packages/pixel-office/src/sprites/spriteData.ts"
  - "packages/pixel-office/src/status/status-mapping.ts"
  - "references/ASSET-LICENSES.md"
  - "scripts/verify-pixel-office-live.mjs"
covered_digest: "v1:sha256:e1f73416d0a06332ac4760fded8b59697d509e22c2d222d2b77ccd09d13d9ee9"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 1/4
  gaps_closed:
    - "Criterion 1 live path — applyLiveEvent now runs company-core's own reduce over the live projection; OBSERVED live this session: 588 sprite pixels painted from relayed events on an already-open page, single navigation, empty canvas before the first event"
    - "CR-02 (glyph on the wrong agent) — resolveBubbleY is owner-bound and desk rows are re-pitched to 3/6/9; independently reproduced clean this session (20 seated agents, blocked agent on row 6: zero glyph pixels inside the row-3 agent's sprite box, glyph strictly above its own)"
    - "CR-04 (GSD role label written into record.agentId) — completeHandoff's ownership reassignment is gone; the role poll now emits gsd.phase_observed and no role string reaches any agent-id field"
    - "WR-09 (ASSET-LICENSES.md over-claim) — §1 is split into the two evidence links it actually depends on, §3 accounts for all 12 bubble/badge assets, and the in-app footer no longer asserts a licence over the shipped bytes"
    - "WR-08 (all agents pixel-identical) — partially closed: getCharacterSprites now takes and reads a per-agent hue; see gap 2 for the residual"
    - "unrun-verify (WINDOWS #7) — scripts/verify-pixel-office-live.mjs EXECUTED BY THIS VERIFIER, twice in succession, both runs LIVE PROOF: PASS on all four truths"
    - "OFFICE-02 attribution prohibition — now enforced by a wired, passing test (apps/web/src/App.test.tsx pins the complete footer sentence); footer additionally observed rendering in a real headless browser"
  gaps_remaining:
    - "Handoff dialogue is generated and stored but never painted — no renderer path draws Character.bubbleText, so the office shows no dialogue at all during a handoff"
    - "Two different agent ids can still render byte-identical characters (12 hue buckets, no name label); observed 7 distinct hues across 10 plausible agent ids"
  regressions: []
gaps:
  - truth: "When one agent hands off work to another, the office shows the first agent walking over, a task icon appearing, and the second agent accepting it and moving to work — using deterministic, template-based dialogue, never LLM-generated at render time"
    status: partial
    reason: "The walk/icon/accept half is genuinely VERIFIED and was OBSERVED live end to end this session (live proof TRUTH 3, twice: 36 handoff-icon pixels appeared during the walk and cleared to 0 on agent.handoff_completed, with no navigation). The dialogue half is not rendered at all. resolveHandoffDialogue() is pure, deterministic and template-only (verified: zero fetch/http/LLM substrings in either handoff file), and handoff-choreography.ts writes its output to Character.bubbleText at :77 and :103 — but a repo-wide grep shows bubbleText is read by NOTHING. renderScene (engine/renderer.ts:117-135) draws the base sprite and the bubble GLYPH only; there is no text draw call anywhere in packages/pixel-office. 05-CONTEXT.md D-04 states the dialogue/text is 'shown during the sequence'; it is computed and discarded. Separately and NOT counted against this truth: no in-repo producer emits a handoff pair (user decision `delete-trigger` at 05-11's checkpoint, recorded in deferred-items.md) — that is an accepted scope boundary, and deleting the fabricated role-change trigger was the correct call under the phase's own Core Value. But see the advisory: ROADMAP Phase 6 is CEO Dashboard & Approval Workflow and neither its goal, its success criteria nor its requirements (CEO-01..05) mention multi-agent orchestration, so the deferral currently has no owning phase."
    artifacts:
      - path: "packages/pixel-office/src/engine/renderer.ts"
        issue: "No text draw pass. drawSpriteData is the only draw primitive; Character.bubbleText is never read."
      - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
        issue: "Lines 77 and 103 write dialogue into a field nothing renders — the HANDOFF-02 template pipeline terminates in dead data."
      - path: "packages/pixel-office/src/handoff/dialogue-templates.ts"
        issue: "No length cap on taskTitle (05-10's backstop truth asked for one). Currently inert because the text is never painted; it becomes live the moment a text pass lands."
    missing:
      - "A text draw pass in renderScene for Character.bubbleText (owner-bound, same ownership discipline resolveBubbleY now enforces for the glyph), or an explicit recorded decision that dialogue stays non-visual this milestone"
      - "A truncation/cap on taskTitle in resolveHandoffDialogue, landed together with the text pass"
      - "A renderer test asserting a character with bubbleText set produces text draw calls inside its own column"
  - truth: "Two different agent ids produce different character pixel data, so two desks are tellable apart (05-10 must_have)"
    status: partial
    reason: "Measured, not inferred. hueForAgentId (index.ts:96-104) hashes into 12 buckets, so collisions begin at the SECOND agent, not the thirteenth. Ran the real upsert path against ten plausible ids: {alpha:330, beta:330, agent-1:120, agent-2:30, claude-1:270, engineer:0, qa:90, worker-a:270, worker-b:0, ceo:60} — 7 distinct hues for 10 agents, and `alpha`/`beta` produce byte-identical sprite data. No name label is drawn (Character.name is set by upsertCharacterFromAgent but never rendered). This is a large improvement on the prior state (every agent identical) but the truth as written is false for ~1 pair in 12, and deferred-items.md's 'Accepted ceilings (05-10)' table states the collision onset incorrectly ('two agents collide on a hue once more than twelve are seated'), which understates it in the audit trail."
    artifacts:
      - path: "packages/pixel-office/src/index.ts"
        issue: "HUE_BUCKETS = 12 with no collision avoidance; the ponytail comment and deferred-items.md both describe collisions as starting past 12 seated agents, which is not how a hash-into-buckets scheme behaves."
      - path: ".planning/phases/05-pixel-office-renderer/deferred-items.md"
        issue: "Accepted-ceiling record misstates when the ceiling is reached."
    missing:
      - "Either an on-canvas name label (05-UI-SPEC.md already reserves the monospace/11px scale) or seat-ordinal-based hue assignment, which collides only past 12 SEATED agents as the record claims"
      - "Correct the deferred-items.md ceiling text to 'collisions are possible from the second agent (hash into 12 buckets)'"
  - truth: "The office seats agents 1:1 with real projection state, with no fabricated or misrepresented desks (05-09 must_have: zero, one, or many characters driven 1:1 by real projection state)"
    status: partial
    reason: "nextSlot (index.ts:107) is monotonic and never reclaimed, while upsertCharacterFromAgent DELETES the character on AgentStatus.OFFLINE (:134). An agent that goes offline and returns is seated at a new desk and its old slot is burned permanently. 05-10's row re-pitch (required to fix CR-02) cut capacity from 162 desks to 54, so the burn budget is now three times smaller. Past slot 54, Math.min(row, DEFAULT_ROWS - 2) (:115) clamps every further agent onto interior row 9 at column 1 + (slot % 18) — two agents are then drawn stacked on the same tile with no indication, which is the office showing one figure where the company has two. A worker that restarts a few dozen times reaches this with only a handful of live agents. index.test.ts's overflow case asserts only that the clamp stays inside the wall border, never that two characters do not share a tile."
    artifacts:
      - path: "packages/pixel-office/src/index.ts"
        issue: "Lines 106-117 and 126-143: monotonic slot allocation plus delete-on-offline; the ponytail comment names the 54-desk ceiling but not the churn path that reaches it with three real agents."
    missing:
      - "Reclaim the slot on despawn (push it to a free list before characters.delete, pop it in nextDeskPosition; _resetForTests must clear the list)"
      - "A test asserting no two characters share (seatCol, seatRow) after N offline/online cycles"
  - truth: "A superseded Claude Code invocation cannot clear the in-flight flag belonging to the invocation that replaced it (05-11's CR-03 fix)"
    status: failed
    reason: "Confirmed by source read at two sites. runQuery's finally block executes `record.inFlight = false` unconditionally (claude-code-runtime.ts:~299), but the flag is a single shared field on the task record while its writer is per-invocation. attemptGracefulStop returns false by TIMING OUT after GRACEFUL_TIMEOUT_MS — it does not wait for the abort to drain — so invocation A's stream can throw after B has already claimed the record, and A's finally then clears B's flag. A third sendMessage/resumeTask then sees inFlight === false, skips the stop branch, and starts a third concurrent query(), orphaning B's controller, watchdog and role-poll interval with no path for pauseTask/cancelTask to reach it. That is verbatim the defect the CR-03 comment at :121-128 says the flag prevents. No test issues a second runQuery against a hanging query, so the suite cannot see it."
    artifacts:
      - path: "packages/claude-adapter/src/claude-code-runtime.ts"
        issue: "Lines ~130-138 and ~290-300: unconditional `record.inFlight = false` in a per-invocation finally over a shared record field."
    missing:
      - "Per-invocation ownership: store an invocation token on the record and guard both the finally write and the watchdog's `record.status = \"blocked\"` write with `if (record.currentRun === invocation)`"
      - "A test that calls runQuery twice against a hanging query and asserts only one query() is ever concurrently live"
deferred: []
advisory:
  - finding: "CR-01 in 05-REVIEW.md (duplicate delivery strands a character at another agent's desk) does not reproduce against the current code. POST /events inserts with onConflictDoNothing on events.id and calls broadcastToBrowsers only in the non-duplicate branch (events.ts:63-86), so each event id broadcasts exactly once; broadcastToBrowsers either queues OR sends per socket, never both. The snapshot/relay overlap therefore causes a re-REDUCE of an event already folded into the snapshot, not a second delivery to the handoff FSM — and company-core's reduce was measured value-idempotent this session for all five relayed types (task.created, task.status_changed, agent.handoff_requested, agent.handoff_completed, gsd.phase_observed). The residual concern is real but latent: handoff-choreography.ts IS non-idempotent (a re-delivered agent.handoff_requested overwrites the record and re-issues the walk), and neither the client nor the flush boundary dedups by event id, so any future path that re-delivers an event turns a latent hazard into the fabricated visual state the Core Value forbids."
    category: architectural
    reason: "Downgraded from the review's critical on deterministic evidence (id-keyed broadcast dedup + measured reducer idempotence). Cheap hardening: queue the event id alongside the payload in browser-connections.ts and drop, at flush, anything the snapshot already contained."
    evidence_status: "reducer idempotence measured this session; duplicate-delivery path falsified by source read of events.ts + browser-connections.ts"
  - finding: "WR-01 in 05-REVIEW.md — ws-browser.ts registers the socket at :36 but attaches close/error handlers at :55-60, after the awaited SELECT. A client that drops during the snapshot window (React StrictMode double-mount does this on every dev page load) fires close with no listener attached, so the entry is never removed from browserSockets and, while still buffering, accumulates a queue that is never flushed or freed."
    category: architectural
    reason: "Confirmed by source read; reproducing the leak needs a gated db.select spy that does not exist. Fix is a three-line move of the handlers above the first await."
    evidence_status: "none provided"
  - finding: "WR-08 in 05-REVIEW.md — ws-client.ts:27-31 hands the snapshot to onSnapshot as a bare `state as ProjectionState` while relayed events are re-validated with CompanyEventSchema. Since 05-09 that snapshot seeds projectionRef and becomes the `prev` of every later reduce; a snapshot missing `agents` throws inside the WebSocket message listener, leaving the office frozen with the socket still open and therefore NO disconnect banner — the exact silent-freeze mode 05-09's own must_haves call out."
    category: architectural
    reason: "Confirmed by source read. Server-produced today, so not currently reachable; a one-line shape guard before onSnapshot closes it."
    evidence_status: "none provided"
  - finding: "The handoff production trigger is deferred to 'Phase 6's multi-agent orchestration' (deferred-items.md), but ROADMAP Phase 6 is 'CEO Dashboard & Approval Workflow' — neither its goal, its four success criteria nor its requirements (CEO-01..CEO-05) mention multi-agent orchestration or a role-to-agent registry. HANDOFF-01's production half therefore currently has no owning phase in the roadmap."
    category: other
    reason: "Not a phase-5 gap (the decision and its consequence were stated and accepted before it was taken). Raised so the deferral is placed into a real phase rather than an implied one."
    evidence_status: "none provided"
  - finding: "T-05-11-WR01 (a worker credential can author events for any agent, company and visibility) remains an accepted threat with an acceptance expiry tied to the first non-INTERNAL consumer. Unchanged by this round."
    category: security
    reason: "Recorded in deferred-items.md with a fix and an expiry; Phase 6/7 own the authorization model."
    evidence_status: "none provided"
unverified_prohibitions:
  - statement: "MUST NOT present provenance-undocumented assets as 'confirmed' licensed in references/ASSET-LICENSES.md"
    requirement_id: OFFICE-02
    verification: test
    disposition: "unverified — flagged. Substantively SATISFIED and materially improved this round: §1 no longer says 'Confirmed CC0' (grep: zero '## 1.*Confirmed' matches), it cites the publisher's own itch.io listing for the pack licence and names the shipped-file identity link as open; §3 now accounts for all 12 bubble/badge assets as repo originals with first-commit evidence. But no wired test enforces the rule, so per the test-tier fail-closed default this is flagged, not green."
  - statement: "MUST NOT rely solely on colour/hue to distinguish blocked/waiting from active — the distinction must remain legible in a grayscale/colourblind-simulated view"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: strongly supported by the asset data — bubbleSprites.test.ts enforces that all 12 glyphs have a pixel pattern no other glyph repeats and that completed's checkmark is not reused for waiting, and blocked/waiting_for_agent/waiting_for_ceo additionally freeze the animation (a motion cue, not a colour cue). unverified-prohibition — human review recommended."
  - statement: "MUST NOT ship a state-signal overlay that is technically data-correct and mechanically confirmed to paint SOME pixels, but is practically illegible at typical stream/viewing scale"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: no longer moot — the prior round's 'it is on the wrong agent' objection is now falsified (live TRUTH 4 plus an independent renderScene run). What remains is genuine legibility: an 11x13 glyph over a 16x32 character on a 320x176 canvas, scaled to a stream layout. Measured 68 blocked-glyph pixels painted. unverified-prohibition — human review recommended."
  - statement: "MUST NOT treat TaskState.title as inherently safe to interpolate into rendered handoff dialogue/bubble text without limit or filtering"
    requirement_id: HANDOFF-02
    verification: null
    disposition: "carried forward as explicitly unresolved, scoped to Phase 7 (SAFE-01/02). Note it is currently inert for a second reason: the dialogue text is never rendered (gap 1). It must be resolved together with, not after, the text draw pass."
  - statement: "MUST NOT credit/attribute an asset pack in-app or in ASSET-LICENSES.md that the shipped renderer does not actually load"
    requirement_id: OFFICE-02
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: RESOLVED in both directions this round — spriteData.ts:22 loads the decoded MetroCity data the footer credits, and §3 now lists the 12 bubble/badge assets that were previously credited nowhere. The open half is identity, not credit: that the fork's char_0.png IS the CC0 pack's art rests on a README credit line. Routed to human verification item 3."
human_verification:
  - test: "Open the office at the scale you will actually stream at (OBS source size, not a 320x176 native canvas) with an agent in `blocked`, `waiting_for_ceo` and `waiting_for_agent`, and glance at it the way a viewer would — one second, no zoom."
    expected: "You can tell at a glance which agent is stuck, and which KIND of stuck, without reading anything."
    why_human: "Legibility at real viewing scale is a judgment call. Mechanically the glyph is proven present (68 px), owner-correct, and distinct-silhouette; none of that settles whether a viewer reads it."
  - test: "Take the same view through a grayscale filter and a deuteranopia/protanopia simulator."
    expected: "Blocked/waiting still read as blocked/waiting from the glyph shape and the frozen animation, with no reliance on hue."
    why_human: "Silhouette distinctness is test-enforced and identity hue is separated from state by construction, but colourblind survivability of the composited frame is a look-at-it check."
  - test: "Open packages/pixel-office/src/sprites/character-metrocity.json's rendered output side by side with the fork's webview-ui/public/assets/characters/char_0.png at pinned commit 3537e140, and with the MetroCity pack art on the publisher's itch.io page."
    expected: "The rendered figure recognisably matches the upstream sprite — confirming ASSET-LICENSES.md §1's open 'link 2' (that the file we ship is that CC0 pack's art), or showing it does not."
    why_human: "Provenance identity cannot be established from inside this repo; it needs the upstream asset source. This is the only thing standing between §1 and a clean confirmed tier."
  - test: "Seat 13+ agents and look for two characters wearing the same colour with no way to tell them apart (see gap 2 — `alpha` and `beta` already collide)."
    expected: "Decide whether colour-only identity with a 1-in-12 collision rate is acceptable for this milestone, or whether name labels are needed now rather than later."
    why_human: "Whether a collision matters depends on how many agents you actually run and whether the stream needs per-agent identification — a product call, not a code call."
---

# Phase 5: Pixel Office Renderer Verification Report

**Phase Goal:** The forked Pixel Agents office renders real company state on screen as a pure consumer of projections — never a fabricated animation.
**Verified:** 2026-09-21T20:50:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure plans 05-09 … 05-12

## The headline: the live proof was run, and it passes

The prior verification's central finding was that criterion 1 was true only after a page reload, and that the artifact named "live end-to-end proof" routed around the path it claimed to prove. Both are now fixed, and — unlike every previous round — **this verifier executed the proof rather than reading it**.

`node scripts/verify-pixel-office-live.mjs`, run twice in succession from a clean container volume, both times:

```
[live-proof] office open: canvas 320x176 (scale 1) — sprite=0
[live-proof] TRUTH 1 PASS — 588 sprite pixels painted from live events on an already-open page
[live-proof] TRUTH 2 PASS — 68 blocked-bubble pixels, no navigation between the event and the scan
[live-proof] TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion
[live-proof] TRUTH 4 PASS — 68 blocked-glyph px at y 58..67, inside live-proof-seat-18's own headroom (56 < y < 72) and in no other agent's
LIVE PROOF: PASS
```

The canvas is empty at `page.goto` (`sprite=0`) and every asserted character is created by an event that arrives over the relay while the page stays open. Real Postgres, real API dev server, real Vite dev server, real worker credential, real `POST /events`, real `/ws/browser`, real headless Chromium, real `getImageData`. Two consecutive runs producing the same verdict also closes the second half of WINDOWS ledger entry #7 ("unrun-verify"), which asked for exactly that. No dev servers leaked (checked: no LISTENING sockets on 3000/5177 afterwards).

That settles criteria 1 and 2 on evidence rather than argument, and settles the rendering half of criterion 3.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Agents visible on one floor, sprites/animations matching real current state (15 AgentStatus values) | ✓ VERIFIED | **Live, observed.** 588 sprite px painted from relayed `task.status_changed` events on an already-open page, single navigation, empty canvas beforehand. The live path IS the fold path: `applyLiveEvent` (agent-event-mapper.ts:34) calls company-core's own `reduce` and diffs by reference, with an anti-drift test pinning `applyLiveEvent`-threaded state equal to `fold()` over the same array. `STATUS_MAP` is exhaustive 15/15 with no fallback branch; OFFLINE despawns. `apps/web` 18 tests, `pixel-office` 63 tests, all green (run this session). |
| 2 | Blocked/waiting agent visually distinguishable at a glance from an active agent | ✓ VERIFIED (mechanically) | **CR-02 is closed, confirmed twice independently.** Live TRUTH 4: the blocked glyph sits at y 58..67, inside its own agent's headroom band (56 < y < 72) and in no other agent's. My own throwaway run against the real `renderScene` with 20 seated agents (rows 3 and 6, same column, only the row-6 agent blocked) measured **zero** glyph pixels inside the row-3 agent's sprite box and the whole glyph strictly above its own. `resolveBubbleY` is owner-bound with a comment explaining exactly why the old canvas clamp was wrong. Frozen animation on blocked/waiting_for_agent/waiting_for_ceo, 12 distinct-silhouette glyphs (test-enforced). ⚠️ "At a glance" at stream scale and under grayscale stays judgment-tier — human items 1 and 2. |
| 3 | Handoff shows walk / task icon / acceptance, with deterministic template dialogue | ✗ PARTIAL | **Walk/icon/accept: VERIFIED live** (TRUTH 3, twice — 36 handoff-icon px appear during the walk, clear to 0 on `agent.handoff_completed`, no navigation), plus cross-package tests that create both participants from live events alone and assert the sender's path terminates on the receiver's seat. **Dialogue: not rendered at all.** `resolveHandoffDialogue` is pure, deterministic, template-only (zero LLM/network substrings — grep-verified), and its output is written to `Character.bubbleText` — which **nothing reads**. `renderScene` has no text draw pass. D-04 says the dialogue is "shown during the sequence"; it is computed and discarded. The absent production trigger is separately accounted for as the recorded `delete-trigger` scope boundary and is NOT counted against this truth. |
| 4 | Pixel Agents attribution and licence notices remain visible and preserved | ✓ VERIFIED | `packages/pixel-office/LICENSE` reproduces MIT verbatim with source URL and pinned SHA `3537e140…`; 8 forked source files carry the 3-line header. The footer was **observed rendering in a real headless browser** this session, text intact and unconditional. `apps/web/src/App.test.tsx` now pins the complete sentence and asserts it is never behind `<details>`/`<dialog>`/`hidden` — the test-tier prohibition that failed closed last round is now genuinely enforced. `references/ASSET-LICENSES.md` is materially more honest: §1 split into pack-licence (cited to the publisher's listing) vs shipped-file identity (named as open), §3 accounts for all 12 bubble assets. |

**Score:** 3/4 truths verified

### Plan-level must_haves that did not hold

These are `must_haves.truths` from 05-09/05-10 that the ROADMAP criteria do not restate. They are gaps 2 and 3 in the frontmatter.

| Plan | Truth | Status | Measured |
|---|---|---|---|
| 05-10 | "Two different agent ids produce different character pixel data" | ✗ PARTIAL | 7 distinct hues across 10 plausible agent ids; `alpha` and `beta` both land on 330° and render byte-identical |
| 05-09 | "zero, one, or many characters driven 1:1 by real projection state" | ✗ PARTIAL | Desk slots are never reclaimed on OFFLINE despawn; past 54 slots characters stack silently on one tile |
| 05-10 (backstop) | "A very long TaskState.title … capped or truncated" | ✗ UNMET | No cap anywhere in `dialogue-templates.ts`; inert only because the text is never painted |
| 05-09 (backstop) | "A WS socket close/error surfaces some user-observable signal" | ✓ VERIFIED | **Directly observed**: started `apps/web` with the API down, opened it in headless Chromium, and read back `role="status"` → *"Disconnected from the office feed — what you see is the last known state, not live."* Zero page errors. |

### Advisory (New Scope / Re-scored)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | 05-REVIEW.md CR-01 (duplicate delivery strands a character) — **does not reproduce** | architectural | Falsified on deterministic evidence: `POST /events` dedups on `events.id` and broadcasts only in the non-duplicate branch, and `broadcastToBrowsers` queues XOR sends. The reducer was additionally measured value-idempotent for all five relayed types. Residual: the FSM is non-idempotent and nothing dedups by id, so the hazard is latent, not live. |
| 2 | 05-REVIEW.md WR-01 — close/error handlers attached after the awaited SELECT; a drop during the snapshot window leaks a registration and an unflushable queue | architectural | Confirmed by source; needs a gated `db.select` spy to reproduce. Three-line fix. |
| 3 | 05-REVIEW.md WR-08 — the snapshot is trusted unvalidated and now seeds every later `reduce`; a malformed one throws inside the message listener and freezes the office with the socket still open, so no disconnect banner | architectural | Confirmed by source; server-produced today. One-line shape guard closes it. |
| 4 | HANDOFF-01's production trigger is deferred to "Phase 6's multi-agent orchestration", but ROADMAP Phase 6 is CEO Dashboard & Approval Workflow and owns no such work | other | Not a phase-5 gap — the decision and its consequence were stated before acceptance. Raised so the deferral gets a real owning phase. |
| 5 | `T-05-11-WR01` — a worker credential can author events for any agent/company/visibility | security | Accepted threat with a stated expiry (first non-INTERNAL consumer). Unchanged this round. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/agent-event-mapper.ts` | Live status→character path | ✓ VERIFIED | Runs company-core's `reduce`; reference-inequality diff is sound (every handler returns a fresh object per touched agent). No second derivation table. |
| `apps/web/src/App.tsx` | Live wiring + footer + disconnect banner | ✓ VERIFIED | Upsert loop above `handleHandoffEvent` (ordering test-pinned); banner and footer both observed in a real browser. |
| `packages/pixel-office/src/engine/renderer.ts` | Owner-bound glyph draw pass | ✓ VERIFIED | `resolveBubbleY` attaches to the owner's sprite box, never the canvas edge. No text pass (see gap 1). |
| `packages/pixel-office/src/index.ts` | Desk layout + per-agent identity | ⚠️ VERIFIED w/ defects | Rows 3/6/9 pitch is arithmetically correct against the engine's own geometry. Slot reclamation missing; 12 hue buckets collide early. |
| `packages/pixel-office/src/status/status-mapping.ts` | Exhaustive 15-value map | ✓ VERIFIED | 15/15, no fallthrough, correct frozen flags, distinct waiting bubbles. |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | Walk/icon/accept FSM | ✓ VERIFIED (live) | Proven end to end on a real canvas; acceptance still gated on a real `agent.handoff_completed`. Non-idempotent under re-delivery (advisory 1). |
| `packages/pixel-office/src/handoff/dialogue-templates.ts` | Deterministic template dialogue | ⚠️ ORPHANED | Pure and correct; output never reaches the screen. |
| `packages/claude-adapter/src/claude-code-runtime.ts` | Role observation separated from agent identity | ⚠️ VERIFIED w/ defect | CR-04 closed — the poll emits `gsd.phase_observed` and no role string touches an agent-id field. `inFlight` stale-write remains (gap 4). |
| `apps/api/src/ws/browser-connections.ts` | Register-then-buffer-then-flush | ✓ VERIFIED | Buffering preserves "first message is always the snapshot". No id dedup (advisory 1). |
| `references/ASSET-LICENSES.md` | Honest D-05 audit | ✓ VERIFIED | Two-link provenance tier, 12 bubble assets accounted, §4 rule applied rather than bypassed. |
| `scripts/verify-pixel-office-live.mjs` | Live end-to-end proof | ✓ VERIFIED (executed) | 0 `page.reload`, 1 `page.goto`; **run twice this session, PASS both times**. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| relayed `task.status_changed` | `upsertCharacterFromAgent` | `applyLiveEvent` → `App.tsx onEvent` | ✓ WIRED | The prior round's break. Now closed and observed live. |
| relayed handoff pair | `handleHandoffEvent` | `App.tsx:75-77`, below the upsert loop | ✓ WIRED | Both participants exist by the time the FSM runs — test-pinned and observed live. |
| `claude-code-runtime` role poll | `gsd.phase_observed` → reducer | `buildEnvelope(... "gsd.phase_observed")` | ✓ WIRED | Role is an observation again, not an identity. |
| `registerBrowserSocket` (buffering) | `flushBrowserSocket` | snapshot send between them | ✓ WIRED | Close/error registration is late (advisory 2). |
| `handoff-choreography` dialogue | rendered pixels | `Character.bubbleText` | ✗ NOT WIRED | **The gap.** Nothing reads `bubbleText`. |
| `App.tsx` footer | `references/ASSET-LICENSES.md` | pinned sentence + `?raw` existence check | ✓ WIRED | Cannot drift silently. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Character sprite pixels | `getCharacterSprites(hueShift)` | Decoded real MetroCity `char_0.png` + per-agent hue | Yes | ✓ FLOWING |
| `Character.state` / `bubbleType` on live event | `applyLiveEvent` → company-core `reduce` | Real relayed events | Yes | ✓ FLOWING (observed) |
| `Character.hueShift` | `hueForAgentId(agentId)` | Real agent id, FNV-1a | Yes, but 12-way | ⚠️ COLLIDING |
| `Character.name` | `upsertCharacterFromAgent`'s 3rd param | Real `AgentState.name` | Set, never drawn | ⚠️ HOLLOW |
| `Character.bubbleText` | `resolveHandoffDialogue` | Real `TaskState.title` | Set, never drawn | ✗ DISCONNECTED |
| Disconnect banner | `disconnected` state | Real socket close/error | Yes | ✓ FLOWING (observed) |
| Footer text | static JSX | Intentionally static | N/A | ✓ (correct as static) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full live end-to-end proof | `node scripts/verify-pixel-office-live.mjs` | `LIVE PROOF: PASS` (4/4 truths) | ✓ PASS |
| Same, run twice in succession (clean-store property) | re-ran immediately | `LIVE PROOF: PASS` again; no leaked listeners on 3000/5177 | ✓ PASS |
| Blocked glyph stays off the agent seated in front | throwaway vitest, real `renderScene`, 20 seated agents, rows 3 & 6 | 0 glyph px inside the row-3 sprite box; glyph strictly above its own | ✓ PASS |
| Two agent ids render different pixels | same run, 10 plausible ids | 7 distinct hues / 10; `alpha` ≡ `beta` | ✗ FAIL |
| Reducer idempotent under a re-delivered event | throwaway vitest, `reduce(reduce(s,e),e)` vs `reduce(s,e)` | Equal by value for all 5 relayed types | ✓ PASS |
| Disconnect banner is user-observable | headless Chromium against `apps/web` with the API down | `role="status"` → "Disconnected from the office feed…" | ✓ PASS |
| Footer renders in a real browser | same run | Complete attribution sentence, 0 page errors | ✓ PASS |
| `apps/web` suite | `npx vitest run --root apps/web` | 3 files, 18 tests passed | ✓ PASS |
| `pixel-office` suite | `npx vitest run --root packages/pixel-office` | 7 files, 63 tests passed | ✓ PASS |
| Any LLM/network surface in handoff files | grep over `handoff/*.ts` | Only comment text | ✓ PASS |
| Role label reaching an agent-id field | grep `record.agentId` / `observed.role` | No assignment; poll emits `gsd.phase_observed` | ✓ PASS |
| Debt markers in phase-touched files | `grep -E "TBD|FIXME|XXX"` over the 23 changed files | None (one base64 lockfile false positive) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-pixel-office-live.mjs` | `node scripts/verify-pixel-office-live.mjs` | exit 0, `LIVE PROOF: PASS`, twice | PASS |

No conventional `scripts/*/tests/probe-*.sh` exist. The live proof is this phase's probe and was executed here rather than read — it is guarded by `assertHarnessOwnedTarget`, which resolves its target from `apps/api/docker-compose.test.yml` (`pixelfirm_test`, port 5434) and refuses to run against anything else, and it resets via `docker compose down -v` rather than destructive SQL.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| OFFICE-01 | 05-01/02/03/05/06/07/08/09/10/11/12 | 15-value status→sprite fidelity on one floor | ✓ SATISFIED | Truth 1 — live path observed, exhaustive mapping, real sprite data. Recommend flipping REQUIREMENTS.md line 134 from Gaps Found to Complete. |
| OFFICE-02 | 05-02/05/06/09/12 | Attribution/licence preserved | ✓ SATISFIED | Truth 4 — LICENSE + headers + browser-observed footer + wired pinning test + honest audit. One judgment-tier provenance link open (human item 3). |
| OFFICE-03 | 05-02/07/08/10/12 | Blocked/waiting glanceable signal | ✓ SATISFIED (pending human look) | Truth 2 — glyph proven owner-correct on a real canvas, twice, independently. Legibility/grayscale are judgment-tier and routed to human. Recommend Complete only after human items 1-2. |
| HANDOFF-01 | 05-03/04/05/07/08/09/10/11/12 | Physical walk/icon/accept handoff | ⚠️ PARTIAL | Rendering half proven live (TRUTH 3). Dialogue not rendered (gap 1). Production trigger is a recorded, accepted scope boundary with no owning phase (advisory 4). Keep as Gaps Found. |
| HANDOFF-02 | 05-04/05/10/11/12 | Deterministic/template dialogue, never LLM | ⚠️ PARTIAL | The generator is pure, deterministic and grep-proven LLM-free; the prohibition holds. But the dialogue never reaches the screen, so "handoff dialogue" as a user-visible thing does not exist yet. |

All five Phase 5 requirement IDs are claimed by at least one plan's `requirements` frontmatter and REQUIREMENTS.md maps no additional IDs to Phase 5. **No orphaned requirements.** Every executor correctly left `requirements-completed` empty for the shared IDs and deferred the call to this verification.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 77, 103 | Computed value written to a field nothing reads | 🛑 Blocker | The HANDOFF-02 dialogue pipeline terminates in dead data (gap 1) |
| `packages/claude-adapter/src/claude-code-runtime.ts` | ~299 | Per-invocation `finally` writing a shared record field | 🛑 Blocker | A superseded run clears its successor's in-flight flag (gap 4) |
| `packages/pixel-office/src/index.ts` | 107, 134 | Monotonic allocation with deletion but no reclamation | ⚠️ Warning | Desks burn on churn; past 54 slots characters stack silently (gap 3) |
| `packages/pixel-office/src/index.ts` | 96-104 | Hash into 12 buckets described as colliding "past twelve seated" | ⚠️ Warning | Collisions begin at the second agent (gap 2) |
| `apps/api/src/routes/ws-browser.ts` | 36 vs 55-60 | Registration before the first `await`, lifecycle handlers after | ⚠️ Warning | Registration leak on a drop during the snapshot (advisory 2) |
| `apps/web/src/ws-client.ts` | 28-29 | `state as ProjectionState` — validation asymmetry with the event path | ⚠️ Warning | A malformed snapshot freezes the office with no banner (advisory 3) |
| `apps/api/src/ws/browser-connections.ts` | 44-53 | Broadcast carries no event id, so neither boundary can dedup | ⚠️ Warning | Latent; the FSM is non-idempotent (advisory 1) |

No `TBD` / `FIXME` / `XXX` debt markers in any of the 23 files this phase changed.

**Re-verification evidence gate:** both 🛑 blockers sit in files git-modified since the prior verification's `2026-09-21T16:55` timestamp and both carry deterministic evidence — gap 1 a repo-wide grep showing `bubbleText` has no reader plus a source read of every draw call in `renderScene`, gap 4 a two-site source read of the shared-field/per-invocation-writer mismatch. Both block. 05-REVIEW.md's CR-01 was re-scored to Advisory because the evidence *falsifies* the stated mechanism rather than merely failing to confirm it.

### Human Verification Required

1. **Glyph legibility at real stream scale** — glance test at OBS source size across blocked / waiting_for_ceo / waiting_for_agent.
2. **Grayscale + colourblind survivability** — same view through a grayscale filter and a deuteranopia simulator.
3. **MetroCity provenance, link 2** — compare a rendered character against the fork's `char_0.png` at the pinned commit and the publisher's itch.io art. This is the only thing between `ASSET-LICENSES.md` §1 and a clean confirmed tier.
4. **Colour-collision tolerance** — decide whether 12 hue buckets with no name labels is acceptable for this milestone (`alpha` and `beta` already collide).

**Closed by evidence this round, no longer human items:** "does a live status change render without a reload" (live TRUTH 1/2, observed), "which agent does a viewer think is blocked" (live TRUTH 4 plus an independent `renderScene` run), and "does a socket close surface a signal" (banner observed in a real browser).

### Gaps Summary

This round did the real work the last one asked for, and it shows. The unifying defect the prior verification named — *`apps/web` has no live path that creates or updates a Character* — is genuinely gone, fixed at the root rather than at the symptom: `applyLiveEvent` runs company-core's own `reduce`, so the live view and a replay of the same log cannot disagree by construction. CR-02's glyph-on-the-wrong-agent is fixed by binding the overlay to its owner instead of the canvas, and re-pitching the desk rows so the geometry actually has room — I reproduced that clean independently, not just via the repo's own test. CR-04 is fixed by deleting a fabrication rather than by patching it, which is the right call under this phase's Core Value even though it costs the production handoff trigger. And the proof artifact has, for the first time in this phase, been *run* — twice, from a clean store, passing all four truths on a real canvas in a real browser.

Three of four ROADMAP criteria are met. What remains:

**Gap 1 — the handoff dialogue is never rendered.** `resolveHandoffDialogue` is exemplary: pure, deterministic, template-only, grep-proven free of any LLM or network surface, with tone rules enforced by tests. Its output goes into `Character.bubbleText`, and `bubbleText` has no reader anywhere in the repo. `renderScene` draws a sprite and a glyph; there is no text pass. Criterion 3 and D-04 both describe dialogue *shown during the sequence*. Nine plans touched this pipeline and none noticed the last hop was missing, because every test asserts the string's content rather than its arrival on screen — the same seam-blindness the prior verification flagged, in a new place. The `TaskState.title` truncation backstop must land with the text pass, not after it.

**Gap 2 — identity colour collides much earlier than the record admits.** Hashing into 12 buckets collides at the second agent, not the thirteenth; measured 7 distinct hues across 10 plausible ids, with `alpha` and `beta` byte-identical. This is a genuine improvement over "every agent identical", and the ceiling itself may be an acceptable product call — but the deferred-items record states it wrongly, which is the part that matters for the audit trail.

**Gap 3 — desks burn on churn.** Slots are allocated monotonically and the character is deleted on OFFLINE, so an agent cycling offline/online is re-seated and its desk is lost forever. CR-02's required row pitch cut capacity from 162 to 54, tripling the rate at which that budget runs out; past it, characters are drawn stacked on one tile with no indication. An office showing one figure where the company has two is the goal's own failure mode, reached by a mundane worker restart loop.

**Gap 4 — `inFlight` can be cleared by the invocation it replaced.** Shared record field, per-invocation writer, and a graceful-stop that returns on a timeout rather than on a drain. A third concurrent `query()` becomes reachable in exactly the scenario the flag exists to prevent, with no way for `pauseTask`/`cancelTask` to reach the orphan.

**On 05-REVIEW.md's two criticals, one is downgraded on evidence.** CR-01's stranding mechanism does not reproduce: `POST /events` inserts with `onConflictDoNothing` on the event id and broadcasts only in the non-duplicate branch, and `broadcastToBrowsers` queues *or* sends per socket, never both — so no socket can receive the same event twice, and the choreography FSM cannot be driven twice by one handoff. The snapshot/relay overlap the reviewer correctly identified causes a *re-reduce* of an already-folded event, and I measured company-core's `reduce` value-idempotent for all five relayed types. The hazard is real but latent, and worth the cheap id-dedup at the flush boundary because the FSM genuinely is not idempotent. CR-02 (the `inFlight` race) stands and is gap 4.

**One process note for whoever plans the closure round.** Every gap here is again a seam: a value with no reader, an allocator with no deallocator, a flag with two writers. The previous round's advice — each gap-closure plan carries at least one test spanning two components — held up well where it was followed (the cross-package live-handoff tests in `agent-event-mapper.test.ts` are the strongest tests in this phase). Gap 1 is what happens when it is not: the seam between a package that produces a string and a package that paints pixels.

---

*Verified: 2026-09-21T20:50:00Z*
*Verifier: Claude (gsd-verifier)*
