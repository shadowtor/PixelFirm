---
phase: 05-pixel-office-renderer
verified: 2026-09-22T15:10:00Z
status: gaps_found
score: 9/10 must-haves verified
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
  - ".planning/phases/05-pixel-office-renderer/05-REVIEW.md"
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
covered_digest: "v1:sha256:be0d0dfe1bce76e474d7c809b0be2ccb14c87468d4dbe01ef9011945febe9c4e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "Gap 2 (overlapping runQuery callers, prior CR-01): token claimed before the preemption await and re-checked after it (claude-code-runtime.ts:144-168); pauseTask/cancelTask claim a fresh token. Named Tests F and G pass (3 passed via -t 'Test F|Test G'); full claude-adapter suite 35 passed, 3 skipped."
    - "Gap 1 as stated (three named paths): a status mid-path no longer overwrites WALK (index.ts guard), OFFLINE sender retires the record in both phases, a replacement request retires the old record via retireHandoff, frozen characters still walk. The 05-17 robustness tests drive stepOffice and use no finishWalk (grep count 0 in that describe block)."
  gaps_remaining:
    - "05-17 prohibition 'MUST NOT leave a character stopped mid-floor or off its own desk because an AgentStatus update ... arrived during a handoff walk' and the phase goal: still violated through writers the 05-17 fix did not cover (review CR-01, reproduced this session)."
  regressions: []
gaps:
  - truth: "MUST NOT leave a character stopped mid-floor or off its own desk because an AgentStatus update, a frozen status or a despawn arrived during a handoff walk (05-17 prohibition), and the office never shows an agent somewhere it is not (phase goal: never a fabricated animation)"
    status: failed
    reason: "Reproduced this session with a throwaway vitest driving the real stepOffice loop at 60 fps (deleted afterwards; git status clean for packages/, apps/, scripts/). All three of 05-REVIEW.md CR-01's paths are real. (a) One-frame arrival window: updateCharacter empties the path but leaves state WALK until the next frame; a CODING status in that gap passes index.ts's `ch.path.length === 0` guard and writes TYPE. Result: sender {state:type, col:4, seat:1} standing on the receiver's desk, no icon, no line; handoff_completed ignored (record never left WALKING_TO_RECEIVER); a further CODING status changes nothing. It only recovers if a later status happens to have an IDLE pose, and even then the arrival fires late, after the completion was already dropped. (b) Same-sender re-request while waiting at the receiver after a TYPE-pose status: findPath returns [] for start == end, so walkCharacterTo does nothing and the state stays TYPE. Result: sender {state:type, col:4, seat:1}, icon and line cleared, completion ignored. (c) Receiver mid-walk (its own handoff B->C) when A->B completes: handoff-choreography.ts:127 writes TYPE with path still pending. Result: B {state:type, col:3, seat:2, path:2} for good. Worse than (a): index.ts's own guard now blocks every later status from resetting the state (path non-empty), so CODING then IDLE statuses left it unchanged, and the B->C completion was ignored (C never reaches TYPE). Root cause shared by all three: arrival is detected as `state === IDLE && path.length === 0`, and writers guard on `path.length === 0`, but 'path empty' is not 'not walking'."
    artifacts:
      - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
        issue: "Line 127 sets toChar.state = TYPE with no WALK/path guard (path c). Lines 157 and 171 detect arrival only via state === IDLE, so a TYPE written in the arrival window or a no-op walk never arrives (paths a, b)."
      - path: "packages/pixel-office/src/index.ts"
        issue: "upsertCharacterFromAgent guards the pose write on ch.path.length === 0 rather than ch.state !== WALK, so the final arrival frame is unprotected."
      - path: "packages/pixel-office/src/engine/characters.ts"
        issue: "walkCharacterTo returns silently on an empty path (start == target), leaving whatever state the character had."
    missing:
      - "Arrival = `ch.state !== WALK && ch.path.length === 0` at handoff-choreography.ts:157 and :171 (review CR-01 fix)."
      - "handoff-choreography.ts:127: only set TYPE when toChar.state !== WALK (or defer the pose until its walk ends)."
      - "index.ts: guard the pose write on ch.state !== WALK, not path length. Preferably store a pending pose and apply it on WALK->IDLE (review IN-03), which also stops a working sender showing IDLE after every handoff."
      - "Retire every live record whose fromAgentId is the new sender on a new request, not just the same taskId (review WR-01, also reproduced: see advisory)."
      - "Three stepOffice-driven tests, one per path (a)/(b)/(c), each using a TYPE-pose status (CODING), each ending with the sender IDLE on its own seat, the receiver not frozen mid-path, and every handoff line null."
deferred: []
advisory:
  - finding: "05-REVIEW.md WR-01 (two records drive one sender): REPRODUCED. A->B (t1) then A->C (t2) while A waits at B. After handoff_completed(t1), A walks home still painting 'Handing off \"t2\" to c' at its own desk with the handoff icon removed; after handoff_completed(t2), C goes TYPE but the accepted line is retired on the next tick because A is already home, so it shows for about one frame."
    category: other
    reason: "Same root-cause family as the gap (records do not own the character exclusively) and violates 05-17 truth 4's intent (never shown handing off at its own desk). Kept advisory rather than a separate blocker only because the fix is one loop in the same function the gap fix touches; fold it into the gap-closure plan (listed under the gap's missing items)."
    evidence_status: "reproduced this session (throwaway stepOffice probe)"
  - finding: "05-REVIEW.md WR-05 (graceful stop not bounded): CONFIRMED by source. attemptGracefulStop awaits record.handle?.interrupt() before starting the 5 s race (claude-code-runtime.ts:364-373). The installed SDK's interrupt() goes through request(), which has no client-side timeout (sdk.mjs request(e,t): no setTimeout; only an optional abort signal, which is not passed). A CLI that never answers the control request hangs pause, cancel, the watchdog's blocked transition and every waiting preemption; the hard-abort fallback is never reached."
    category: architectural
    reason: "Real, but latent for this phase: grep over apps/ and packages/ (tests excluded) finds zero production callers of startTask/sendMessage/resumeTask/pauseTask/cancelTask, so no runtime invocation exists to hang, and the office render path is unaffected. Must be fixed before Phase 6 wires a caller; the review's 4-line race-both fix is sufficient. Not reproduced (every test mock resolves interrupt() immediately)."
    evidence_status: "source read, SDK source read; not reproduced"
  - finding: "05-REVIEW.md IN-01: runQuery reads record.controller after the await, so a slow earlier waiter's timeout abort could hit the newest live controller."
    category: other
    reason: "Requires interrupt() latencies to differ between waiters; no caller exists. Capture `prev = record.controller` before the await when WR-05 is fixed."
    evidence_status: "source read"
  - finding: "05-REVIEW.md WR-02 (sender loses the handoff icon for the rest of the wait on any bubble-less status) and WR-03 (OFFLINE+re-seat in one frame inherits a stale arrival): not reproduced this session; source reading agrees with the review."
    category: other
    reason: "WR-03 is closed by the same identity-or-retire change; WR-02 is a comment-vs-behaviour mismatch on an OFFICE-03 signal. Fold into the gap-closure plan."
    evidence_status: "source read"
  - finding: "Carried: row-3 dialogue overlap (prior WR-01, human item 4), harness WR-06/08/09/10, /ws/browser WR-03/04, snapshot validation WR-09, env strip WR-07 (fix before Phase 6), T-05-11-WR01."
    category: architectural
    reason: "None makes the office show wrong state on today's code paths."
    evidence_status: "source read"
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
    disposition: "68 owner-bound blocked-glyph px observed live again. unverified-prohibition — human review recommended (item 1)."
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
**Verified:** 2026-09-22T15:10:00Z
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure round 4 (plans 05-17 and 05-18).

## Headline

Round 4 closed both gaps as they were written. The adapter race (prior gap 2) is fixed, with named tests. The three handoff paths named in prior gap 1 are fixed, and the tests now drive the real `stepOffice` loop.

The review's new CR-01 is **confirmed on all three paths**. I reproduced each one against the real `stepOffice` loop. A handoff can still strand a character in `TYPE`, either standing on another agent's desk or frozen partway along its path. When that happens the completion event is dropped. In path (c) the stuck character ignores every later status, so it stays stuck for good. This is the same failure the phase goal rules out, so the one blocker stays open with a narrower root cause: "path is empty" is being used to mean "not walking".

## Independent reproduction of 05-REVIEW CR-01

I wrote a throwaway probe, `packages/pixel-office/src/handoff/zz-verifier-probe.test.ts`, and deleted it afterwards. `git status` is clean for `packages/`, `apps/` and `scripts/`. It uses only the public API: `upsertCharacterFromAgent`, `handleHandoffEvent` and `stepOffice(1/60)`.

| Path | Setup | Observed end state | Verdict |
|------|-------|--------------------|---------|
| (a) Status arrives in the one-frame arrival window | a→d. Step until `path` is empty (state is still WALK), then send CODING. Run 5 s, send `handoff_completed`, run 5 s | Sender `{state:type, col:4, seat:1, path:0, bubbleType:null}` stands on d's desk. d stays `idle` and never accepts. A second CODING changes nothing. | CONFIRMED |
| (b) Same sender re-requests while standing at the receiver in TYPE | a→d, arrive, send CODING, re-request same task, then completion | Sender `{state:type, col:4, seat:1}`, icon and line cleared, completion ignored | CONFIRMED |
| (c) Receiver is mid-walk when its incoming handoff completes | a→b arrives. b→c starts, 20 frames pass, then `completed(t1)` | b `{state:type, col:3, seat:2, path:2}`, unchanged after CODING and then IDLE statuses. `completed(t2)` ignored and c never reaches TYPE | CONFIRMED (permanent) |
| WR-01: two tasks share one sender | a→b (t1), then a→c (t2), then `completed(t1)` | a walks home still painting `Handing off "t2" to c` at its own desk, with no icon. c's accepted line lasts about one frame | CONFIRMED (advisory) |

Reachability: (c) does not depend on timing. It only needs a chain handoff where B is walking its own handoff while A→B completes. (a) needs a TYPE-pose status within about 16 ms of an arrival. (b) needs a repeat request event with a new id. There is still no in-repo producer of handoff events. The previous round classed gap 1 as a blocker under the same reachability, and I keep that classification.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1: sprites and animations match real current state (15 AgentStatus values) | ✓ VERIFIED | Live proof re-run this session: TRUTH 1 PASS, 588 px from relayed events. `STATUS_MAP` is exhaustive with no fallback. |
| 2 | ROADMAP SC2: blocked or waiting is distinguishable at a glance | ✓ VERIFIED (mechanically) | TRUTH 2 and 4 PASS: 68 owner-bound glyph px. Glance and grayscale checks are human items 1-2. |
| 3 | ROADMAP SC3: handoff shows the walk, the icon, the accept and template dialogue | ✓ VERIFIED (nominal path) | TRUTH 3 and 5 PASS live. The accepted line was positively observed (2267 px). Robustness is in truth 9. |
| 4 | ROADMAP SC4: attribution and licence preserved and visible | ✓ VERIFIED | Unchanged since the prior round. `App.test.tsx` passes. |
| 5 | Two seated agents can be told apart (hue) | ✓ VERIFIED | Regression check: `index.test.ts` green (pixel-office 96/96). |
| 6 | Seats map 1:1, desks are reclaimed | ✓ VERIFIED | Regression check: same suite. |
| 7 | A superseded invocation never writes shared state | ✓ VERIFIED | Tests A-E still green. |
| 8 | Dialogue length is capped | ✓ VERIFIED | Unchanged. Observed live. |
| 9 | 05-17 prohibition: no character is stranded off its desk or mid-floor by events arriving during a handoff walk, and no line outlives its sequence | ✗ FAILED | The three named paths are fixed, but paths (a), (b) and (c) above reproduce. See the gap. |
| 10 | 05-18 prohibition: no `query()` starts while another un-aborted, unfinished one is live, including when calls overlap | ✓ VERIFIED | Token claimed before the await and re-checked after it (`claude-code-runtime.ts:144-168`). `vitest -t "Test F\|Test G"`: 3 passed. Caveats (IN-01, WR-05) are advisory, with no caller. |

**Score:** 9/10 truths verified. None are present but behaviour-unverified.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | ⚠️ VERIFIED with defect | `retireHandoff` is the single exit and the OFFLINE retire works. Arrival predicate (:157, :171) and the unguarded TYPE write (:127) cause the gap. |
| `packages/pixel-office/src/index.ts` | ⚠️ VERIFIED with defect | `stepOffice` is shared with `startGameLoop` (wired). The pose guard is keyed on path length, not WALK. |
| `packages/pixel-office/src/engine/characters.ts` | ✓ VERIFIED | Frozen characters still walk (tests a2/a3). A no-op `walkCharacterTo` on an empty path contributes to path (b). |
| `packages/claude-adapter/src/claude-code-runtime.ts` | ✓ VERIFIED | Overlap race closed. WR-05 is advisory. |
| `scripts/verify-pixel-office-live.mjs` | ✓ VERIFIED | Ran unmodified on the default ports: `LIVE PROOF: PASS`, including the positive accepted-line assertion. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `startGameLoop` update | `stepOffice` | same function (`index.ts`) | ✓ WIRED |
| relayed status | `upsertCharacterFromAgent` | `applyLiveEvent` | ⚠️ WIRED. Still overwrites WALK in the arrival frame (gap) |
| `handoff_completed` | receiver TYPE | `handleHandoffEvent` :127 | ⚠️ WIRED. Freezes a walking receiver (gap) |
| `handleHandoffEvent` requested | `retireHandoff(previous)` | same-taskId lookup | ⚠️ WIRED, same taskId only (WR-01) |
| `runQuery` | `isCurrent()` re-check after preemption | `claude-code-runtime.ts:168` | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live proof TRUTH 1-5 | `node scripts/verify-pixel-office-live.mjs` | exit 0, `LIVE PROOF: PASS`, accepted line 2267 px. No listeners left afterwards | ✓ PASS |
| Overlap and pause-during-preemption | `npx vitest run --root packages/claude-adapter -t "Test F\|Test G"` | 3 passed | ✓ PASS |
| CR-01 (a) arrival-window status | throwaway `stepOffice` probe | sender stuck TYPE on receiver desk | ✗ FAIL |
| CR-01 (b) same-sender re-request | same | sender stuck TYPE, completion ignored | ✗ FAIL |
| CR-01 (c) walking receiver completes | same | receiver frozen with `path:2`, immune to later statuses | ✗ FAIL |
| WR-01 shared sender | same | stale "Handing off t2" painted at sender's own desk | ✗ FAIL (advisory) |
| pixel-office / claude-adapter / apps/web suites | `npx vitest run --root <pkg>` | 96 / 35 passed + 3 skipped / 18 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-pixel-office-live.mjs` | `node scripts/verify-pixel-office-live.mjs` | exit 0, TRUTH 1-5 PASS (run twice) | PASS |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| OFFICE-01 | 05-01..18 | ✓ SATISFIED | Truth 1, observed live. The adapter race is closed. |
| OFFICE-02 | 05-02/05/06/09/12 | ✓ SATISFIED | Truth 4. Provenance identity is human item 3. |
| OFFICE-03 | 05-02/07/08/10/12/13/16/17 | ✓ SATISFIED (pending human look) | Truth 2. WR-02 (icon lost during the wait) is advisory. |
| HANDOFF-01 | 05-03..17 | ✗ PARTIAL | Nominal sequence observed live. Paths (a)/(b)/(c) strand characters and drop completion (gap). |
| HANDOFF-02 | 05-04/05/10/11/12/13/16 | ✓ SATISFIED | Template-only, capped and painted. Content filtering is Phase 7. |

REQUIREMENTS.md maps no other IDs to Phase 5, so nothing is orphaned. Its traceability table shows all five as "Gaps Found". Based on this report, OFFICE-01/02/03 and HANDOFF-02 can move to Complete. HANDOFF-01 stays Gaps Found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 127 | State write with no walk guard | 🛑 Blocker | Gap path (c) |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 157, 171 | Arrival requires `state === IDLE` | 🛑 Blocker | Gap paths (a) and (b) |
| `packages/pixel-office/src/index.ts` | pose guard | `path.length === 0` used as "not walking" | 🛑 Blocker | Gap path (a) |
| `packages/claude-adapter/src/claude-code-runtime.ts` | 364-373 | Unbounded await before the timeout race | ⚠️ Warning | Advisory (WR-05), latent |

No `TBD`/`FIXME`/`XXX` markers in the 7 files changed since `d054c11`.

**Re-verification evidence gate:** the blocker sites are in `handoff-choreography.ts` and `index.ts`. Both were git-modified in this round (commit aeb5355 and its siblings), and each has a deterministic reproduction from this session. The gap is also carried forward from the prior report's gap 1, under the same truth. It blocks.

### Human Verification Required

1. **Legibility at stream scale.** Do the glance test at OBS size.
2. **Grayscale and colourblind view.** Check the same frame with the filters.
3. **MetroCity provenance, link 2.** Compare a rendered figure against the source art.
4. **Row-3 dialogue attribution.** Decide whether the current layout reads as the right speaker, or move desks to row 4.

### Gaps Summary

There is one gap, and all its paths share a root cause. The handoff FSM and the status upsert treat "path is empty" as "not walking". That misses two cases:

- the final frame of a walk, where the state is still WALK;
- a walk that never started because start and target were the same tile.

The completion handler is also a third writer that 05-17 never guarded. The review's CR-01 fix covers all three:

- test arrival with `state !== WALK && path.length === 0`;
- skip the TYPE write for a walking receiver;
- key the upsert guard on WALK.

Fold WR-01 into the same plan: retire records by sender, not only by taskId. It is the same "one character, one walk" invariant. The fix also needs three tests driven by `stepOffice` that use a TYPE-pose status.

**WR-05** is real but latent. No production code calls the runtime, so it goes before Phase 6 rather than into this phase.

---

_Verified: 2026-09-22T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
