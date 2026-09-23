---
phase: 05-pixel-office-renderer
reviewed: 2026-09-23T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - apps/web/index.html
  - apps/web/src/App.test.tsx
  - apps/web/src/App.tsx
  - apps/web/src/agent-event-mapper.test.ts
  - apps/worker/src/poll-loop.test.ts
  - packages/orchestration-adapter/package.json
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/layout/office-layout.json
  - packages/pixel-office/src/layout/officeLayout.ts
  - packages/pixel-office/src/sprites/bubble-waiting.json
  - packages/pixel-office/src/sprites/bubbleSprites.test.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 1
  warning: 8
  info: 8
  total: 17
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-23
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Incremental review of gap-closure plans 05-31..05-35 plus the two orchestrator gate
fixes (diff base `23c1fe3`). Scope: the full-viewport canvas sizing and transparent
footer (05-31), the seat-independent sitting offset and hourglass redraw (05-32), the
four-candidate bubble scorer (05-33), fixed aisle interaction slots (05-34), the
`getActiveHandoffs()` host read path (05-35), and the poll-loop `waitFor` /
`--passWithNoTests` gate fixes.

The four specific questions raised in the scope brief were traced to source:

- **Bubble scorer with no surviving candidate.** Reachable in principle, not in
  practice on the shipped layout — but the fallback path itself is defective (CR-01
  is a different issue; see WR-01). The sweep that is cited as proof of
  unreachability never renders the *widest possible* bubble, so the proof is ~6 px
  short of the worst case.
- **`interactionSlotsFor` returning an empty list.** It cannot, for any of the 20
  shipped homes — enumerated below, the minimum is 2 slots. `interactionTileFor`,
  however, can still return `null` far more easily than its own doc claims (WR-03).
- **`getActiveHandoffs().box` going stale.** Confirmed, and worse than the
  documented `null`-before-first-frame case: the box can be a rect from an
  arbitrarily old frame, and no reset path clears it (CR-01).
- **`waitFor` masking a real failure.** All five call sites *are* followed by an
  assertion that fails on shortfall — verified individually. The helper is sound;
  the timeout budget around it is not (WR-06).

## Critical Issues

### CR-01: `framePlacements` is module state with no reset — `getActiveHandoffs().box` can be an arbitrarily stale rect, and it leaks across tests

**File:** `packages/pixel-office/src/engine/renderer.ts:403`, `:422-425`; `packages/pixel-office/src/index.ts:211-215`; `packages/pixel-office/src/handoff/handoff-choreography.ts:392`

**Issue:** `framePlacements` is only ever reassigned inside `renderScene`
(`renderer.ts:493`). Nothing else clears it — not `_resetForTests()`
(`index.ts:211-215`), not `_resetHandoffsForTests()`. Two consequences:

1. **The documented contract of the new accessor is unenforceable.**
   `ActiveHandoff.box` is documented as "where the speaking bubble was drawn in the
   last rendered frame, for hit-testing". It is actually "the last frame
   `renderScene` ran", which is not the same thing whenever rendering is paused
   while state keeps moving — `requestAnimationFrame` is throttled/suspended in a
   hidden tab or a backgrounded OBS browser source, and `startGameLoop`'s returned
   stop function (`index.ts:199`) halts it outright while the FSM keeps advancing
   through `handleHandoffEvent`. A caller receives a non-`null` rect that
   corresponds to nothing on screen and has **no way to detect it**. That is
   strictly worse than the `box: null` case the executor flagged as intended, which
   at least a naive consumer can guard.

2. **Present-tense test-isolation leak.** `handoff-choreography.test.ts` installs a
   global `beforeEach(_resetForTests)` (line 79), which clears characters, titles
   and handoff records but leaves the previous test's `framePlacements` in place.
   Because agent ids are reused across tests (`agent-a`, `agent-1`, ...),
   `getDialogueBox("agent-a")` can return a rect drawn by an earlier test. The
   suite currently hides this: every `activeHandoffs()` assertion in the `host read
   path` describe calls `renderFrameBoxFills()` first, so no test ever reads the
   accessor without a fresh frame. The leak is real and untested.

**Fix:** give the per-frame record an identity the caller can validate, and make the
reset path complete.

```ts
// renderer.ts
let frameId = 0;
let framePlacements: Array<DialoguePlacement & { speakerId: string }> = [];

/** Monotonic id of the last frame renderScene drew. @internal */
export function lastFrameId(): number {
  return frameId;
}

/** @internal — mirrors index.ts's _resetForTests. */
export function _resetFrameForTests(): void {
  framePlacements = [];
}

// inside renderScene, replacing `framePlacements = [];`
frameId++;
framePlacements = [];
```

```ts
// index.ts
import { _resetFrameForTests } from "./engine/renderer.js";

export function _resetForTests(): void {
  characters.clear();
  taskTitles.clear();
  _resetHandoffsForTests();
  _resetFrameForTests(); // the renderer's per-frame record is state too
}
```

Then either surface the frame id on `ActiveHandoff` (`boxFrameId: number | null`) so
a host can compare it against `lastFrameId()`, or have `getDialogueBox` return
`undefined` unless it was populated by the current frame. Add a test that asserts
`getActiveHandoffs()[0].box === null` **without** calling `renderScene` first — it
goes red today against a leftover record.

## Warnings

### WR-01: the no-valid-candidate fallback draws an unvalidated box and picks the wrong invalid candidate

**File:** `packages/pixel-office/src/engine/renderer.ts:326-331`

**Issue:** When no candidate satisfies the hard constraints:

```ts
let best = candidates.find((c) => c.valid) ?? candidates[0];
for (const c of candidates) if (c.valid && beats(c, best)) best = c;
```

`candidates[0]` ("below") is returned unconditionally, and the loop can never
improve on it because every replacement requires `c.valid`. `drawDialogue`
(`:391-399`) then paints it with no clamp, so the box can straddle the canvas edge
or sit on a state glyph — the two things the scorer exists to prevent. Two separate
defects in the fallback: (a) no clamp, (b) no ranking among invalid candidates, so
"below" wins even when "above" would cover 0 desk px and merely clip the floor
edge by 1 px.

The unreachability argument rests on the sweep at `renderer.test.ts:534`. That sweep
drives `registerTaskTitle("task-1", "Fix login bug")` with unnamed agents, so the
widest line it renders is `"agent-13 accepts Fix login b…"` = 29 code points. The
real maximum is `MAX_DIALOGUE_NAME_CHARS (10) + " accepts " (9) + MAX_DIALOGUE_TITLE_CHARS (12)`
= 31 code points — 2 code points / ~6 device px wider at every zoom. Since glyph
collision is a *hard* constraint and the "below" candidate already collides with
every row-8 glyph for an aisle speaker, 6 px of extra width is exactly the kind of
margin that flips a scene.

**Fix:** clamp the fallback into the floor and rank invalid candidates too, then make
the sweep render the true maximum line.

```ts
// least-bad even when nothing is valid: prefer valid, then the soft keys
const rank = (c: DialogueCandidate) => [c.valid ? 0 : 1, c.deskArea, c.furnitureArea, c.characterArea];
const best = [...candidates].sort((a, b) => {
  const [ra, rb] = [rank(a), rank(b)];
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || ra[3] - rb[3];
})[0];
// and clamp unconditionally, so an invalid winner is at worst mis-ranked, never off-canvas
const x = Math.max(floor.left, Math.min(best.x, floor.right - best.w));
const y = Math.max(floor.top, Math.min(best.y, floor.bottom - best.h));
```

In the sweep, register a 12-code-point title and `upsertCharacterFromAgent(id, status, "AAAAAAAAAA")`
so the widest possible bubble is the one being scored.

### WR-02: the footer lost its contrast guarantee, and "never over the floor" is false whenever the canvas overflows the viewport

**File:** `apps/web/src/App.tsx:169-183`

**Issue:** 05-31 deleted `background: "rgba(0, 0, 0, 0.6)"` from the fixed footer,
leaving `color: "#cccccc"` with no backdrop of its own. The comment at `:166-168`
asserts the footer "overlays the office's own bottom wall row (and the WALL_COLOR
remainder below it), **never the floor**". That holds only while the canvas fits the
viewport. `displayScaleFor` clamps at `MIN_DISPLAY_SCALE = 3`, so the canvas is never
smaller than 960x528; on any viewport shorter than 528 px or narrower than 960 px the
wrapper's `overflow: "auto"` scrolls the canvas while the `position: fixed` footer
stays pinned — landing it on the floor.

Measured contrast of `#cccccc`:

| behind the footer | ratio | WCAG AA (11 px normal text, needs 4.5:1) |
|---|---|---|
| `WALL_COLOR` `#3a3a5c` | 6.74:1 | pass |
| floor plank `#7d4e13` | 4.40:1 | **fail** |
| floor plank `#926429` | 3.21:1 | **fail** |

The old `rgba(0,0,0,0.6)` layer made the ratio independent of what was underneath.
`verify-pixel-office-live.mjs` only checks the two documented OBS sizes
(`:810-813`), so neither the geometry claim nor the contrast regression is covered.

**Fix:** restore a backdrop that does not reintroduce the black strip — a
`WALL_COLOR` fill with the same colour the surround already uses keeps G-05-P6's "no
black frame" property while making contrast unconditional:

```tsx
style={{
  position: "fixed", bottom: 0, left: 0, right: 0,
  padding: "4px 8px", fontSize: "11px", fontFamily: "monospace",
  color: "#cccccc",
  background: WALL_COLOR, // same value as the surround: continuous, never black
}}
```

If the transparency is wanted, add a viewport size below `MIN_DISPLAY_SCALE` to
`OBS_SIZES` and assert the footer's backdrop rather than its position.

### WR-03: `interactionTileFor`'s documented `null` bound is wrong by ~2.5x — two occupants can null out a corner home

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:85-87`; `packages/pixel-office/src/layout/office-layout.json:39`

**Issue:** The ponytail note claims "null needs every slot of one receiver blocked,
i.e. 5+ concurrent senders or loiterers in that stretch of aisle". Enumerating
`interactionSlotsFor` over all 20 homes with `interaction.row = 6`,
`colOffsets = [1,-1,3,-3]`:

| home column | candidate cols | surviving slots |
|---|---|---|
| 1 | 2, 0(wall), 4, -2(off-map) | **2** |
| 3 | 4, 2, 6, 0(wall) | 3 |
| 5..15 | c±1, c±3 | 4 |
| 17 | 18, 16, 20(off-map), 14 | 3 |
| 18 | 19(wall), 17, 21(off-map), 15 | **2** |

Four homes — `(1,4)`, `(1,8)`, `(18,4)`, `(18,8)` — have exactly two slots.
Occupancy rejects a slot at Chebyshev distance ≤ 1 (`:100`), and two aisle occupants
2 columns apart are themselves legal, so **two** loiterers (not five) null out those
homes. The caller then falls back to `{ col: fromChar.tileCol, row: fromChar.tileRow }`
(`:198`) — the sender never leaves its desk and the requested line is drawn at its own
seat, which is exactly the "the sender didn't go anywhere" reading G-05-P2 set out to
fix.

**Fix:** correct the comment to the real bound and widen the slot set so the corner
homes are not the weak point:

```json
"interaction": { "row": 6, "colOffsets": [1, -1, 3, -3, 5, -5] }
```

```
 * ponytail: null needs every surviving slot of one receiver blocked. The corner
 * homes (cols 1 and 18) keep only 2 slots after the wall/off-map filter, so two
 * aisle occupants are enough there; interior homes need four.
```

### WR-04: the `INTERACTION` validator checks a weak invariant and omits the load-bearing one

**File:** `packages/pixel-office/src/layout/officeLayout.ts:87-99`

**Issue:** The IIFE validates that `interaction.row` is an in-range integer and that
the row has at least one free floor tile. Neither is the invariant the rest of the
system depends on. `interactionSlotsFor`'s own docstring states it: *"The aisle row is
the only interior row two tiles from every seat and standing spot, so no slot can ever
be shoulder-to-shoulder with a seated or standing agent"* — and `interactionTileFor`
rejects any slot within Chebyshev 1 of a seat (`handoff-choreography.ts:100`).

Set `interaction.row` to 3, 5, 7 or 9 and every check passes (row 5 has free floor at
cols 4/8/12/16; rows 3 and 7 are wholly free), yet every slot is then adjacent to a
seat row and `interactionTileFor` returns `null` for essentially every receiver with a
neighbour — silently disabling the whole handoff walk, with the load-bearing claim in
the docstring now false. The validator throws on the harmless cases and waves through
the harmful one.

**Fix:** validate what the code actually relies on.

```ts
const nearHome = [...SEATS, ...STANDING_SPOTS].find((h) => Math.abs(h.row - raw.row) <= 1);
if (nearHome) {
  throw new Error(
    `office-layout.json: interaction.row ${raw.row} is within 1 row of the home at ` +
      `(${nearHome.col},${nearHome.row}) — every slot would be shoulder-to-shoulder with a seated agent`,
  );
}
```

### WR-05: the below/above tail x is anchored to the speaker while the box x is clamped to the floor — nothing keeps them connected

**File:** `packages/pixel-office/src/engine/renderer.ts:295-306`

**Issue:** `pairX` is clamped into the floor interior
(`Math.max(floor.left, Math.min(..., floor.right - w))`) while `tailX` is
`Math.round(speaker.centerX - zoom / 2)` with no relation to the clamped box. For the
`below` and `above` candidates the tail is therefore only inside the box by
arithmetic coincidence: it holds today because `interaction.colOffsets` are all ≤ 3,
so `|speakerCol - partnerCol| ≤ 3` and the midpoint never drifts more than ~24 px from
the speaker, less than the box's half-width. Widen `colOffsets` (the fix suggested in
WR-03 does exactly that, to ±5) or place a sender further from its receiver, and the
tail detaches — a 1-px ink stub floating in open floor, pointing at nothing, while the
bubble sits elsewhere.

Nothing catches it. `renderer.test.ts`'s `tailOf(ink, box)` helper (`:474-478`) asserts
only that *exactly one* ink rect lies outside the box, and the sweep asserts
`touches(tail, spriteRect(speaker))` — a detached tail satisfies both.

**Fix:** clamp the tail into the box's span, and assert the relationship.

```ts
const tailX = Math.min(
  Math.max(Math.round(speaker.centerX - zoom / 2), pairX),
  pairX + w - zoom,
);
```

Then in the sweep, add `expect(spansX(box, tail.x) && spansX(box, tail.x + tail.w))`
per candidate.

### WR-06: the poll-loop `waitFor` budget can exceed the per-test timeout, defeating its own deadline-return design

**File:** `apps/worker/src/poll-loop.test.ts:35-41`, `:99`, `:112`, `:122`

**Issue:** The helper deliberately `return`s on deadline expiry so the caller's
`expect()` reports the real shortfall rather than an opaque timeout — and all five
call sites were verified to be followed by an assertion that fails on shortfall:

| line | wait predicate | following assertion | fails on shortfall? |
|---|---|---|---|
| 99 | both types ≥ 1 | `toHaveLength(1)` x2 | yes |
| 112 | worktree ≥ 2 | `toHaveLength(2)` | yes |
| 141 | gsd ≥ 1 | `length).toBeGreaterThan(0)` (:145) | yes |
| 170 | gsd ≥ 1 | `length).toBeGreaterThan(0)` (:173) | yes |
| 210 | gsd ≥ 1 | `toBeGreaterThanOrEqual(1)` (:212) | yes |

The design is sound; the budget is not. The first test calls `waitFor` twice with the
5 000 ms default plus a `sleep(200)` plus fixture-repo setup, inside a 10 000 ms test
timeout (`:122`). A genuinely broken poll loop therefore hits vitest's
`Test timed out in 10000ms` — precisely the opaque failure the `return` exists to
avoid — instead of `expected length 2, received 1`.

**Fix:** size the helper's default so two waits fit inside the test budget, and make
the relationship explicit.

```ts
/** Default sized so two waits fit inside the 10 s per-test budget. */
async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
```

### WR-07: `getActiveHandoffs` identifies the speaker by string-comparing bubble text, so identical lines mis-attribute the box

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:373-384`

**Issue:** Both branches decide whose bubble is showing a handoff's line by comparing
`bubbleText` against the record's stored text. Text is not an identity. Two concurrent
handoffs to the same receiver whose tasks share a title (or both fall back to a title
that caps to the same 12 code points) produce byte-identical `acceptedText`, so record
A claims `speakerId = toAgentId` and reports A's `box` even though the pixels on screen
belong to B. `getDialogueBox` then resolves the same rect for both records
(`:422-423` finds by `speakerId`), so a host hit-test attributes the click to whichever
record `handoffs.values()` yields first — insertion order, i.e. arbitrary from the
caller's point of view. The same latent ambiguity already exists in `retireHandoff`
(`:150-157`), so this generalises a pre-existing weakness rather than introducing it,
but 05-35 is the first code to expose it across a module boundary.

**Fix:** stamp the writer, so the check is identity rather than equality.

```ts
// on Character: `bubbleTextTaskId: string | null`
toChar.bubbleText = record.acceptedText;
toChar.bubbleTextTaskId = record.taskId;
// ...
if (toChar?.bubbleTextTaskId === record.taskId) speakerId = record.toAgentId;
```

### WR-08: an aisle slot can be handed to a second sender while the first is still standing on it

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:94-98`

**Issue:** Two exclusions in `interactionTileFor` are keyed on state that changes
before the character physically moves:

```ts
if (ch.state !== CharacterState.WALK) taken.push({ col: ch.tileCol, row: ch.tileRow });
// ...
if (record.fromChar !== fromChar && record.phase !== "RETURNING_TO_DESK") taken.push(record.target);
```

The instant a completion event fires, `handleHandoffEvent` sets
`phase = "RETURNING_TO_DESK"` and calls `walkCharacterTo` (`:230`, `:239`), so on the
very same tick the record's `target` stops being `taken` *and* the sender's tile stops
being `taken` (it is now `WALK`) — while the sender is still rendered on that tile.
A concurrent request can therefore be assigned the occupied slot. Transient (the first
sender is walking away), but it is the same "two agents stacked 16 px apart" reading
G-05-P2 was raised to eliminate, and the phase's own review item WR-05 claims a slot
"can never look like it is sitting at someone else's desk".

**Fix:** keep a departing sender's tile reserved until it has actually left it.

```ts
for (const record of handoffs.values()) {
  if (record.fromChar === fromChar) continue;
  taken.push(record.target); // reserved for the whole record, departure included
}
```

## Info

### IN-01: `lastDialoguePlacements()` returns the live mutable array, not a read-only view

**File:** `packages/pixel-office/src/engine/renderer.ts:405-410`

**Issue:** The doc says "Replaced per frame; read-only", and the return type is
`ReadonlyArray<...>` — but the returned reference *is* `framePlacements`, and every
element (including each `candidates` entry) is the live object the next frame reads
while building obstacle sets. A caller that mutates an element corrupts renderer
state. `getDialogueBox` (`:422-425`) copies; this does not.

**Fix:** `return framePlacements.map((p) => ({ ...p, candidates: p.candidates.map((c) => ({ ...c })) }));`
— or mark the function `@internal` test-only and keep it out of `index.ts` (it already
is).

### IN-02: `displayScaleFor`'s "any footer allowance is the caller's" comment is now vestigial

**File:** `packages/pixel-office/src/index.ts:18-27`

**Issue:** 05-31 removed `FOOTER_RESERVE_PX` and its only caller now passes the raw
viewport. The comment points a future reader at a subtraction that no longer exists
anywhere.

**Fix:** replace with "Pure: the caller passes the raw viewport (05-31, G-05-P6 — no
footer allowance)."

### IN-03: `interactionTileFor` re-checks walkability that `interactionSlotsFor` already guaranteed

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:101`

**Issue:** `interactionSlotsFor` filters on `=== TileType.FLOOR_1 && !blocked.has(...)`
(`officeLayout.ts:118-121`); the `isWalkable(..., FURNITURE_BLOCKED_TILES)` call here
re-derives the same predicate. Two copies of one rule, and the second obscures which
module owns it.

**Fix:** drop the `isWalkable` line and note in the comment that
`interactionSlotsFor` owns floor/furniture filtering.

### IN-04: the footer-background guard is a literal-string check any other black notation defeats

**File:** `apps/web/src/App.test.tsx:96-97`

**Issue:** `not.toContain("rgba(0, 0, 0")` and `not.toContain("#000")` pass for
`background: "black"`, `rgb(0,0,0)`, `#010101`, or React's own whitespace variant
`rgba(0,0,0,.6)`. The regression it guards is "the footer has a dark backdrop", not
"the footer contains these two substrings".

**Fix:** assert the property instead — extract the footer's `background` declaration
and assert it is absent, or (preferably, per WR-02) assert it equals `WALL_COLOR`.

### IN-05: the verify harness hardcodes `TAIL_REACH_PX = 18`, breaking its own "read geometry from the engine" rule

**File:** `scripts/verify-pixel-office-live.mjs:1059`

**Issue:** The file's header states "Geometry and colours come from the engine's own
data files (05-12 rule)", and it does read `TILE_SIZE`, `DEFAULT_COLS`,
`WALL_COLOR` etc. through `readNumberConst`/`readColorConst`. `TAIL_REACH_PX` instead
hardcodes 18 with a comment deriving it from "GLYPH_ROWS 13 + BUBBLE_ICON_GAP_PX 1 +
DIALOGUE_TAIL_PX + 2 slack" — while `renderer.ts:245` derives `GLYPH_ROWS` from the
assets at run time precisely so a taller redraw is absorbed. A glyph redrawn taller
fails this assertion spuriously.

**Fix:** compute it from the same sources the renderer uses (glyph JSON row counts +
`BUBBLE_ICON_GAP_PX` + `DIALOGUE_TAIL_PX` + slack) rather than restating the sum.

### IN-06: `assertBubble` treats the union of all bubble-fill pixels as one bubble

**File:** `scripts/verify-pixel-office-live.mjs:1068-1075`

**Issue:** `scanCanvas` returns a single `dialogueMinX..dialogueMaxX` /
`dialogueMinY..dialogueMaxY` bounding box over *every* `DIALOGUE_BOX_COLOR` pixel on
the canvas. With two bubbles drawn (05-33 explicitly supports concurrent lines — see
`renderer.ts:503`, where placed bubbles join the character obstacle class), the derived
`box` is a merged rect belonging to neither, and the floor/furniture/glyph/tail-reach
assertions are all made about a fiction. The unit test guards this with
`expect(fills).toHaveLength(1)`; the harness has no equivalent.

**Fix:** assert single-bubble-ness before deriving the box, e.g. return a contiguous
run count from `scanCanvas` and `assert(runs === 1, ...)`, or scope the scan to the
speaker's expected region.

### IN-07: `ActiveHandoff.phase` references the non-exported `HandoffPhase`

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:25`, `:350`; `packages/pixel-office/src/index.ts:42`

**Issue:** `ActiveHandoff` is exported from the package root but `HandoffPhase`
(declared `type HandoffPhase = ...` with no `export`) is not. Consumers can read
`h.phase` and narrow it by literal, but cannot name the union — and any future
`declaration: true` build fails with TS4033 ("has or is using private name"). It works
today only because `main` points at `src/index.ts` and no `.d.ts` is emitted.

**Fix:** `export type HandoffPhase = ...` and re-export it alongside `ActiveHandoff`.

### IN-08: `--passWithNoTests` permanently suppresses the empty-suite signal for orchestration-adapter

**File:** `packages/orchestration-adapter/package.json:8`

**Issue:** Correct fix for the immediate gate failure — the package is currently
types-only (`src/index.ts` is one re-export line, `src/types.ts` is 39 lines of type
declarations), so there is genuinely nothing to test. But the flag is permanent: the
first runtime function added to this package will ship with a green, empty suite and
no signal.

**Fix:** keep the flag, and leave the reason and the exit condition in the manifest
next to it so it is removed rather than inherited:

```json
"test": "vitest run --passWithNoTests",
"//test": "types-only package (05 gate fix); drop --passWithNoTests when src/ gains runtime logic"
```

---

_Reviewed: 2026-09-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
