---
phase: 05-pixel-office-renderer
plan: 12
subsystem: web
tags: [playwright, canvas, docker-compose, postgres, vitest, asset-licensing, provenance]
status: complete

requires:
  - phase: 05-09
    provides: "apps/web applying company-core's reduce to every relayed event — the live path Truths 1-3 now assert on, and App.test.tsx, which pins the footer sentence"
  - phase: 05-10
    provides: "DESK_ROW_START/DESK_ROW_PITCH seating and the owner-bound glyph anchoring Truth 4 measures"
  - phase: 05-11
    provides: "the delete-trigger decision this plan's proof header now records honestly"
provides:
  - "A live proof with exactly one Playwright navigation: the office opens empty, every asserted character is created by an event that arrived over the relay while the page stayed open"
  - "Per-run clean store with zero destructive SQL — the harness resolves its target from docker-compose.test.yml and resets via the repo's own db:test:down volume removal, behind a loopback+compose-match guard (WR-05)"
  - "Truth 4: CR-02's regression guard measured on the real composited canvas, scoped to the blocked agent's own tile column"
  - "references/ASSET-LICENSES.md §1 split into the two links the CC0 claim actually depends on, with the pack's licence cited to its publisher's listing"
  - "references/ASSET-LICENSES.md §3 accounts for the 12 bubble/badge glyph assets the renderer loads, verified as originals authored in this repo"
  - "An in-app footer that asserts only the fork's documented MIT licence, pinned sentence-complete by App.test.tsx"
affects: [verify-phase-05, 06-ceo-dashboard]

actuals:
  tokens: 21700
  tasks: 3
  commits: 4
plan_head_before: 578ad6f62da8d750d445e9a310a9879192b3c9b7

tech-stack:
  added: []
  patterns:
    - "Harness selects its target rather than inheriting it: database name and published port are parsed from the compose file that provisions the container, then override DATABASE_URL for BOTH the harness client and every process it spawns"
    - "Reset by recreating the container's volume, never by a destructive statement — the append-only and no-truncate triggers stay untouched"
    - "Region-scoped canvas assertions: a colour count over the whole canvas is a claim about every agent on the floor, so an overlay claim is measured inside its owner's own tile column"
    - "Provenance claims are split per evidence link rather than collapsed to one tier — the link that is verified is cited, the link that is not is named"

key-files:
  created: []
  modified:
    - scripts/verify-pixel-office-live.mjs
    - references/ASSET-LICENSES.md
    - apps/web/src/App.tsx
    - apps/web/src/App.test.tsx
    - .planning/research/PITFALLS.md
    - .planning/phases/05-pixel-office-renderer/05-CONTEXT.md
    - .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md
    - .planning/WINDOWS.md

key-decisions:
  - "The MetroCity CC0 question was NOT a flat downgrade. .planning/research/PITFALLS.md's own source list already carried the publisher's itch.io URL; it was re-fetched during execution (HTTP 200, listing metadata `Asset license: Creative Commons Zero v1.0 Universal`) and cited in §1. What the README credit genuinely cannot establish is the SECOND link — that the fork's char_0.png is that pack's art — so §1 states both links separately instead of one averaged tier."
  - "The in-app footer drops the sprite licence claim entirely rather than restating a softer one. A one-line footer cannot carry a two-link provenance distinction honestly; it credits both sources, asserts only the fork's MIT, and points at the audit."
  - "Per-run reset is `db:test:down` (docker compose down -v), not DROP DATABASE and not row deletion. The first aims a destructive statement at a target resolved from developer configuration; the second is blocked by the append-only/no-truncate triggers by design and unblocking it would subvert the guarantee the event store rests on."
  - "Truth 4's band assertions use the un-offset desk-row anchor (row sprite bottom 56, next row sprite top 72) rather than any one pose's geometry — CHARACTER_SITTING_OFFSET_PX moves a TYPE-posed neighbour 6px lower, which is a pose property, not the desk row's."
  - "requirements-completed left empty, matching 05-11's precedent. Three of the four Phase 5 observable truths still depend on a live proof run and human verification that have not happened; flipping requirement rows Complete here would be exactly the over-claim this plan exists to remove."

patterns-established:
  - "An artifact named a proof must exercise the path it names — a navigation between a posted event and the assertion it feeds makes the assertion about the snapshot path, whatever the assertion text says"
  - "Before recording 'no primary source exists', grep the repo's own research artifacts for one"

requirements-completed: []
requirements-touched: [OFFICE-01, OFFICE-02, OFFICE-03, HANDOFF-01, HANDOFF-02]

coverage:
  - id: D1
    description: "The live proof exercises the live path for every state it proves: one navigation, an empty-canvas assertion before the first event, and no statusChanged post for the receiving agent"
    requirement: "OFFICE-01"
    verification:
      - kind: other
        ref: "grep -c 'page.reload' scripts/verify-pixel-office-live.mjs == 0"
        status: pass
      - kind: other
        ref: "grep -c 'page.goto' scripts/verify-pixel-office-live.mjs == 1"
        status: pass
      - kind: other
        ref: "every statusChanged post (lines 505, 506, 530) sits below the single openOffice call (line 491)"
        status: pass
      - kind: other
        ref: "node --check scripts/verify-pixel-office-live.mjs"
        status: pass
    human_judgment: true
    rationale: "The restructured script has NOT been executed. It recreates a Docker volume and starts two dev servers, so it is a deliberate human run by design (the plan's own <human-check>). The structural gates prove the artifact no longer routes around the live path; only a run proves the live path passes. 05-VERIFICATION.md human-verification item 1 is the same claim from the user's side."
  - id: D2
    description: "The harness resolves its own target from docker-compose.test.yml and resets the test container's volume behind a loopback+compose-match guard, with no destructive SQL anywhere (WR-05)"
    verification:
      - kind: other
        ref: "grep -c 'docker-compose.test.yml' scripts/verify-pixel-office-live.mjs != 0"
        status: pass
      - kind: other
        ref: "grep -cE 'DROP DATABASE|DROP SCHEMA|DELETE FROM' scripts/verify-pixel-office-live.mjs == 0"
        status: pass
      - kind: other
        ref: "compose parse verified against apps/api/docker-compose.test.yml — POSTGRES_DB=pixelfirm_test, published port 5434"
        status: pass
    human_judgment: true
    rationale: "That two consecutive runs produce the same verdict — the property the clean store exists for — can only be observed by running it twice. Not attempted here for the reason above."
  - id: D3
    description: "Truth 4 pins CR-02 on the real composited canvas: the blocked glyph sits strictly below the front desk row's sprite box and strictly above its own, measured inside the blocked agent's own tile column"
    requirement: "OFFICE-03"
    verification:
      - kind: other
        ref: "node --check scripts/verify-pixel-office-live.mjs"
        status: pass
      - kind: other
        ref: "grep -c 'DEFAULT_COLS' scripts/verify-pixel-office-live.mjs != 0 — cohort size and bounds derived from the engine's constants, not literals"
        status: pass
      - kind: other
        ref: "desk arithmetic re-derived from the engine's own source: slots 3 and 3+INTERIOR_COLS both land in interior column 4, on rows 3 and 6; row-3 sprite bottom 56, row-6 sprite top 72, glyph band 57..69"
        status: pass
    human_judgment: true
    rationale: "Same unrun-proof caveat as D1. 05-VERIFICATION.md human-verification item 2 ('which agent does a viewer think is blocked') is judgment-tier regardless of what the assertion measures."
  - id: D4
    description: "references/ASSET-LICENSES.md §1 makes no claim stronger than its evidence: the pack's CC0 licence is cited to the publisher's own listing, and the separate question of the shipped file's identity is named as open"
    requirement: "OFFICE-02"
    verification:
      - kind: other
        ref: "grep -c '^## 1.*Confirmed' references/ASSET-LICENSES.md == 0"
        status: pass
      - kind: other
        ref: "grep -c 'never silently upgraded to confirmed' references/ASSET-LICENSES.md != 0 — §4's rule applied, not removed"
        status: pass
      - kind: other
        ref: "https://jik-a-4.itch.io/metrocity-free-topdown-character-pack re-fetched 2026-09-21, HTTP 200, listing metadata reads 'Asset license: Creative Commons Zero v1.0 Universal'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every sprite asset bubbleSprites.ts imports is accounted for in the audit, recorded as an original authored in this repo rather than a provenance-undocumented third-party asset"
    requirement: "OFFICE-02"
    verification:
      - kind: other
        ref: "grep -ci 'bubble-blocked' references/ASSET-LICENSES.md != 0"
        status: pass
      - kind: other
        ref: "git log --diff-filter=A over all 12 JSON assets — 9 first added at 39fc0b0 (05-02), 3 at 9df473a (05-07); 05-02-SUMMARY.md records no bubble JSON existed in this repo before 05-02"
        status: pass
    human_judgment: false
  - id: D6
    description: "The in-app attribution footer claims exactly what the audit supports, stays always-on and fixed, and is pinned sentence-complete so it cannot drift from the audit silently"
    requirement: "OFFICE-02"
    verification:
      - kind: unit
        ref: "apps/web/src/App.test.tsx#renders the complete attribution sentence, so a silent truncation goes red"
        status: pass
      - kind: unit
        ref: "apps/web/src/App.test.tsx#shows the credit unconditionally — never behind a disclosure element or hidden"
        status: pass
      - kind: other
        ref: "npx vitest run --root apps/web — 3 files, 18 tests, all passed"
        status: pass
    human_judgment: false
  - id: D7
    description: "Every human-verification item this phase accumulated is carried forward with a stated expected outcome, not silently dropped or mechanically marked verified"
    verification:
      - kind: other
        ref: "05-12-PLAN.md carries all four 05-VERIFICATION.md items as <human-check> entries; the two OFFICE-03 judgment-tier items and the WS stale-feed item are listed under 'Outstanding Human Verification' below"
        status: pass
    human_judgment: true
    rationale: "Glyph legibility at stream scale and grayscale/colourblind survivability are judgment calls no automated assertion can settle; the WS stale-feed banner is state-gated and unreachable under static render. Carried, not closed."

duration: 17 min
completed: 2026-09-21
---

# Phase 05 Plan 12: Honest Proof, Honest Licence Audit Summary

**The two artifacts that make claims about this phase now tell the truth about it: the live proof exercises the live relay for every state it asserts (one navigation, empty canvas first, no snapshot-seeded characters) and additionally pins CR-02 on a real composited canvas, while the licence audit cites a primary source for the half of its CC0 claim that holds and names the half that does not.**

- **Duration:** 17 min (2026-09-21T10:04:03Z → 2026-09-21T10:21Z)
- **Tasks:** 3 of 3
- **Commits:** 4
- **Files modified:** 8

## Accomplishments

### Task 1 — the live proof proves the live path (`ef84351`)

The office now opens **empty** and fills from the relay. Restructured so that:

- The single `page.goto` is the only Playwright navigation in the file; `page.reload` is gone, and with it the comment that explained why the proof could not do without it.
- An empty-canvas assertion sits between the open and the first posted event. Without it, moving the posts below the open would prove nothing — it is what makes every later sprite-pixel count attributable to the relay.
- Truth 2 posts `blocked`, sleeps for the render settle window, and scans. No navigation stands between the event and the assertion it feeds.
- Truth 3 no longer pre-seeds the receiver. It asserts the receiver's desk column is empty first, then posts the handoff — and since `handoff-choreography.ts` returns early unless both participants have a Character, a painted task icon is itself proof the handoff event created the receiving character.

The repeat-run defect underneath all of it is also closed. The harness **selects** its target instead of inheriting it: `POSTGRES_DB` and the published port are parsed out of `apps/api/docker-compose.test.yml` at run time and override `DATABASE_URL`'s corresponding components for both the harness client and the spawned dev server. A guard asserts a loopback host and a compose-matching name and port, naming expected versus actual, before anything is touched. The reset itself is the repo's own `db:test:down` — `docker compose down -v` — so the harness contains no `DROP` or `DELETE` statement at all, and the append-only/no-truncate triggers are never in the way because nothing tries to go around them.

### Task 2 — the blocked glyph belongs to the blocked agent (`11270dc`)

A fourth truth, measured on the office's own canvas rather than in a unit-test recording context. It seats `INTERIOR_COLS + 1` agents live so the first and last land in the same interior column on consecutive desk rows, moves **only** the last to `blocked`, and measures inside that agent's own tile column.

Column scoping is what makes it true by construction: `scanCanvas` counts over whatever band it is given, and the Truth-2 agent is still blocked on the first desk row, in exactly the band assertion 1 excludes. Asserted globally, the new truth would fail on every run. Three assertions — glyph strictly below the front row's sprite box (y > 56), strictly above its own (y < 72), and a non-empty guard so neither can pass vacuously — with every bound computed from `DESK_ROW_START`/`DESK_ROW_PITCH` and the decoded sprite height, never written as a literal. The first two would have gone red against the 05-08 code, whose clamp collapsed both rows to y = 0.

The cohort's column is **computed**, not assumed: Truths 1-3 consume desk slots 0-2, so the cohort starts at slot 3 and lands in interior column 4.

### Task 3 — nothing claims more than its evidence (`ac98a52`, `7fe8efb`)

§1's self-contradiction is resolved in the direction §4's own rule requires — but the honest answer turned out to be sharper than a downgrade. **The repo already held a citable primary source.** `.planning/research/PITFALLS.md`'s source list carries the publisher's itch.io URL, recorded at the 2026-09-18 research pass and never carried into the audit. Re-fetched during execution (HTTP 200): the listing's own metadata reads *Asset license: Creative Commons Zero v1.0 Universal*.

So §1 now states the two links the claim actually rests on, separately:

1. **The pack's licence — verified, cited.** The publisher's page, by URL, with the fetch date.
2. **That the file we ship is that pack's art — credit only.** What the renderer loads is the *fork's* `char_0.png`, and the fork's README says its characters are "based on" the pack. "Based on" is a credit, not a provenance record. Closing this is 05-VERIFICATION.md human-verification item 4.

§3 no longer claims "None": the 12 bubble/badge glyphs the renderer genuinely loads are listed, verified against this repo's own history as originals authored here (9 at 05-02, 3 at 05-07), with the note that two take their *concept* from the fork's bubble semantics while the pixel grids are this repo's.

The footer credits the fork (MIT) and the pack and points at the audit — and asserts no licence over the bytes it draws, because a one-line footer cannot carry a two-link distinction honestly. `App.test.tsx` pins the complete sentence. Dated supersession notes were appended to `PITFALLS.md` Pitfall 1 and to `05-CONTEXT.md` after its `<deferred>` block; D-05 and every line inside `<decisions>` are byte-identical. A fourth commit corrected the proof script's own header, which still described the runtime as emitting handoff pairs without recording that 05-11's `delete-trigger` decision removed the only in-repo trigger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] The plan's factual premise was falsified by evidence already in the repo**
- **Found during:** Task 3
- **Issue:** The plan instructed §1 to state that "no primary CC0 source has been located, and locating one requires visiting the upstream asset source, which cannot be done from inside this repo." A repo-wide grep for remaining CC0 claims surfaced `.planning/research/PITFALLS.md:244` — the publisher's itch.io URL, annotated "fetched directly, confirmed CC0 1.0 Universal". Writing the plan's literal text would have recorded a falsehood in the document whose entire purpose is not recording falsehoods.
- **Fix:** Fetched the page (HTTP 200, twice), read the listing's `Asset license` field, and cited it in §1 with the date. Restructured §1 from a flat downgrade into the two-link split above, so the verified half is cited and the unverified half is named.
- **Files modified:** `references/ASSET-LICENSES.md`, `.planning/research/PITFALLS.md`, `.planning/phases/05-pixel-office-renderer/05-CONTEXT.md`
- **Verification:** `curl -sS -L https://jik-a-4.itch.io/metrocity-free-topdown-character-pack` → `<td>Asset license</td><td><a href="https://itch.io/game-assets/assets-cc0">Creative Commons Zero v1.0 Universal</a>`
- **Commit:** `ac98a52`

**2. [Rule 1 - Bug] The plan's `never silently upgraded to confirmed` gate could never match**
- **Found during:** Task 3
- **Issue:** §4's actual wording was `never silently upgraded to "confirmed."` — with the word quoted. The gate's literal pattern read 0 against the pre-edit tree, so it was not a rule-removal detector, it was unsatisfiable.
- **Fix:** Rewrote §4's clause tail to carry the literal phrase. The rule's meaning is unchanged; the gate now genuinely pins it.
- **Verification:** `grep -c 'never silently upgraded to confirmed' references/ASSET-LICENSES.md` → 1
- **Commit:** `ac98a52`

**3. [Rule 1 - Bug] `renderToStaticMarkup` escapes the footer's apostrophe**
- **Found during:** Task 3
- **Issue:** The first rewritten sentence read "JIK-A-4's MetroCity pack". `renderToStaticMarkup` emits `&#x27;`, so the complete-sentence assertion could never match the rendered markup — the suite went red for a purely cosmetic reason.
- **Fix:** Reworded apostrophe-free ("MetroCity pack by JIK-A-4") and recorded why in a comment above the constant, so a future rewrite does not reintroduce it.
- **Verification:** `npx vitest run --root apps/web` → 18/18 pass.
- **Commit:** `ac98a52`

**4. [Rule 2 - Missing critical] `05-UI-SPEC.md` still pinned the old footer sentence**
- **Found during:** Task 3 (repo-wide scan for remaining CC0 assertions)
- **Issue:** `05-UI-SPEC.md` locks the attribution footer's exact wording, including `(CC0)`. Not in the plan's file list, but leaving it would violate the plan's own acceptance criterion that no planning artifact still asserts a confirmed CC0 tier, and would leave a locked spec disagreeing with shipped code.
- **Fix:** Updated the sentence in that row and recorded why inline. The locked *properties* — always-on, fixed, ungated, crediting both sources, pointing at the audit — are untouched.
- **Files modified:** `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md`
- **Commit:** `ac98a52`

**5. [Rule 2 - Missing critical] The proof's own header out-claimed its producer**
- **Found during:** post-task review
- **Issue:** The script's header said the handoff pair is a type "packages/claude-adapter's ClaudeCodeRuntime genuinely emits", with no qualification. True of the runtime's API, but after 05-11's `delete-trigger` decision no in-repo producer triggers it automatically. In the one artifact this plan exists to make honest, that is the exact failure mode.
- **Fix:** Header now records what Phase 5 actually proves (the rendering half, end to end) and where the trigger went.
- **Commit:** `7fe8efb`

**6. [Rule 3 - Blocker] `scanCanvas`'s x-range landed in Task 1, not Task 2**
- **Found during:** Task 1
- **Issue:** The plan assigns region scoping to Task 2, but Task 1's own requirement — "assert the receiver's desk area carries no sprite pixels yet" — is a region claim and cannot be made with a whole-canvas count.
- **Fix:** Task 1 adds the `xRange` parameter (and the desk-slot/tile-column helpers it needs); Task 2 adds the blocked-glyph y extent on top. Both commits stay coherent with their task.

**7. [Rule 3 - Blocker] Removed the `CREATE DATABASE` branch**
- **Found during:** Task 1
- **Issue:** Its stated reason — that the configured dev database is not the one the test container provisions — is exactly what the target-resolution change eliminates. The container creates `pixelfirm_test` itself, so the branch (and its admin connection to `/postgres`) was dead code holding a `CREATE DATABASE` statement aimed at a developer-configured target.
- **Fix:** Deleted; the migration loop is untouched, as the plan requires.

**Total deviations:** 7 auto-fixed (3 × Rule 1 bugs, 3 × Rule 2 missing-critical, 2 × Rule 3 blockers — item 6 counted once under Rule 3). **Impact:** one materially strengthens the plan's outcome (deviation 1 turned a bare downgrade into a cited, correctly-split provenance record); the rest are gate/test correctness and consistency work the plan's own criteria demanded.

### Scope boundary honoured

`packages/orchestration-adapter` still fails `vitest run` with "No test files found" — pre-existing, identical at the phase base commit, untouched.

## Deliberate Non-Completion

**`requirements-completed` is empty, and `requirements.mark-complete` was not run.** The plan's frontmatter lists all five Phase 5 IDs, but 05-VERIFICATION.md scored 1/4 observable truths and explicitly recommended reverting OFFICE-01, OFFICE-03 and HANDOFF-01 to Gaps Found. Three of those four truths now turn on a live proof run and human verification that have not happened. Marking the rows Complete here would be precisely the over-claim this plan was written to remove. 05-11 set the same precedent for the same reason. Phase verification owns the flip.

## Outstanding Human Verification

Recorded, not closed. The first three are the plan's own `<human-check>` items; the rest are accumulated from upstream plans and routed here.

| # | Check | Expected outcome | Source |
|---|-------|------------------|--------|
| 1 | Run `node scripts/verify-pixel-office-live.mjs` **twice in succession** | `LIVE PROOF: PASS` both times; the logged target names `pixelfirm_test`, not whatever `apps/api/.env` names. The second run is the one that matters — it proves the per-run clean store works. | 05-12 Task 1 |
| 2 | Open the office, leave it untouched, post `task.status_changed` → `blocked` for a real agent **without reloading** | The agent's pose freezes and a blocked glyph appears above it, live, with no navigation. | 05-VERIFICATION.md item 1 |
| 3 | With 20+ agents seated, block **only** a second-desk-row agent and look | The glyph sits on the blocked agent, not on the one seated in front of it. | 05-VERIFICATION.md item 2 |
| 4 | Locate a primary source establishing that the fork's `char_0.png` **is** the MetroCity pack's art — or compare a rendered character against the upstream art directly | The rendered figure recognisably matches the upstream sprite; not mis-decoded, mirrored, or corrupted. Closes provenance link 2, at which point §1 and the footer can both be upgraded. | 05-VERIFICATION.md items 3 + 4, now narrowed — the pack's licence half is settled and cited |
| 5 | At typical stream/viewing scale, confirm `blocked` / `waiting_for_agent` / `waiting_for_ceo` glyphs are legible and mutually distinguishable — **and remain so with colour removed** | Distinguishable by silhouette alone in grayscale or a colourblind simulation. | 05-10, OFFICE-03 judgment-tier prohibitions |
| 6 | Confirm the WS stale-feed banner appears on a dropped socket | The disconnect banner renders and says the view is not live. State-gated, so unreachable under static render — no automated test can settle it. | 05-09 |

## Known Stubs

None. No placeholder values, hardcoded empties, or unwired components were introduced.

## Defects Recorded

Appended to `.planning/WINDOWS.md` (now 8 open):

| kind | file | description |
|---|---|---|
| `unrun-verify` | `scripts/verify-pixel-office-live.mjs` | The restructured proof has never been executed end to end. All four truths are structurally complete and `node --check` clean, but no truth has been observed passing on a real canvas since the restructure. |
| `unmet-truth` | `references/ASSET-LICENSES.md` | MetroCity provenance link 2 open — the pack is CC0 at its cited publisher listing, but the shipped file's identity with that pack rests on the fork's credit alone. |

## Verification Results

| Check | Result |
|---|---|
| `node --check scripts/verify-pixel-office-live.mjs` | exit 0 |
| `grep -c 'page.reload' scripts/verify-pixel-office-live.mjs` | 0 |
| `grep -c 'page.goto' scripts/verify-pixel-office-live.mjs` | 1 |
| `grep -c 'docker-compose.test.yml' scripts/verify-pixel-office-live.mjs` | 4 |
| `grep -cE 'DROP DATABASE\|DROP SCHEMA\|DELETE FROM' scripts/verify-pixel-office-live.mjs` | 0 |
| `grep -c 'DEFAULT_COLS' scripts/verify-pixel-office-live.mjs` | 3 |
| `npx vitest run --root apps/web` | 3 files, 18 tests, all pass |
| `grep -c 'never silently upgraded to confirmed' references/ASSET-LICENSES.md` | 1 |
| `grep -ci 'bubble-blocked' references/ASSET-LICENSES.md` | 1 |
| `grep -c '^## 1.*Confirmed' references/ASSET-LICENSES.md` | 0 |
| `grep -c 'Superseded by 05-12 (WR-09):' .planning/research/PITFALLS.md` | 1 |
| `grep -c 'Superseded by 05-12 (WR-09):' .planning/phases/05-pixel-office-renderer/05-CONTEXT.md` | 1 |
| `grep -c 'already-confirmed CC0 MetroCity precedent' .planning/phases/05-pixel-office-renderer/05-CONTEXT.md` | 1 (D-05 intact, not quoted by the appended note) |

Desk arithmetic independently re-derived from the engine's own source before the assertions were written: slot 3 → col 4/row 3, slot 21 → col 4/row 6; sprite height 32, glyph height 13, gap 2; row-3 sprite 24..56, row-6 sprite top 72, row-6 glyph band 57..69.

## Next Phase Readiness

Phase 05's twelfth and final plan is complete. All plan-level automated verification passes. The phase is **not** ready to be scored closed without the human verification table above — in particular item 1, which is the only thing that converts this plan's structural proof into an observed one.

## Self-Check: PASSED

- `scripts/verify-pixel-office-live.mjs` — FOUND
- `references/ASSET-LICENSES.md` — FOUND
- `apps/web/src/App.tsx` — FOUND
- `apps/web/src/App.test.tsx` — FOUND
- `.planning/research/PITFALLS.md` — FOUND
- `.planning/phases/05-pixel-office-renderer/05-CONTEXT.md` — FOUND
- `.planning/phases/05-pixel-office-renderer/05-UI-SPEC.md` — FOUND
- Commits `ef84351`, `11270dc`, `ac98a52`, `7fe8efb` — FOUND (`git rev-list --count 578ad6f..HEAD` = 4)
