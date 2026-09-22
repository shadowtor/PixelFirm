---
phase: 05-pixel-office-renderer
verified: 2026-09-22T16:30:00Z
status: gaps_found
score: 10/11 must-haves verified
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
  - ".planning/phases/05-pixel-office-renderer/05-REVIEW.md"
  - ".planning/phases/05-pixel-office-renderer/05-UI-SPEC.md"
  - ".planning/phases/05-pixel-office-renderer/deferred-items.md"
  - "apps/web/src/App.tsx"
  - "apps/web/src/agent-event-mapper.ts"
  - "packages/claude-adapter/src/claude-code-runtime.ts"
  - "packages/company-core/src/reducer.ts"
  - "packages/pixel-office/src/engine/characters.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.test.ts"
  - "packages/pixel-office/src/handoff/handoff-choreography.ts"
  - "packages/pixel-office/src/index.ts"
  - "packages/pixel-office/src/status/status-mapping.ts"
  - "packages/pixel-office/src/types.ts"
  - "scripts/verify-pixel-office-live.mjs"
covered_digest: "v1:sha256:8503a6856d62d7575347be94a5e0b5a940742a73da5b6b264b3db79f10f2e16b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "Prior gap (05-17 prohibition, CR-01 stranding paths a/b/c): closed. hasArrived (handoff-choreography.ts:49-51) is 'not WALK and empty path' at both tick checks (:180, :194); setRestPose is the only non-walk pose writer (characters.ts) and is used by upsertCharacterFromAgent (index.ts) and the completion handler (:149); walkCharacterTo at the current tile drops the path. Real-loop tests (a), (b), (b2), (c) pass inside the 103/103 pixel-office suite, which I re-ran."
    - "Prior advisories WR-01 (two records drive one sender), WR-02 (icon lost on glyph-less status), WR-03 (same-frame re-seat inherits arrival), IN-03 (mid-walk pose not replayed): closed with named real-loop tests (WR-01, WR-02, WR-03, a1 flipped to TYPE)."
  gaps_remaining: []
  regressions:
    - "New defect exposed by 05-19 (review CR-01, reproduced this session): a handoff permanently deletes the sender's real status glyph. Before 05-19 the pose was also lost, so the sender at least read as IDLE after every handoff; now the restored pose with no glyph reads as a different real status (TESTING sender reads as CODING; BLOCKED / WAITING_FOR_CEO sender reads as a frozen idle agent with no blocked/permission signal). The erasing line (:185) predates 05-19, so this is an unclosed defect in the gap's own surface rather than a code regression."
gaps:
  - truth: "The office never shows an agent in a status it is not in, and blocked/waiting agents keep their at-a-glance signal (phase goal 'never a fabricated animation'; ROADMAP SC1/SC2; OFFICE-01, OFFICE-03), including after the agent sends a handoff"
    status: failed
    reason: "Reproduced this session with a throwaway vitest (deleted; git status clean for packages/, apps/, scripts/) driving only upsertCharacterFromAgent, handleHandoffEvent and stepOffice(1/60). The reducer never changes the sender's status on a handoff (reducer.ts:101-117, :266-278 touch only toAgentId), so no upsert arrives to repair it. Results, sender a -> receiver b, then completion, then 5 s: TESTING sender before {type, bubble:testing}, home {type, bubble:null} (reads as CODING). BLOCKED sender before {idle, bubble:blocked, frozen}, home {idle, bubble:null, frozen} (blocked signal gone). WAITING_FOR_CEO sender before {idle, bubble:permission, frozen}, home {idle, bubble:null, frozen} (waiting signal gone). The wrong display persists until the agent's next changed status, which may never come while it is blocked."
    artifacts:
      - path: "packages/pixel-office/src/handoff/handoff-choreography.ts"
        issue: "Line 185 overwrites any status glyph with 'handoff-task' on arrival; lines 140 (completion) and 74 (retireHandoff) set it to null. Nothing restores the status glyph."
      - path: "packages/pixel-office/src/index.ts"
        issue: "upsertCharacterFromAgent writes bubbleType directly and keeps no record of the status glyph, so the FSM has nothing to restore from (unlike pose, which now has restPose)."
      - path: "packages/pixel-office/src/types.ts"
        issue: "No statusBubble field alongside restPose."
    missing:
      - "Store the status glyph like the pose: Character.statusBubble, written only by upsertCharacterFromAgent; bubbleType = statusBubble ?? (isWaitingHandoffSender(ch) ? 'handoff-task' : null)."
      - "On arrival (handoff-choreography.ts:185): decide precedence explicitly. Review suggests statusBubble ?? 'handoff-task'. At minimum a frozen status glyph (blocked/permission/waiting) must win or be restored."
      - "On completion (:140) and retire (:74): restore statusBubble instead of null."
      - "Real-loop tests: sender TESTING and sender BLOCKED set before the request; after completion + 5 s the sender is home with bubbleType 'testing' / 'blocked'."
deferred: []
advisory:
  - finding: "05-REVIEW.md WR-01 (new): ICON_VISIBLE has no identity check. REPRODUCED: sender goes OFFLINE while waiting at the receiver; the record stays ICON_VISIBLE for good (isWaitingHandoffSender(oldChar) still true after 1 s). After re-seat and the real completion, b goes TYPE (correct: real event) and paints 'b accepts \"t1\"', which is cleared on the very next frame by the RETURNING identity check."
    category: other
    reason: "An omission (accepted line flashes for one frame; a record leaks if completion never comes), not a false claim: the receiver's TYPE is backed by the real completion and nothing untrue is left on screen. Fold into the gap-closure plan: add an ICON_VISIBLE identity-retire branch and use record.fromChar in the completion handler and retireHandoff."
    evidence_status: "reproduced this session (throwaway stepOffice probe)"
  - finding: "05-REVIEW.md IN-01..IN-06 and carried harness warnings WR-02..WR-05 (accepted-line check not tied to receiver, hue-shift partition, POSIX killChildren leak, API port fallback)."
    category: other
    reason: "Comments/latent/cosmetic or harness-only; none makes the office show wrong state on today's paths. IN-01's 'failed re-route continues the old walk' is latent (open floor, no unreachable desk)."
    evidence_status: "source read"
  - finding: "Carried from the prior round: claude-adapter WR-05/IN-01 (graceful stop awaits interrupt() before the 5 s race), env strip WR-07, /ws/browser WR-03/04, snapshot validation WR-09, T-05-11-WR01, row-3 dialogue attribution."
    category: architectural
    reason: "No production caller of the runtime exists; must land before Phase 6 wires one. Not touched by 05-19."
    evidence_status: "source read (prior round)"
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
**Verified:** 2026-09-22T16:30:00Z
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure round 5 (plan 05-19).

## Headline

05-19 closes the gap it was written for. The code matches the summary: `hasArrived`, `setRestPose`, the at-target `walkCharacterTo`, retire-by-sender, `fromChar` identity and `isWaitingHandoffSender` are all present and wired. The seven new real-loop tests pass, and so does the live proof.

The review's new CR-01 is real. I reproduced it on the real loop, and I class it as a **blocker**, not an advisory. A handoff erases the sender's status glyph, and nothing restores it. The reducer never touches the sender's status on a handoff, so no status update comes along to repair it. A BLOCKED or WAITING_FOR_CEO sender comes home frozen with no glyph, which fails OFFICE-03's "clear visual signal at a glance". A TESTING sender comes home typing with no glyph, which reads as CODING, a status the agent is not in. That is the phase goal's "never a fabricated" state. The previous round treated stranding as a blocker even though nothing in the repo produces handoff events yet. This defect has the same reachability, so I classify it the same way.

## Independent reproduction of new 05-REVIEW CR-01 and WR-01

I wrote a throwaway probe, `packages/pixel-office/src/handoff/zz-verifier-probe.test.ts`, and deleted it afterwards. It touched only the public surface: `upsertCharacterFromAgent`, `handleHandoffEvent` and `stepOffice(1/60)`.

| Case | Sender before | At receiver | Home, 5 s after completion | Verdict |
|------|---------------|-------------|----------------------------|---------|
| TESTING sender | `type`, `testing` | `type`, `handoff-task` | `type`, bubble `null` (reads as CODING) | CR-01 CONFIRMED |
| BLOCKED sender | `idle`, `blocked`, frozen | `idle`, `handoff-task`, frozen | `idle`, bubble `null`, frozen (blocked signal gone) | CR-01 CONFIRMED |
| WAITING_FOR_CEO sender | `idle`, `permission`, frozen | `idle`, `handoff-task`, frozen | `idle`, bubble `null`, frozen | CR-01 CONFIRMED |
| Sender goes OFFLINE during ICON_VISIBLE, then re-seats, then completion | — | record stays ICON_VISIBLE for good | b `type` + "b accepts" line, cleared on the next frame | WR-01 CONFIRMED (advisory) |

The reducer (`reducer.ts:101-117`, `:266-278`) changes only `toAgentId` on both handoff events. `applyLiveEvent` sends upserts only for agents whose projection object changed. So no status update ever arrives to restore the sender's glyph.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC1: sprites and animations match real current state | ✓ VERIFIED (steady state) | Live proof TRUTH 1 PASS (588 px) this session; `STATUS_MAP` exhaustive. Post-handoff glyph loss is truth 11. |
| 2 | ROADMAP SC2: blocked or waiting is distinguishable at a glance | ✓ VERIFIED (mechanically, steady state) | TRUTH 2/4 PASS (68 owner-bound px). Human items 1-2. Post-handoff loss is truth 11. |
| 3 | ROADMAP SC3: handoff shows walk, icon, accept, template dialogue | ✓ VERIFIED | TRUTH 3 and TRUTH 5 PASS live (2647 box px + 971 text px). |
| 4 | ROADMAP SC4: attribution and licence preserved and visible | ✓ VERIFIED | Unchanged; apps/web 18/18 (orchestrator run). |
| 5 | Identity hue, 1:1 seats, desk reclaim | ✓ VERIFIED | Regression: pixel-office 103/103, re-run by me. |
| 6 | Superseded adapter invocation never writes shared state; no overlapping `query()` (05-18) | ✓ VERIFIED | Not touched by 05-19 (diff 739887c..HEAD has no claude-adapter files); claude-adapter 35 + 3 skipped (orchestrator). |
| 7 | 05-19: arrival is `hasArrived` at both checks; no code line keys on IDLE | ✓ VERIFIED | `handoff-choreography.ts:49-51, 180, 194`; no `CharacterState.IDLE` in code lines. |
| 8 | 05-19: one pose writer never overwrites WALK; every walk ends in `restPose` | ✓ VERIFIED | `setRestPose` in `index.ts` upsert and completion `:149`; tests a1, (a), (b), (c) pass through `stepOffice`. |
| 9 | 05-19 paths (a), (b), (b2), (c): no stranding, no dropped completion | ✓ VERIFIED | Named real-loop tests pass. 0 `finishWalk` from the 05-17 block onward (per summary; tests read). |
| 10 | 05-19 WR-01/WR-02/WR-03: one record per sender, identity, icon across glyph-less status | ✓ VERIFIED | `:106-112`, `:176`, `:194`, `:208-213`, `index.ts` bubble line; named tests pass. The ICON_VISIBLE identity hole (new WR-01) is advisory. |
| 11 | Phase goal + OFFICE-01/03: a handoff never leaves the sender showing a status it is not in or without its blocked/waiting signal | ✗ FAILED | CR-01 reproduced above. |

**Score:** 10/11 truths verified. No truths are present but behaviour-unverified.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/pixel-office/src/types.ts` | ✓ VERIFIED | `restPose: CharacterState` present. No `statusBubble` (gap). |
| `packages/pixel-office/src/engine/characters.ts` | ✓ VERIFIED | `setRestPose`, walk end in `restPose`, at-target path drop. |
| `packages/pixel-office/src/index.ts` | ⚠️ VERIFIED with defect | Pose goes through `setRestPose`. Bubble is written directly, and no status glyph is kept (gap). |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | ⚠️ VERIFIED with defect | Stranding is fixed. `:185`, `:140` and `:74` erase the status glyph (gap). ICON_VISIBLE has no identity branch (advisory). |
| `packages/pixel-office/src/handoff/handoff-choreography.test.ts` | ✓ VERIFIED | 7 new nested tests plus flipped a1. No test sets a glyph before the request. |
| `scripts/verify-pixel-office-live.mjs` | ✓ VERIFIED | Comment-only change. Ran: `LIVE PROOF: PASS`. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| upsert | `setRestPose` → walk end `restPose` | `index.ts`, `characters.ts` | ✓ WIRED |
| completion | receiver pose | `setRestPose(toChar, TYPE)` `:149` | ✓ WIRED |
| requested | retire by taskId or sender | loop `:106-112` | ✓ WIRED |
| tick checks | identity with `record.fromChar` | `:176`, `:194` | ✓ WIRED. ICON_VISIBLE not covered (advisory) |
| upsert bubble | `isWaitingHandoffSender` | `index.ts` | ✓ WIRED |
| arrival/completion | sender's status glyph restored | — | ✗ NOT_WIRED (gap) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| pixel-office suite incl. 05-19 tests | `npx vitest run --root packages/pixel-office` | 103 passed (plus 4 probe tests while the probe existed: 107/107) | ✓ PASS |
| CR-01 glyph after handoff (TESTING/BLOCKED/WAITING_FOR_CEO) | throwaway probe | glyph null at home in all three | ✗ FAIL |
| WR-01 ICON_VISIBLE OFFLINE | throwaway probe | record leaks; accepted line lasts 1 frame | ✗ FAIL (advisory) |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-pixel-office-live.mjs` | `node scripts/verify-pixel-office-live.mjs` | exit 0; TRUTH 1-5 PASS; `LIVE PROOF: PASS`; no listeners left afterwards | PASS |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| OFFICE-01 | 05-01..18 | ⚠️ SATISFIED in steady state, violated after a handoff | Truth 1; truth 11 (TESTING sender reads as CODING). |
| OFFICE-02 | 05-02/05/06/09/12 | ✓ SATISFIED | Truth 4. Provenance is human item 3. |
| OFFICE-03 | 05-02/07/08/10/12/13/16/17 | ✗ BLOCKED after a handoff | Truth 2 holds in steady state. A blocked/waiting sender loses its glyph after a handoff (truth 11). |
| HANDOFF-01 | 05-03..19 | ✗ PARTIAL | The walk, icon, accept and return sequence is now robust (truths 7-10). The sequence itself corrupts the sender's displayed status (truth 11). **I reverted the executor's `[x]`/Complete to `[ ]`/Gaps Found in REQUIREMENTS.md.** |
| HANDOFF-02 | 05-04/05/10/11/12/13/16 | ✓ SATISFIED | Template-only, capped, painted live. |

Every phase ID appears in at least one plan's `requirements`, and REQUIREMENTS.md maps no other IDs to Phase 5, so nothing is orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 185 | Unconditional overwrite of the status glyph | 🛑 Blocker | Gap |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 140, 74 | Glyph cleared to `null` instead of restored | 🛑 Blocker | Gap |
| `packages/pixel-office/src/handoff/handoff-choreography.ts` | 170-200 | No ICON_VISIBLE identity branch | ⚠️ Warning | Advisory (WR-01) |
| `packages/pixel-office/src/index.ts` | `stepOffice` comment | Still says "WALK->IDLE signal" | ℹ️ Info | IN-01 |

There are no `TBD`/`FIXME`/`XXX` markers in the six files 05-19 modified.

**Re-verification evidence gate:** the blocker sites are in `handoff-choreography.ts`, which was git-modified this round (af8a0b0, b3b76c5). The blocker also has a deterministic reproduction from this session, so it blocks.

### Human Verification Required

1. **Legibility at stream scale.** Do the one-second glance test at OBS size.
2. **Grayscale and colourblind view.** Check the same frame through the filters.
3. **MetroCity provenance, link 2.** Compare a rendered figure against the source art.
4. **Row-3 dialogue attribution.** Decide whether the current layout reads as the right speaker, or move desks to row 4.

These are carried over unchanged. They do not affect the status, which is `gaps_found`.

### Gaps Summary

One gap remains, and it is a new one. The stranding gap is closed.

05-19 made the pose a stored value that every walk returns to. The status glyph got no such treatment. The handoff FSM overwrites the glyph with `handoff-task` when the sender arrives and sets it to `null` on completion or retire. Because a handoff never changes the sender's status in the projection, nothing ever puts the glyph back. A blocked or waiting sender therefore comes home without its OFFICE-03 signal, and a TESTING/REVIEWING/DEPLOYING sender reads as CODING.

The fix mirrors `restPose`:
- add a `statusBubble` field that only the status upsert writes;
- derive the displayed bubble from it, with the handoff icon as the fallback;
- restore `statusBubble` instead of writing `null` at `:140` and `:74`;
- choose explicitly what wins on arrival at `:185`.

Add two real-loop tests where the glyph is set before the request (TESTING and BLOCKED). The same plan should add an ICON_VISIBLE identity branch and make the completion handler and `retireHandoff` act through `record.fromChar` (new WR-01).

---

_Verified: 2026-09-22T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
