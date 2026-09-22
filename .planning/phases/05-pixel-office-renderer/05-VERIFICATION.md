---
phase: 05-pixel-office-renderer
verified: 2026-09-22T02:45:00Z
status: gaps_found
score: 8/10 must-haves verified
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
  - ".planning/phases/05-pixel-office-renderer/05-UI-SPEC.md"
  - ".planning/phases/05-pixel-office-renderer/deferred-items.md"
  - "apps/api/src/routes/events.ts"
  - "apps/api/src/routes/ws-browser.ts"
  - "apps/api/src/ws/browser-connections.ts"
  - "apps/web/src/App.test.tsx"
  - "apps/web/src/App.tsx"
  - "apps/web/src/agent-event-mapper.test.ts"
  - "apps/web/src/agent-event-mapper.ts"
  - "apps/web/src/ws-client.ts"
  - "packages/claude-adapter/src/claude-code-runtime.test.ts"
  - "packages/claude-adapter/src/claude-code-runtime.ts"
  - "packages/company-core/src/reducer.ts"
  - "packages/pixel-office/LICENSE"
  - "packages/pixel-office/src/constants.ts"
  - "packages/pixel-office/src/engine/characters.ts"
  - "packages/pixel-office/src/engine/renderer.test.ts"
  - "packages/pixel-office/src/engine/renderer.ts"
  - "packages/pixel-office/src/handoff/dialogue-templates.test.ts"
  - "packages/pixel-office/src/handoff/dialogue-templates.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.test.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.ts"
  - "packages/pixel-office/src/index.test.ts"
  - "packages/pixel-office/src/index.ts"
  - "packages/pixel-office/src/sprites/bubbleSprites.ts"
  - "packages/pixel-office/src/sprites/spriteData.ts"
  - "packages/pixel-office/src/status/status-mapping.ts"
  - "packages/pixel-office/src/types.ts"
  - "references/ASSET-LICENSES.md"
  - "scripts/verify-pixel-office-live.mjs"
covered_digest: "v1:sha256:1da36f6cc93feb6c865b113b2efabd1fba6379d1d806cba1096fb2598b433ef5"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Gap 1 (handoff dialogue never painted): renderScene now has an owner-bound dialogue pass (renderer.ts:156-172, pass 2 of 3). OBSERVED LIVE by this verifier on a real canvas: requested line 2639 box px + 971 text px at x 0..282, y 0..12, box contains speaker centre x 56 and ends above its sprite top (24); accepted line 2267 box px 50 ms after agent.handoff_completed; zero dialogue px once the sender is home. Title/name caps (16/12 code points, U+2026) are in dialogue-templates.ts and the live line shows them applied."
    - "Gap 2 (hue collisions from the second agent): identityHueFor probes forward past hues already held by seated characters (index.ts:100-115); index.test.ts pins ten distinct hues and pairwise-different pixels for the ten measured ids; deferred-items.md ceiling text corrected and the correction dated."
    - "Gap 3 (desks burned on churn): nextDeskPosition derives the lowest free desk from seated state (index.ts:137-144); churn, no-shared-tile and lowest-free tests pass."
    - "Gap 4 (superseded invocation clears successor's inFlight), as stated: every per-invocation writer in runQuery is now guarded by isCurrent() — finally, watchdog, message loop, role poll, canUseTool, Notification hook. Tests A-E pass. A different, earlier race remains (new gap 2 below)."
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "MUST NOT leave a handoff dialogue line painted after its handoff sequence has ended (05-13 prohibition), and the office never shows an agent somewhere it is not (phase goal: never a fabricated animation)"
    status: failed
    reason: "Reproduced deterministically this session with a throwaway vitest that drives the real updateCharacter + checkHandoffArrivals loop (not the repo's finishWalk shortcut). S1: an AgentStatus update for the sender during its return walk (upsertCharacterFromAgent sets ch.state = visual.pose and leaves ch.path alone, index.ts:171) left the sender with state 'type', 4 path tiles left, not at its desk, after 100 simulated seconds. The receiver's 'x17 accepts \"t\"' line never cleared. The same freeze during WALKING_TO_RECEIVER leaves the record stuck before ICON_VISIBLE, so the real completion event is then ignored (handoff-choreography.ts:75). S2: the sender going OFFLINE during RETURNING_TO_DESK makes checkHandoffArrivals `continue` forever (:125), and the receiver's 'b accepts \"t\"' line survived later status updates. In both cases the office keeps painting a figure typing in the middle of the floor, or a line from a finished handoff. Neither needs anything but real events through the real API: a handoff pair plus one status event for the sender inside a walk of about 1-3 seconds. The in-code ponytail note at index.ts:172-175 names flicker as the risk; the real risk is a permanent stale state. New in this round's scope: handoff-choreography.ts and index.ts changed after the prior verification, and until 05-13 bubbleText was never drawn, so the stale-line half could not be seen before."
    artifacts:
      - path: "packages/pixel-office/src/index.ts"
        issue: "Line 171 overwrites ch.state even while a walk path is pending, so the character stops moving between tiles for good (updateCharacter only moves characters in WALK)."
      - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
        issue: "Lines 123-125: a missing sender means `continue` forever, so the record is never retired and acceptedText is never cleared. Line 65: a new request for the same taskId overwrites a record still in RETURNING_TO_DESK, which orphans its acceptedText."
    missing:
      - "In upsertCharacterFromAgent, keep an in-progress walk going: set the pose only when ch.path.length === 0, or re-apply the pose on arrival."
      - "In checkHandoffArrivals RETURNING_TO_DESK, treat a vanished sender as the end of the sequence: clear the receiver's acceptedText and delete the record."
      - "In handleHandoffEvent requested, retire a record that is being replaced (clear its acceptedText from the receiver if it is still showing)."
      - "One test that drives the real updateCharacter loop (not finishWalk) with a sender status update mid-walk, and one with sender OFFLINE mid-return. Both must end with bubbleText null and the sender IDLE at its own seat."
  - truth: "MUST NOT start a query() for a task while another un-aborted, unfinished query() for the same task is live (05-15 prohibition)"
    status: failed
    reason: "Reproduced deterministically this session (05-REVIEW.md CR-01). A throwaway vitest used a first stream that exits on interrupt (pausableQuery) and fired two sendMessage calls in the same tick. query() was called 3 times and all three controllers came back un-aborted, [false, false, false]. Stream 2 stayed live and un-aborted, and stream 3 started anyway. The token is taken after the await (claude-code-runtime.ts:144-151), so both waiters take over the record one after the other. When the first stream times out instead of draining, the second waiter's abort happens to hit the first waiter's controller, which hides the race. That is why sequential Test A cannot see it. Impact on the office is contained: the orphaned stream is muzzled by isCurrent(), so it cannot write status, session or events, and no fabricated state reaches the projection. What is left is an unkillable subprocess running turns against the same resumed session. There is NO in-repo production caller of sendMessage/resumeTask/pauseTask/cancelTask today (grep over apps/ and packages/, tests excluded), so the race is latent. It becomes reachable as soon as Phase 6 wires a caller."
    artifacts:
      - path: "packages/claude-adapter/src/claude-code-runtime.ts"
        issue: "Lines 144-151: currentRun is assigned only after `await attemptGracefulStop(record)`, and nothing re-checks ownership after the await."
    missing:
      - "Claim the invocation token before the await and return early if it is no longer current afterwards. pauseTask/cancelTask should also claim a fresh token, so a runQuery still waiting gives up. The review's suggested patch is about six lines."
      - "A test that fires two sendMessage calls together against a first stream that drains cleanly, asserting at most one un-aborted, unfinished stream at each query() creation."
deferred: []
advisory:
  - finding: "05-REVIEW.md WR-01: at row 3 (desks 0-17) the owner's own glyph slot (y 9..21) overlaps the bottom rows (y 9..12) of its dialogue box (y 0..12), and ANY row-3 neighbour's glyph also overlaps any row-3 dialogue line. Seen in this verifier's live screenshot: the neighbour's red blocked glyph sits under the 'g' of 'Handing' and the sender's handoff icon under 'off'. The text is still readable at 4x. A row-3 box also clamps to x = 0 and spans about 280 px across the top wall strip, so it reads as a banner rather than something attached to a speaker."
    category: other
    reason: "This is a legibility and attribution judgment, not a correctness failure. 05-13's truths (box contains the speaker's centre x, entirely above its sprite, glyphs on top) all hold. Routed to human item 4. If the answer is 'not good enough', the review's DESK_ROW_START = 4 is the geometric fix (36 desks)."
    evidence_status: "live screenshot captured this session"
  - finding: "05-REVIEW.md WR-10: the committed harness never positively asserts the 'accepts' line paints. FALSIFIED as a behaviour defect: this verifier's instrumented run observed 2267 dialogue-box px 50 ms after agent.handoff_completed. It remains true that the committed proof would not catch a regression here."
    category: other
    reason: "Test-strength gap only. Add the poll-until-present assertion before the cleared check, with a deadline derived from WALK_SPEED_PX_PER_SEC."
    evidence_status: "live observation this session"
  - finding: "Carried from prior advisories and review, not changed this round: WR-03 (/ws/browser re-delivers events already folded into the snapshot; the FSM now dedups by id, the reducer is idempotent), WR-04 (close/error handlers attached after the awaited SELECT), WR-05 (env strip removes only ANTHROPIC_API_KEY), WR-06/07/08 (harness colour partition ignores hue, POSIX process-group kill, API port fallback), WR-09 (snapshot not validated before seeding reduce), T-05-11-WR01 (a worker credential can author events for any agent)."
    category: architectural
    reason: "None of these makes the office show wrong state on today's code paths. WR-05 is a security-flavoured leak of alternate auth env vars into the subprocess and should be fixed before Phase 6 runs real workloads."
    evidence_status: "source read"
unverified_prohibitions:
  - statement: "MUST NOT rely solely on colour/hue to distinguish blocked/waiting from active — the distinction must remain legible in a grayscale/colourblind-simulated view"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "NON-AUTHORITATIVE LLM-judge verdict: supported. bubbleSprites.test.ts enforces 12 distinct-silhouette glyphs, the frozen animation adds a motion cue, and identity hue is kept separate from state by test ('never lets AgentStatus feed the identity hue'). The live screenshot shows the blocked glyph as a bar-in-circle silhouette. unverified-prohibition — human review recommended (item 2)."
  - statement: "MUST NOT treat mechanically painted dialogue pixels as proof the line is legible at stream scale"
    requirement_id: HANDOFF-02
    verification: judgment
    disposition: "Honoured: this report does not treat the pixel counts as legibility. At native 320x176 the line is an 11px monospace string about 280px wide. Routed to human items 1 and 4."
  - statement: "MUST NOT ship a state-signal overlay that is technically data-correct and mechanically confirmed to paint SOME pixels, but is practically illegible at typical stream/viewing scale"
    requirement_id: OFFICE-03
    verification: judgment
    disposition: "Carried. 68 blocked-glyph px observed live again this session, owner-bound. unverified-prohibition — human review recommended (item 1)."
  - statement: "MUST NOT treat TaskState.title as inherently safe to interpolate into rendered handoff dialogue/bubble text without limit or filtering"
    requirement_id: HANDOFF-02
    verification: null
    disposition: "Length half RESOLVED (16/12 code-point caps, observed live). Content filtering stays explicitly scoped to Phase 7 (SAFE-01/02). The text is now painted, so this is live for any stream audience. Phase 7 must not slip past the first public stream."
human_verification:
  - test: "Open the office at the scale you will actually stream at (OBS source size) with agents in blocked, waiting_for_ceo and waiting_for_agent, plus a handoff in progress, and glance at it for one second without zooming."
    expected: "You can tell which agent is stuck and which kind of stuck, and you can read the handoff line."
    why_human: "Legibility at viewing scale is a judgment call. Glyph and dialogue pixels are proven present and owner-bound, which does not settle whether a viewer can read them."
  - test: "Look at the same view through a grayscale filter and a deuteranopia/protanopia simulator."
    expected: "Blocked/waiting still reads from glyph shape and the frozen animation, with no reliance on hue."
    why_human: "Colourblind survivability of the composited frame has to be looked at."
  - test: "Compare a rendered character side by side with the fork's webview-ui/public/assets/characters/char_0.png at commit 3537e140 and with the MetroCity pack art on the publisher's itch.io page."
    expected: "The figure matches, which confirms ASSET-LICENSES.md section 1 'link 2' (shipped file identity)."
    why_human: "Provenance identity cannot be established from inside this repo."
  - test: "Watch a handoff where the receiver sits on the first desk row (row 3, desks 0-17). Screenshots from this verification's live run show both lines. Check whether a viewer can tell who is speaking, and whether the glyphs sitting over the bottom of the line matter."
    expected: "Decide whether a top-wall banner clamped to x = 0 with glyph overlap is acceptable, or whether desk rows should start at row 4 (36 desks) so the line sits clearly above its speaker."
    why_human: "The geometry is known and correct as specified. Whether it reads as that agent speaking is a product and UX call."
---

# Phase 5: Pixel Office Renderer Verification Report

**Phase Goal:** The forked Pixel Agents office renders real company state on screen as a pure consumer of projections — never a fabricated animation.
**Verified:** 2026-09-22T02:45:00Z
**Status:** gaps_found
**Re-verification:** Yes. This follows gap-closure round 3 (plans 05-13 to 05-16).

## Headline

All four gaps from the prior round are closed as they were stated. The office now paints handoff dialogue on screen, and this verifier saw it happen live instead of taking the SUMMARY's word for it. Two new defects were reproduced deterministically this session, and each breaks a must-have prohibition written into this round's own plans:

1. The office can freeze a handoff sender mid-floor and keep an "accepts" line painted forever (05-REVIEW WR-02).
2. Two overlapping `sendMessage` calls can leave an un-aborted `query()` running (05-REVIEW CR-01).

The first one is on the office's own render path. The second is latent: it has no production caller, and its effect on the office is already muzzled.

## Live proof: run independently

Port 3000 is held by an unrelated WARDOGS Next.js dev server on this machine. So `node scripts/verify-pixel-office-live.mjs` **refused to run**, printing "refusing to reuse a server this harness did not start — port(s) 3000". That directly confirms 05-16's WR-06 truth: nothing was reset, started or written.

To still get independent evidence, I ran a throwaway copy of the harness from `scripts/`, deleted afterwards. It used API port 3100, passed `VITE_WS_BASE_URL` in the environment so Vite picked it up over `.env`, and added canvas screenshots plus a poll for the accepted line. Every assertion is the original's. The result was `LIVE PROOF: PASS` on TRUTH 1-5:

```
office open: canvas 320x176 (scale 1) — sprite=0
TRUTH 1 PASS — 588 sprite pixels painted from live events on an already-open page
TRUTH 2 PASS — 68 blocked-bubble pixels, no navigation between the event and the scan
dialogue scan: 2639 dialogue-box px + 971 text px at x 0..282, y 0..12 (speaker centre x 56, sprite top 24, glyph slot top 9)
VERIFIER accepted-line scan: 2267 box px at x 0..239 y 0..12 (t=50ms)
TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion
TRUTH 5 PASS — ... cleared after the sequence
TRUTH 4 PASS — 68 blocked-glyph px at y 58..67, inside live-proof-seat-18's own headroom
LIVE PROOF: PASS
```

Screenshots of the requested line (`Handing off "live-proof-task…" to live-proof-…`) and the accepted line (`live-proof-… accepts "live-proof-task…"`) show both capped strings rendered legibly at 4x. They are in the session scratchpad (`shots/dialogue-requested-x4.png` and `shots/dialogue-accepted-x4.png`). No listeners were left on 3100 or 5177 afterwards.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1: agents on one floor, sprites and animations match real current state (15 AgentStatus values) | ✓ VERIFIED | Observed live (588 px from relayed events, empty canvas at goto). `STATUS_MAP` has all 15 entries with no fallback. The live path runs company-core `reduce`. |
| 2 | ROADMAP SC2: a blocked or waiting agent can be told apart from an active one at a glance | ✓ VERIFIED (mechanically) | Observed live: 68 px, owner-bound (TRUTH 4). Glyphs are drawn last (pass 3), so dialogue can never hide them, and a test pins that order. Glance and grayscale checks go to human items 1-2. |
| 3 | ROADMAP SC3: handoff shows the walk, a task icon, acceptance, and deterministic template dialogue | ✓ VERIFIED (nominal path) | The prior gap is closed. Walk and icon observed live, requested and accepted lines observed live, both capped, zero LLM or network surface (grep over `handoff/*.ts`). Robustness under interruption fails: see gap 1. |
| 4 | ROADMAP SC4: attribution and licence notices are preserved and visible | ✓ VERIFIED | The footer shows in the live screenshot. `App.test.tsx` pins the sentence. LICENSE and headers unchanged. |
| 5 | Prior gap 2: two seated agents are tellable apart | ✓ VERIFIED | Forward-probing hue allocation. The test "ten measured ids ten distinct hues and pairwise-different pixel data" passes. |
| 6 | Prior gap 3: seats map 1:1, desks reclaimed, no shared tile at 54 or fewer | ✓ VERIFIED | `nextDeskPosition` reads seated state. The churn, no-shared-tile and lowest-free tests pass. |
| 7 | Prior gap 4: a superseded invocation never clears the successor's in-flight flag or writes shared state | ✓ VERIFIED | All six writers guarded by `isCurrent()`. Tests A-E pass. |
| 8 | Dialogue length capped (05-10/05-13 backstop) | ✓ VERIFIED | `capForDialogue` splits by code point, which is surrogate-safe. Observed live: a 23-char id became `live-proof-task…`. |
| 9 | 05-13 prohibition: no handoff line painted after its sequence ends, and no character stranded off its desk | ✗ FAILED | Reproduced (S1/S2). See gap 1. |
| 10 | 05-15 prohibition: no `query()` starts while another un-aborted, unfinished one is live | ✗ FAILED | Reproduced: 3 queries, `aborted=[false,false,false]`. See gap 2. |

**Score:** 8/10 truths verified (0 present-but-behaviour-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/pixel-office/src/engine/renderer.ts` | 3-pass render: sprites, dialogue, glyphs | ✓ VERIFIED | `drawDialogue` reads `bubbleText` and calls `fillText`. It is wired, and the data flows (observed live). |
| `packages/pixel-office/src/handoff/dialogue-templates.ts` | Capped deterministic templates | ✓ VERIFIED | No longer orphaned. |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | FSM plus dialogue lifecycle, id dedup | ⚠️ VERIFIED with defect | The nominal path is correct. Interrupted and despawned paths never retire the record (gap 1). |
| `packages/pixel-office/src/index.ts` | Reclaimed desks, collision-avoiding hue | ⚠️ VERIFIED with defect | Line 171 cancels walks (gap 1). |
| `packages/claude-adapter/src/claude-code-runtime.ts` | One live `query()` per task | ⚠️ VERIFIED with defect | Sequential case correct. Concurrent-arrival race remains (gap 2). |
| `scripts/verify-pixel-office-live.mjs` | Live proof including TRUTH 5, refuses foreign servers | ✓ VERIFIED | Refusal observed. The proof logic passed via an instrumented copy. Does not assert the accepted line paints (advisory). |
| `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` | Dialogue described as shipped | ✓ VERIFIED | Per 05-16 commit 6bf9731 (read, not deeply audited). |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `handoff-choreography` sets `bubbleText` | canvas pixels | `renderScene` pass 2 `drawDialogue` then `fillText` | ✓ WIRED (was NOT WIRED; observed live) |
| `resolveHandoffDialogue` (capped) | the drawn string | `checkHandoffArrivals` / `handleHandoffEvent` | ✓ WIRED |
| OFFLINE despawn | desk reuse | `nextDeskPosition` scan of seated characters | ✓ WIRED |
| create branch | hue then pixels | `identityHueFor` → `createCharacter` → `getCharacterSprites(hueShift)` | ✓ WIRED |
| relayed status event | `upsertCharacterFromAgent` | `applyLiveEvent` | ✓ WIRED, but it cancels an in-progress handoff walk (gap 1) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Harness refuses a foreign server | `node scripts/verify-pixel-office-live.mjs` | Refused on port 3000 (WARDOGS dev server). Nothing reset or started. | ✓ PASS |
| Full live proof, TRUTH 1-5 | instrumented copy on port 3100 | `LIVE PROOF: PASS` | ✓ PASS |
| Accepted line actually paints (WR-10) | same run, 50 ms poll after completion | 2267 box px | ✓ PASS |
| Sender status update mid-return-walk | throwaway vitest, real `updateCharacter` loop | Sender stuck (`type`, 4 tiles left). Accepted line never clears. | ✗ FAIL |
| Sender OFFLINE mid-return | same | Receiver line persists through later updates | ✗ FAIL |
| Two concurrent `sendMessage` calls | throwaway vitest | 3 `query()` calls, none aborted | ✗ FAIL |
| `pixel-office` suite | `npx vitest run --root packages/pixel-office` | 7 files, 87 passed | ✓ PASS |
| `apps/web` suite | `npx vitest run --root apps/web` | 3 files, 18 passed | ✓ PASS |
| `claude-adapter` suite | `npx vitest run --root packages/claude-adapter` | 32 passed, 3 skipped | ✓ PASS |

All throwaway files were deleted afterwards, and `git status` is clean for `packages/` and `scripts/`.

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-pixel-office-live.mjs` | `node scripts/verify-pixel-office-live.mjs` | Refused (port 3000 held by an unrelated app). The refusal is itself the expected WR-06 behaviour. | PASS (refusal path) |
| same, port 3100 via instrumented copy | `node scripts/zz-verifier-live.mjs` (deleted) | exit 0, `LIVE PROOF: PASS` | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| OFFICE-01 | 05-01..16 | ✓ SATISFIED | Truth 1 was observed live. Gap 2 lives in the adapter and cannot write projection state. |
| OFFICE-02 | 05-02/05/06/09/12 | ✓ SATISFIED | Truth 4. **REQUIREMENTS.md line 32/135 still shows OFFICE-02 as unchecked / Gaps Found.** Recommend Complete. The provenance identity check stays human item 3. |
| OFFICE-03 | 05-02/07/08/10/12/13/16 | ✓ SATISFIED (pending human look) | Truth 2. Glyphs are the top layer. |
| HANDOFF-01 | 05-03..16 | ⚠️ PARTIAL | The nominal walk, icon and accept sequence was observed live. Interrupted and despawned sequences strand the sender and leave the line up (gap 1). **REQUIREMENTS.md was already flipped to Complete by 05-16's state commit (54eda9a).** Recommend reverting to Gaps Found until gap 1 closes. The production trigger still has no in-repo producer, which is an accepted boundary: deferred-items.md now correctly says no phase owns it yet. |
| HANDOFF-02 | 05-04/05/10/11/12/13/16 | ✓ SATISFIED | The dialogue is template-only, capped and painted, with zero LLM surface. Content filtering is Phase 7. |

No orphaned requirements. All five IDs appear in plan frontmatter, and REQUIREMENTS.md maps nothing else to Phase 5.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pixel-office/src/index.ts` | 171 | State overwrite that silently cancels an in-flight walk | 🛑 Blocker | Gap 1 |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 123-125 | `continue` forever on a missing participant (a record that never ends) | 🛑 Blocker | Gap 1 |
| `packages/claude-adapter/src/claude-code-runtime.ts` | 144-151 | Ownership claimed after an await with no re-check | 🛑 Blocker | Gap 2 |
| `packages/pixel-office/src/index.ts` | 88-99 | Comment says "Pure" but the function reads the `characters` map (review IN-07) | ℹ️ Info | Misleads replay reasoning |
| `scripts/verify-pixel-office-live.mjs` | ~715 | Fixed 1500 ms sleep and no positive accepted-line assertion | ⚠️ Warning | Advisory 2 |

No `TBD` / `FIXME` / `XXX` markers in the 13 non-planning files changed since `bfb3e8f`.

**Re-verification evidence gate:** all three blocker sites are in files git-modified since the prior `verified:` timestamp (commits 8d4f0f2, 03f2b43/9b5282f, bf13033/0eb8d2a). Each also carries a deterministic reproduction from this session. Both gaps block under the gate.

### Human Verification Required

1. **Stream-scale legibility.** Glance test at OBS size for blocked, waiting_for_ceo and waiting_for_agent, plus a handoff line.
2. **Grayscale and colourblind check** of the same view.
3. **MetroCity provenance, link 2.** Compare a rendered figure against the fork's `char_0.png` and the itch.io art.
4. **Row-3 dialogue attribution.** Is a top-wall banner clamped to x = 0, with glyphs over the bottom of the line, acceptable? If not, use `DESK_ROW_START = 4` (36 desks).

Resolved this round and no longer a human item: the prior "colour-collision tolerance" item. With 12 or fewer seated agents, hues no longer collide.

### Gaps Summary

**Assessment of 05-REVIEW.md's findings:**

- **CR-01 (critical): confirmed. It becomes gap 2 here, but it is outside the office's render path.**
  - Reproduced with three live, un-aborted queries.
  - It does not threaten the phase goal today: the orphan cannot write state, and nothing in the repo calls `sendMessage`, `resumeTask`, `pauseTask` or `cancelTask`.
  - It does break 05-15's own prohibition, which is written without the "successive" qualifier its truth carries.
  - The fix is about six lines. If you would rather defer it to whichever phase first wires a caller, the override is:

  ```yaml
  overrides:
    - must_have: "MUST NOT start a query() for a task while another un-aborted, unfinished query() for the same task is live"
      reason: "Concurrent-arrival race has no in-repo caller; the orphan is muzzled by isCurrent() and cannot write projection state. Must be fixed before Phase 6 wires sendMessage/resume/pause/cancel."
      accepted_by: "<name>"
      accepted_at: "<ISO timestamp>"
  ```

- **WR-02 (warning in the review): upgraded to gap 1 (blocker).**
  - Reproduced against the real update loop.
  - It is the office itself leaving a character typing in the middle of the floor, and a finished handoff's line up indefinitely. That is the "fabricated animation" failure the phase goal names, reached with nothing but real events.
  - 05-13's test suite missed it because `finishWalk` teleports the sender instead of stepping `updateCharacter`, which is the same kind of shortcut past the interface as in earlier rounds.
  - The review already supplies three small fixes.

- **WR-01: advisory plus human item 4.** The geometry is as specified, the text was readable in the live screenshot, and whether it works is a UX call.

- **WR-10: falsified as a defect.** The accepted line paints (observed). It is kept as a test-strength advisory.

- **Others: warnings, not goal-blocking.** Fix WR-05 (the env var leak) before Phase 6 runs real workloads.

**Housekeeping:** REQUIREMENTS.md currently marks HANDOFF-01 Complete and OFFICE-02 Gaps Found. Based on this verification, both should be flipped: HANDOFF-01 to Gaps Found until gap 1 closes, and OFFICE-02 to Complete.

---

_Verified: 2026-09-22T02:45:00Z_
_Verifier: Claude (gsd-verifier)_
