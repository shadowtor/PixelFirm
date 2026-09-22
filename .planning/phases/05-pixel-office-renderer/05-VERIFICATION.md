---
phase: 05-pixel-office-renderer
verified: 2026-09-22T17:20:00Z
status: human_needed
score: 16/16 must-haves verified
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
  - ".planning/phases/05-pixel-office-renderer/05-13-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-13-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-14-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-14-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-15-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-15-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-16-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-16-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-17-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-17-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-18-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-18-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-19-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-19-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-20-PLAN.md"
  - ".planning/phases/05-pixel-office-renderer/05-20-SUMMARY.md"
  - ".planning/phases/05-pixel-office-renderer/05-REVIEW.md"
  - ".planning/phases/05-pixel-office-renderer/05-UI-SPEC.md"
  - ".planning/phases/05-pixel-office-renderer/deferred-items.md"
  - "apps/web/src/App.tsx"
  - "packages/company-core/src/reducer.ts"
  - "packages/pixel-office/src/engine/characters.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.test.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.ts"
  - "packages/pixel-office/src/index.ts"
  - "packages/pixel-office/src/status/status-mapping.ts"
  - "packages/pixel-office/src/types.ts"
  - "scripts/verify-pixel-office-live.mjs"
covered_digest: "v1:sha256:c9f99bc26051221841a6c400f3ea0aed377a3b1b0d3c8631a027ad7ff778be8f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/11
  gaps_closed:
    - "Truth 11 (review CR-01, sender status glyph lost after a handoff): closed. Character.statusBubble (types.ts:134) is written only by upsertCharacterFromAgent (index.ts:178). applyBubble (handoff-choreography.ts:240-242) is the only production writer of bubbleType (grep across packages/pixel-office/src and apps/web/src). It is called at upsert (index.ts:180), arrival (:205), completion (:157) and retire (:86). Named real-loop tests pass: it.each TESTING/BLOCKED/WAITING_FOR_CEO, 'CR-01 retire', 'CR-01 order'. My own probe of the reducer-shaped path (receiver WAITING_FOR_AGENT on request, CODING after completion, TESTING sender) ends with the sender home in TYPE with bubble 'testing', no lines, no live record."
    - "Prior advisory WR-01 (sender identity missing in ICON_VISIBLE and completion): closed. senderIsCurrent (:58-60) is checked at the loop top for every phase (:190), in the completion handler before any receiver write (:147-150) and in retireHandoff (:83). getCharacter(record.fromAgentId) appears only inside senderIsCurrent. Tests 'WR-01 tick' and 'WR-01 same frame' pass."
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory:
  - finding: "05-REVIEW.md WR-01 (new): the identity rule does not cover the receiver. REPRODUCED this session with a throwaway stepOffice probe (deleted; git status clean for packages/, apps/, scripts/): TESTING sender a hands off to b; after 0.2 s b goes OFFLINE and agent-z is seated; after 30 s a is at (5,3) (its seat is (1,3)), z's seat is (5,3), a.bubbleType is 'handoff-task' (not 'testing'), the requested line is still painted, isWaitingHandoffSender(a) is true."
    category: other
    reason: "Not reachable on any path the product has today. The only way a character leaves or is replaced on the floor is upsertCharacterFromAgent(..., OFFLINE) (index.ts:161). No producer yields OFFLINE: deriveAgentStatus never returns it (agent-status-derivation.ts:11-14), the reducer writes only IDLE / CODING / WAITING_FOR_AGENT / derived statuses, and no event carries a raw AgentStatus payload. This is the same classification the previous round gave the sender-side WR-01, and unlike the prior CR-01 (which fired on every handoff) it cannot be triggered by today's event stream. It must be fixed before anything emits OFFLINE (worker liveness, agent removal). Fix per review: store toChar in the record and retire (sending the sender home) when the receiver is not current during WALKING_TO_RECEIVER / ICON_VISIBLE; add the receiver-OFFLINE real-loop test."
    evidence_status: "reproduced this session (throwaway stepOffice probe); unreachability established by source read"
  - finding: "05-REVIEW.md IN-01..IN-04: stale comments (isWaitingHandoffSender doc, stepOffice 'WALK->IDLE', walkCharacterTo no-op), same-sender supersede clears the prior receiver's accepted line, mid-step re-route snaps back a tile, identityHueFor documented as 'Pure'."
    category: other
    reason: "Comments or cosmetic; none makes the office show a wrong status on today's paths."
    evidence_status: "source read"
  - finding: "Carried: harness warnings WR-02..WR-05 in scripts/verify-pixel-office-live.mjs; claude-adapter WR-05/IN-01, env strip WR-07, /ws/browser WR-03/04, snapshot validation WR-09, T-05-11-WR01."
    category: architectural
    reason: "Not touched by 05-20. Adapter items have no production caller yet and must land before Phase 6 wires one."
    evidence_status: "source read (prior rounds)"
unverified_prohibitions:
  - statement: "MUST NOT rely solely on colour/hue to distinguish blocked/waiting from active — the distinction must remain legible in a grayscale/colourblind-simulated view"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: supported (distinct glyph silhouettes, frozen animation). unverified-prohibition — human review recommended (item 2)."
  - statement: "MUST NOT treat mechanically painted dialogue pixels as proof the line is legible at stream scale"
    requirement_id: HANDOFF-02
    verification: judgment
    disposition: "Honoured: pixel counts are not treated as legibility. Human items 1 and 4."
  - statement: "MUST NOT ship a state-signal overlay that is technically data-correct and mechanically confirmed to paint SOME pixels, but is practically illegible at typical stream/viewing scale"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "68 owner-bound blocked-glyph px observed live again this session. unverified-prohibition — human review recommended (item 1)."
  - statement: "MUST NOT treat TaskState.title as inherently safe to interpolate into rendered handoff dialogue/bubble text without limit or filtering"
    requirement_id: HANDOFF-02
    verification: null
    disposition: "Length capped (observed live). Content filtering scoped to Phase 7; must land before the first public stream."
human_verification:
  - test: "Open the office at the scale you will stream at (OBS source size) with agents in blocked, waiting_for_ceo and waiting_for_agent, plus a handoff in progress; glance for one second without zooming."
    expected: "You can tell which agent is stuck and which kind of stuck, and read the handoff line."
    why_human: "Legibility at viewing scale is a judgment call."
  - test: "View the same through a grayscale filter and a deuteranopia/protanopia simulator."
    expected: "Blocked/waiting still reads from glyph shape and frozen animation."
    why_human: "Colourblind survivability of the composited frame has to be looked at."
  - test: "Compare a rendered character with the fork's webview-ui/public/assets/characters/char_0.png at commit 3537e140 and the MetroCity art on itch.io."
    expected: "The figure matches (ASSET-LICENSES.md section 1, link 2)."
    why_human: "Provenance identity cannot be established from inside this repo."
  - test: "Watch a handoff whose receiver sits on desk row 3 (desks 0-17)."
    expected: "Decide whether a top-wall line clamped to x = 0 with glyphs over its bottom rows is acceptable, or move desks to row 4 (36 desks)."
    why_human: "Attribution of the line to its speaker is a UX call."
---

# Phase 5: Pixel Office Renderer Verification Report

**Phase Goal:** The forked Pixel Agents office renders real company state on screen as a pure consumer of projections — never a fabricated animation.
**Verified:** 2026-09-22T17:20:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure round 6 (plan 05-20).

## Headline

05-20 closes the one open gap. The code matches the summary. The sender's status glyph is now stored (`statusBubble`), the displayed bubble has one writer (`applyBubble`), and all four transition sites go through it. Every automated truth holds, including on a reducer-shaped handoff I drove myself.

The review's new WR-01 (receiver goes OFFLINE mid-walk) is real; I reproduced it. It is **advisory, not a blocker**. The only way a character leaves the floor is an OFFLINE status, and nothing in the repo produces one today. The prior CR-01 fired on every handoff; this one cannot be triggered by today's event stream. It must be fixed before anything emits OFFLINE.

Status is `human_needed` only because the four carried human items (legibility, colourblind view, provenance, row-3 attribution) are still open.

## Independent checks this session

| Check | Result |
|-------|--------|
| `npx vitest run --root packages/pixel-office` | 110/110 pass (7 files) |
| `pnpm --filter web test` / `typecheck` | 18/18 pass / exit 0 |
| `node scripts/verify-pixel-office-live.mjs` | exit 0, TRUTH 1-5 PASS, `LIVE PROOF: PASS` |
| `git diff ba5d203 -- handoff-choreography.test.ts` | Only additions, plus the line-8 import extension; no existing test edited |
| Grep: `bubbleType =` writers outside tests | One: `handoff-choreography.ts:241` (`applyBubble`) |
| Grep: `statusBubble =` writers | One: `index.ts:178` |
| Probe A (throwaway, deleted): reducer-shaped path, TESTING sender, receiver WAITING_FOR_AGENT then CODING | At receiver: a `handoff-task` + "Handing off" line, b `waiting` frozen. Home after 5 s: a TYPE, bubble `testing`, no line, no live record; b TYPE, bubble null, no line |
| Probe B (throwaway, deleted): review WR-01, receiver OFFLINE at 0.2 s, agent-z seated | After 30 s: a at (5,3) = z's seat, bubble `handoff-task`, requested line painted, `isWaitingHandoffSender(a)` true. Confirmed, unreachable today |
| `git status --short packages apps scripts` after probes | clean |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1: sprites and animations match real current state | ✓ VERIFIED | Live TRUTH 1 PASS (588 px); `STATUS_MAP` exhaustive; post-handoff state now correct (truth 11). |
| 2 | ROADMAP SC2: blocked or waiting is distinguishable at a glance | ✓ VERIFIED (mechanically) | Live TRUTH 2/4 PASS (68 owner-bound px). Frozen glyph survives every handoff phase (truth 13). Human items 1-2. |
| 3 | ROADMAP SC3: handoff shows walk, icon, accept, template dialogue | ✓ VERIFIED | Live TRUTH 3 and 5 PASS (2647 box px + 971 text px). |
| 4 | ROADMAP SC4: attribution and licence preserved and visible | ✓ VERIFIED | Unchanged since prior round; apps/web 18/18. Provenance is human item 3. |
| 5 | Identity hue, 1:1 seats, desk reclaim | ✓ VERIFIED | Regression suite 110/110. |
| 6 | Superseded adapter invocation never writes shared state; no overlapping `query()` (05-18) | ✓ VERIFIED | 05-20 touched no claude-adapter file. |
| 7 | 05-19: arrival is `hasArrived` at both checks | ✓ VERIFIED | `handoff-choreography.ts:49-51, 197, 210`. |
| 8 | 05-19: one pose writer; every walk ends in `restPose` | ✓ VERIFIED | `setRestPose` at `index.ts:177` and `:165`; tests pass. |
| 9 | 05-19 paths (a), (b), (b2), (c): no stranding, no dropped completion | ✓ VERIFIED | Named real-loop tests pass. |
| 10 | 05-19 WR-01/02/03: one record per sender, identity, icon across status updates | ✓ VERIFIED | `:117-123`, `:190`; tests pass. |
| 11 | Phase goal + OFFICE-01/03: a handoff never leaves the sender showing a status it is not in or without its blocked/waiting signal (prior gap) | ✓ VERIFIED | it.each TESTING/BLOCKED/WAITING_FOR_CEO pass; Probe A. |
| 12 | 05-20: `statusBubble` holds the latest status glyph; only the upsert writes it | ✓ VERIFIED | `types.ts:134`, `characters.ts:72`, `index.ts:178` (sole writer). |
| 13 | 05-20: `applyBubble` is the sole `bubbleType` writer; frozen glyph > task icon while ICON_VISIBLE > status glyph; order-independent | ✓ VERIFIED | `:240-242`; called at `index.ts:180`, `:86`, `:157`, `:205`. Upsert writes `statusBubble` and `frozen` before calling it. Test "CR-01 order" passes. |
| 14 | 05-20: a sender retired by another sender's request gets its glyph back at once and walks home with it | ✓ VERIFIED | `retireHandoff` deletes first (`:78`), then `applyBubble` (`:86`). Test "CR-01 retire" passes. |
| 15 | 05-20 WR-01: every phase retires a record whose sender is not current; completion for such a record sets no TYPE and paints no line | ✓ VERIFIED | `:147-150`, `:190-193`, `:83`. Tests "WR-01 tick", "WR-01 same frame" pass. |
| 16 | 05-20: new tests drive `stepOffice` through the public surface only; no existing test edited (103 → 110) | ✓ VERIFIED | Diff read; no `finishWalk` in the new blocks; 110/110. |

**Score:** 16/16 truths verified. No truths are present but behaviour-unverified: every behaviour-dependent truth (11, 13, 14, 15) has a named real-loop test that passed in my run.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/pixel-office/src/types.ts` | ✓ VERIFIED | `statusBubble: BubbleType \| null` with doc. |
| `packages/pixel-office/src/engine/characters.ts` | ✓ VERIFIED | `createCharacter` initialises `statusBubble: null`. |
| `packages/pixel-office/src/index.ts` | ✓ VERIFIED | Upsert: `setRestPose`, `statusBubble`, `frozen`, then `applyBubble(ch)`. |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | ✓ VERIFIED | `applyBubble`, `senderIsCurrent`, delete-first `retireHandoff`. Receiver identity not covered (advisory). |
| `packages/pixel-office/src/handoff/handoff-choreography.test.ts` | ✓ VERIFIED | 7 new real-loop tests; additive only. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| apps/web `onEvent` | `upsertCharacterFromAgent` → `statusBubble`/`frozen` → `applyBubble` | `App.tsx:42,59`; `index.ts:177-180` | ✓ WIRED |
| `stepOffice` arrival | ICON_VISIBLE → `applyBubble(fromChar)` | `index.ts` `stepOffice` → `:204-205` | ✓ WIRED |
| completion | `senderIsCurrent` guard → RETURNING → `applyBubble(record.fromChar)` | `:147-157` | ✓ WIRED |
| `retireHandoff` | delete → `senderIsCurrent` → `applyBubble(record.fromChar)` | `:78-86` | ✓ WIRED |
| loop top | `senderIsCurrent` false → retire, all phases | `:190-193` | ✓ WIRED |
| loop top | receiver identity | — | Not present (advisory WR-01; unreachable today) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| pixel-office suite incl. 7 new tests | `npx vitest run --root packages/pixel-office` | 110 passed | ✓ PASS |
| Reducer-shaped handoff, TESTING sender | throwaway probe A | home, TYPE, `testing`, no lines | ✓ PASS |
| Receiver OFFLINE mid-walk | throwaway probe B | sender stuck with task icon | ✗ FAIL (advisory, unreachable today) |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-pixel-office-live.mjs` | `node scripts/verify-pixel-office-live.mjs` | exit 0; TRUTH 1-5 PASS; `LIVE PROOF: PASS` | PASS |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| OFFICE-01 | 05-01..20 | ✓ SATISFIED | Truths 1, 11. |
| OFFICE-02 | 05-02/05/06/09/12 | ✓ SATISFIED (provenance pending human item 3) | Truth 4. |
| OFFICE-03 | 05-02/07/08/10/12/13/16/17/20 | ✓ SATISFIED (mechanically; human items 1-2) | Truths 2, 11, 13. |
| HANDOFF-01 | 05-03..20 | ✓ SATISFIED | Truths 3, 7-11, 13-15. |
| HANDOFF-02 | 05-04/05/10/11/12/13/16 | ✓ SATISFIED (legibility pending human items 1, 4) | Template-only, capped, painted live. |

Every phase ID appears in at least one plan's `requirements`. REQUIREMENTS.md maps no other IDs to Phase 5, so nothing is orphaned.

Note for the orchestrator: REQUIREMENTS.md currently shows OFFICE-01, OFFICE-03 and HANDOFF-01 as `[x]`/Complete (set by the 05-20 executor) but OFFICE-02 and HANDOFF-02 as `[ ]`/Gaps Found. I found no failing evidence for either of the last two. They hinge only on human items 1, 3 and 4, so leave them pending or mark them Complete once the human checks are done. I did not edit REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 124, 184-216 | No receiver identity check | ⚠️ Warning | Advisory WR-01 (unreachable today) |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 219-223 | `isWaitingHandoffSender` doc is stale | ℹ️ Info | IN-01 |
| `packages/pixel-office/src/index.ts` | `stepOffice` comment | Still says "WALK->IDLE signal" | ℹ️ Info | IN-01 |

There are no `TBD`/`FIXME`/`XXX` markers in the five files 05-20 modified.

**Re-verification evidence gate:** the receiver-identity finding is in a file modified this round and has a deterministic reproduction. It is not a blocker because it contradicts no phase truth on any path the product can reach today. A character can leave the floor only through an OFFLINE status, and nothing produces one. It is recorded as advisory, which matches how the previous round treated the same class of defect on the sender side.

### Human Verification Required

1. **Legibility at stream scale.** Do the one-second glance test at OBS size.
2. **Grayscale and colourblind view.** Check the same frame through the filters.
3. **MetroCity provenance, link 2.** Compare a rendered figure against the source art.
4. **Row-3 dialogue attribution.** Decide whether the current layout reads as the right speaker, or move desks to row 4.

These are carried over unchanged from earlier rounds. They are the only reason the status is not `passed`.

### Gaps Summary

There are no gaps. The prior gap is closed and the prior advisory WR-01 (sender side) is closed, both with passing real-loop tests and an independent probe. The new receiver-side WR-01 is recorded as advisory. It becomes a blocker the moment any producer emits OFFLINE, so fix it before worker liveness or agent removal lands.

---

_Verified: 2026-09-22T17:20:00Z_
_Verifier: Claude (gsd-verifier)_
