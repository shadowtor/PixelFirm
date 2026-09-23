---
phase: 05-pixel-office-renderer
reviewed: 2026-09-23T18:10:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - packages/pixel-office/src/constants.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/handoff/dialogue-templates.test.ts
  - packages/pixel-office/src/handoff/dialogue-templates.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/sprites/bubble-waiting.json
  - packages/pixel-office/src/sprites/bubbleSprites.test.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 1
  warning: 5
  info: 7
  total: 13
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-23T18:10:00Z
**Depth:** standard (incremental, diff base `30c9846`)
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Incremental review of gap-closure plans 05-38 (`BUBBLE_ICON_GAP_PX` 1→3, `CHARACTER_SITTING_OFFSET_PX` 6→10), 05-39 (`bubble-waiting.json` repaint) and 05-40 (verb-led nullable-title dialogue, plus review WR-01). Everything earlier in phase 05 was reviewed in the previous pass and is not re-litigated.

**The prior WR-01 is genuinely closed.** Verified by tracing, not by trusting the docblock: `Character.bubbleTextTaskId` has exactly one writer (`handoff-choreography.ts:284`, `:335`) and one clearer (`:164`); `renderScene` now stamps that value into `framePlacements` (`renderer.ts:577`); `getDialogueBox` keys on it with a `taskId: string` parameter, so a placement stamped `null` can never be matched by any caller (`renderer.ts:492-495`); and `getActiveHandoffs` passes `record.taskId` — the same identity `showsLineOf` reads — so speaker attribution and rect attribution cannot disagree (`handoff-choreography.ts:443`). The new colliding-line test at `handoff-choreography.test.ts:1456` is non-vacuous (it asserts the two lines are byte-identical before relying on it, at line 1475). The prior IN-01 (`?? ""` minting a matchable empty-text placement) is resolved by `?? null`.

**The 05-39 repaint is what it claims.** I re-decoded both revisions of `bubble-waiting.json`: the opacity mask is byte-identical (`pixels.map(c => c ? 'X' : '.')` matches exactly), only palette key `"3"` and two rows of `"2"`→`"3"` changed. Both halves of the repaint are guarded non-vacuously — reverting the palette alone drops glass/sand contrast to 2.71 (< the `>= 3` threshold), and reverting the two pixel rows alone gives 14 light cells against 19 sand, failing the `>= 3 * dark` assertion.

**The 05-38 constants carry real revert guards.** `renderer.test.ts:262` pins `BUBBLE_ICON_GAP_PX === 3`, `:1279` pins `CHARACTER_SITTING_OFFSET_PX === 10`, and the derived composite geometry (`:365-371`) moves with them. I measured the composite: a seated agent keeps 13 visible body rows (y 53..65), so the `>= 10` head-survival floor is met with 3 rows of slack and the head genuinely survives the desk.

**No network or LLM call surface** was introduced on the dialogue path. `dialogue-templates.ts` imports nothing and is a pure template map.

The live harness's refusal of an in-repo `PIXEL_OFFICE_SHOTS` path (`verify-pixel-office-live.mjs:199-201`) is the intentional 05-21 guard and is **not** reported as a defect.

What the plans did **not** reach:

- The "a task id is not a title" rule was applied at the two canvas call sites but **not** at the host read path, where `ActiveHandoff.fullTitle` still hands a caller the raw task id as a title (WR-01).
- The null branch guards `undefined` only. An empty or whitespace title — which `z.string()` accepts and `App.tsx:85` registers unguarded — takes the *non-null* branch and paints a malformed sentence (CR-01).
- Three findings from the previous pass were not addressed and still hold: WR-02 (side-tail Y), WR-03 (opaque footer over a glyph), IN-02 (dead record's slot reserved for a tick). They are carried forward below with their prior reasoning re-verified against current source.

`pnpm --filter pixel-office test` is green (207/207) — which is why the test-quality findings below matter: three of the guards added or rewritten this round cannot go red for the thing they name.

## Critical Issues

### CR-01: an empty or whitespace title takes the non-null branch and paints a malformed sentence

**File:** `packages/pixel-office/src/handoff/dialogue-templates.ts:14-20`, `packages/pixel-office/src/handoff/handoff-choreography.ts:279`, `packages/pixel-office/src/handoff/handoff-choreography.ts:319`

**Issue:** both call sites resolve the title with `getTaskTitle(...) ?? null`. `??` only fires on `null`/`undefined`, so a *registered but empty* title is passed through as a present title and the templates take their `taskTitle !== null` branch. Reproduced against the shipped module:

```
resolveHandoffDialogue("requested", "",    "Ada") -> "hands  to Ada"      // double space, no object
resolveHandoffDialogue("accepted",  "",    "Ada") -> "Ada accepts "        // trailing space, sentence truncated
resolveHandoffDialogue("requested", "   ", "Ada") -> "hands     to Ada"
```

`"Ada accepts "` is exactly the class of frame 05-40 was chartered to eliminate ("a complete sentence — never a placeholder"), and it is *worse* than the id it replaced because the reader gets no object at all.

Reachability is through the real pipeline, not a hypothetical: `TaskCreatedPayload` is `z.object({ title: z.string() })` (`packages/event-schema/src/payloads/index.ts:7`) with no `.min(1)`, so `POST /events` accepts `title: ""` from any worker credential; `apps/web/src/App.tsx:85` then calls `registerTaskTitle(event.taskId, event.payload.title)` **unguarded**. The sibling registration site three lines earlier (`App.tsx:70`) writes `if (task.title) registerTaskTitle(...)` — the authors already knew empty titles occur and guarded only one of the two entry points. `POST /events` is a trust boundary; this is missing input validation at it.

**Fix:** treat an empty/blank title as "no title known" inside the resolver, so every present and future caller is covered by one guard rather than each call site repeating it.

```ts
export function resolveHandoffDialogue(
  kind: "requested" | "accepted",
  taskTitle: string | null,
  toAgentName: string,
): string {
  // Blank is "no title known": `??` only catches undefined, and a task.created
  // carrying `title: ""` validates against z.string() today.
  const title = taskTitle?.trim() ? capForDialogue(taskTitle.trim(), MAX_DIALOGUE_TITLE_CHARS) : null;
  return DIALOGUE_TEMPLATES[kind](title, capForDialogue(toAgentName, MAX_DIALOGUE_NAME_CHARS));
}
```

Add the case to `dialogue-templates.test.ts`'s `everyLine` sweep (`""` and `"   "` alongside `null`), which currently covers only the two-valued null/present space.

## Warnings

### WR-01: `getActiveHandoffs().fullTitle` still paints a task id as a title — 05-40's rule stops at the canvas boundary

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:434`, docblock at `:377-383`

**Issue:** 05-40 replaced `getTaskTitle(x) ?? x` with `?? null` at both *canvas* call sites, but the host read path still reads:

```ts
fullTitle: getTaskTitle(record.taskId) ?? record.taskId,
```

`ActiveHandoff.fullTitle` is typed non-nullable `string`, so a host hover, click target or dashboard built on `getActiveHandoffs()` renders `task-9f3c1b7e-4a2d-11f0-9cbe-0242ac120002` in a field the docblock calls "the UNTRUNCATED title". The defect has been moved from the canvas to the public API, not removed. This is the same rule the phase's own guard describe asserts ("a task id is never painted as a title", `handoff-choreography.test.ts:1552`), applied to two of three sites.

The docblock is now false in two ways beyond the fallback: it says `fullTitle` is "the exact value the bubble interpolates" (the bubble now interpolates nothing when no title is known), and "caps it at 12 code points" (the cap is 14 since 05-40). The same stale `12` appears at `:150` in `showsLineOf`'s docblock, and `packages/pixel-office/src/index.ts:58-61` still documents "Missing entries fall back to the raw taskId at the call site (dialogue-templates.ts's callers)" — the behaviour 05-40 deleted.

Nothing consumes `getActiveHandoffs()` in this phase, which is why this is a WARNING and not a live defect; it is a contract that will be wrong the moment Phase 6 builds on it.

**Fix:**

```ts
export interface ActiveHandoff {
  taskId: string;
  /** The UNTRUNCATED registered title, or null when none is known — never the
   *  task id, which is not a title (05-40, G-05-1b). */
  fullTitle: string | null;
  // ...
}

// in getActiveHandoffs():
fullTitle: getTaskTitle(record.taskId) ?? null,
```

and correct the three stale docblocks (`:150`, `:379-381`, `index.ts:58-61`) — `12` → `MAX_DIALOGUE_TITLE_CHARS`, and drop the "the exact value the bubble interpolates" claim.

### WR-02 (carried from the previous pass, re-verified — unchanged): the side tail's Y is not clamped with its box

**File:** `packages/pixel-office/src/engine/renderer.ts:303`, `packages/pixel-office/src/engine/renderer.ts:317-328`, `packages/pixel-office/src/engine/renderer.ts:373-375`

**Issue:** `tailFor` is documented as "one function and one call per box, so a candidate's tail and the returned winner's tail can never disagree about where the box ended up". That holds on X for `below`/`above` via `tailXIn`, but the `right`/`left` branches use `sideY` (line 303), derived from `speaker.headTop` and *independent* of the returned `y`. The winner's `y` is clamped unconditionally (line 374), so whenever the clamp moves a winning side candidate vertically, the tail paints at `sideY` outside the box's own vertical span — the detached 1-px stub the clamp exists to remove.

Reachability is unchanged: `speaker.headTop < floor.top` for any speaker within about a tile of the top interior row, which invalidates both side candidates and forces the clamp if one wins the no-valid-candidate fallback. The shipped layout keeps characters on rows 4/6/8, so this is latent. The guard at `renderer.test.ts:583-587` still tests X only for `below`/`above` and explicitly waives the side kinds, so the fix and its guard retain the same blind spot. 05-38's raised `CHARACTER_SITTING_OFFSET_PX` moves `headTop` 4 px further down for seated speakers, which shrinks (does not close) the window.

**Fix:** derive the side tail's Y from the box that is actually returned, and widen the test to cover Y for all four kinds.

```ts
const tailFor = (kind: DialogueCandidateKind, x: number, y: number): DialogueRect => {
  // Clamped into the box's own vertical span, for the same reason tailXIn
  // clamps the horizontal one.
  const tailY = Math.min(Math.max(sideY, y), y + h - zoom);
  switch (kind) {
    // ...below/above unchanged...
    case "right":
      return { x: speaker.right, y: tailY, w: Math.max(0, x - speaker.right), h: zoom };
    case "left":
      return { x: x + w, y: tailY, w: Math.max(0, speaker.left - (x + w)), h: zoom };
  }
};
```

### WR-03 (carried from the previous pass, re-verified — unchanged): the opaque footer can cover a state glyph on a sub-minimum viewport

**File:** `apps/web/src/App.tsx:124`, `apps/web/src/App.tsx:178-193`

**Issue:** the footer is an opaque `WALL_COLOR` band roughly 19 CSS px tall, pinned `position: fixed; bottom: 0`. The scroll container at line 124 has `overflow: auto` and no bottom padding, so on any viewport below the `MIN_DISPLAY_SCALE` canvas floor (960x528) there is **no** scroll position that brings the bottom ~19 px of office content clear of the footer — including rows characters stand on. `renderScene`'s pass 3 (`renderer.ts:578-584`) exists to guarantee "a transient handoff line can never hide a blocked/waiting/failed signal"; an opaque DOM band over the canvas defeats that for whatever rows land under it. `App.tsx:171-175` correctly identifies that the footer *does* sit over the floor at these viewports, then treats it as a contrast problem only.

The live proof asserts the footer's backdrop at 800x480 (`verify-pixel-office-live.mjs:914-924`) but asserts nothing about what that backdrop covers; TRUTH 4's glyph-ownership check runs only at 1280x720. `App.tsx` was not touched by 05-38/39/40, so this is unchanged since it was raised.

**Fix:** reserve the footer's height in the scrolling container so office content can always be scrolled clear of it.

```tsx
const FOOTER_HEIGHT_PX = 19; // 4px pad + 11px line + 4px pad
<div style={{ position: "fixed", inset: 0, display: "flex", overflow: "auto",
              background: WALL_COLOR, paddingBottom: FOOTER_HEIGHT_PX }}>
```

(or make the footer a sticky/flow element inside the wrapper rather than a fixed overlay).

### WR-04: the 40-scene sweep's non-vacuity assertion pins the *narrower* line, so the worst case it claims to score is unguarded

**File:** `packages/pixel-office/src/engine/renderer.test.ts:540-548`, `packages/pixel-office/src/engine/renderer.test.ts:613-615`

**Issue:** 05-40 corrected the comment to admit the requested line (34 cps) overtook the accepted one (33), but left the mechanics unchanged. `WIDEST_LINE_CHARS` is still `MAX_DIALOGUE_NAME_CHARS + " accepts ".length + MAX_DIALOGUE_TITLE_CHARS` = 33, and the only length assertion in the sweep is on the accepted leg:

```ts
// Non-vacuity: this really is the widest line the caps allow, so the
// scored boxes are the worst case (review WR-01).
expect(Array.from(receiver.bubbleText!).length, ...).toBe(WIDEST_LINE_CHARS);
```

Both the identifier and the comment are now false — `WIDEST_LINE_CHARS` names the second-widest line. The requested leg *does* render 34 cps in all 40 scenes (`seatReal(20, WIDE_NAME)` names every agent with 10 chars, `requestAndWait(..., WIDE_TITLE)` registers 14), but `check()` at `:554` asserts nothing about its length. So if a future edit shortens the requested template, every scene silently scores a narrower box, the sweep stays green, and the "worst case" claim the whole 40-scene guard rests on quietly stops holding. That is precisely a guard that cannot go red for the property it names.

**Fix:** derive the budget from the module and pin both legs.

```ts
const { MAX_DIALOGUE_LINE_CHARS } = await import("../handoff/dialogue-templates.js");
// ...in check(), for the requested leg:
expect(Array.from(speaker.bubbleText!).length, `${where}: not the widest line the caps allow`)
  .toBe(MAX_DIALOGUE_LINE_CHARS);
```

and rename `WIDEST_LINE_CHARS` → `WIDEST_ACCEPTED_LINE_CHARS`.

### WR-05: TRUTH 4's two-sided head-gap window is satisfied by an asset artefact, and its comment blames the wrong term

**File:** `scripts/verify-pixel-office-live.mjs:1303-1312`, `scripts/verify-pixel-office-live.mjs:1285`

**Issue:** the new bound is `headGap >= BUBBLE_ICON_GAP_PX && headGap <= BUBBLE_ICON_GAP_PX + 1`, with the comment "the +1 ceiling is the device-pixel rounding slack". Device-pixel rounding moves the measurement in the *opposite* direction from what that says. Working it through:

- `blockedMaxY = blockedMaxPxY / scale`, and `headGap = headTop - (blockedMaxY + 1)` (line 1285).
- `BLOCKED_COLORS` resolves to `['#d62828']` alone — `#000000` is in `NOT_DISTINCTIVE` because character sprites paint it. In `bubble-blocked.json` the last row carrying `#d62828` is **row 10**, while `lastOpaqueRow` (what `resolveBubbleY` anchors on) is **row 11**. So the scan measures one glyph row higher than the renderer anchored: **+1**.
- The last device row of an unzoomed row `b` is `b*scale + (scale-1)`, so `blockedMaxY = b + (scale-1)/scale`: **−(scale−1)/scale**.

Net: `headGap = BUBBLE_ICON_GAP_PX + 1/scale`, i.e. **3.25** at the shipped scale 4 — inside `[3, 4]` only because the +1 asset artefact outweighs the −0.75 rounding. This has two consequences:

1. Repainting `bubble-blocked.json`'s bottom outline row in a distinctive colour (an obvious future tweak, and exactly the kind of repaint 05-39 just did to `bubble-waiting.json`) makes `headGap = 2.25`, failing the lower bound **on a correct renderer**.
2. At display scale 1 the measurement is exactly `BUBBLE_ICON_GAP_PX + 1`, sitting on the ceiling with zero margin.

The 05-38 summary already records that this bound cannot catch a constant revert (both sides read the same source). What it does not record is that the bound it *can* check is calibrated by coincidence.

**Fix:** measure against what was actually scanned, and state the term.

```js
// The scan only sees BLOCKED_COLORS, so it misses the glyph's non-distinctive
// bottom outline row(s); resolveBubbleY anchors on lastOpaqueRow. Compare
// like for like rather than absorbing the difference in a magic +1.
const GLYPH_INK_TAIL_ROWS = 1; // bubble-blocked.json rows 11..: outline only
const measuredGap = headTop - (bandScan.blockedMaxY + 1) - GLYPH_INK_TAIL_ROWS + (scale - 1) / scale;
assert(Math.abs(measuredGap - BUBBLE_ICON_GAP_PX) < 0.5, ...);
```

(or derive `GLYPH_INK_TAIL_ROWS` from `bubble-blocked.json` the way `distinctiveBubbleColors` already derives the palette, so no literal is needed at all).

## Info

### IN-01: a tautological assertion in the new WR-01 collision test

**File:** `packages/pixel-office/src/handoff/handoff-choreography.test.ts:1468-1469`

**Issue:** the test's stated setup step ("asserted, never assumed") is:

```ts
expect(resolveHandoffDialogue("requested", TITLE_X, toName)).toBe(
  resolveHandoffDialogue("requested", TITLE_X, toName),
);
```

Both sides are the same call with the same arguments, so it can never fail. The idiom was copied from `:1391`, where the two sides use `TITLE_X` and `TITLE_Y` and the assertion is meaningful. The byte-identity this test actually depends on *is* asserted two lines later (`expect(a.bubbleText).toBe(lineBefore)`, `:1475`), so coverage is fine — but a reader auditing this test is told a check exists that does not.

**Fix:** delete lines 1468-1469; `:1475` already carries the claim.

### IN-02 (carried from the previous pass, re-verified — unchanged): a dead record's aisle slot stays reserved for up to one tick

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:108-113`

**Issue:** the reservation loop does not check `senderIsCurrent`, so a record whose sender went OFFLINE or was re-seated keeps blocking its target (and its Chebyshev-1 neighbours) until the next `checkHandoffArrivals`. `handleHandoffEvent` runs off the host's WS handler, not off the loop, so a request arriving in that window is denied a slot nobody is standing on.

**Fix:** `if (record.fromChar !== fromChar && senderIsCurrent(record)) taken.push(record.target);`

### IN-03: `MAX_DIALOGUE_LINE_CHARS` reads like a cap but is enforced nowhere

**File:** `packages/pixel-office/src/handoff/dialogue-templates.ts:33`

**Issue:** `MAX_DIALOGUE_TITLE_CHARS` and `MAX_DIALOGUE_NAME_CHARS` are both applied by `capForDialogue`. `MAX_DIALOGUE_LINE_CHARS`, declared beside them with the same naming shape, is referenced only by `dialogue-templates.test.ts` — never by any production code. It is a declared budget, not a cap; a reader reaching for it as an enforcement point will not find one.

**Fix:** rename to `DIALOGUE_LINE_BUDGET_CHARS` and extend the docblock at `:22-30` to say it is asserted by the test suite rather than enforced at runtime. (Enforcing it would be wrong — silently truncating a composed line mid-word is worse than the budget test going red.)

### IN-04: `TAIL_REACH_PX` still carries `GLYPH_ROWS` as a literal `13`

**File:** `scripts/verify-pixel-office-live.mjs:1117`

**Issue:** 05-38 partially closed the previous pass's IN-05 by deriving two of the four terms: `13 + BUBBLE_ICON_GAP_PX + DIALOGUE_TAIL_PX + 2`. The `13` is `GLYPH_ROWS`, which `renderer.ts:245` computes as `Math.max(...Object.values(BUBBLE_SPRITES).map(s => s.length))` precisely so a taller glyph moves it. The harness pins it, so a redrawn glyph silently invalidates the reach bound — the exact drift the derivation was introduced to stop.

**Fix:** the harness already reads sprite JSON; derive it the same way.

```js
const GLYPH_ROWS = Math.max(
  ...["bubble-blocked.json", "bubble-handoff-task.json", "bubble-waiting.json", /* ... */]
    .map((f) => JSON.parse(readFileSync(path.join(SPRITE_DIR, f), "utf8")).pixels.length),
);
const TAIL_REACH_PX = GLYPH_ROWS + BUBBLE_ICON_GAP_PX + DIALOGUE_TAIL_PX + 2;
```

### IN-05: the "mechanical proof" of zero network surface is a single-file substring grep

**File:** `packages/pixel-office/src/handoff/dialogue-templates.test.ts:99-115`

**Issue:** the describe is titled "zero network/LLM call surface (mechanical proof)" and greps two source files for `fetch(`, `anthropic`, `openai`, `claude-agent-sdk`, `http`. For `dialogue-templates.ts` that is a real proof — the module imports nothing. For `handoff-choreography.ts` it is not: that file imports from five modules (`../index.js`, `../engine/renderer.js`, `../engine/characters.js`, `../layout/*`, `./dialogue-templates.js`), and the grep says nothing about any of them. HANDOFF-02's claim is about the dialogue path as a whole.

**Fix:** either narrow the describe's title to "this module declares no network call", or make it transitive — walk the relative-import graph from `handoff-choreography.ts` and grep every reachable file.

### IN-06: the "legible on the MetroCity floor" guard's `mainFill` term is dead code

**File:** `packages/pixel-office/src/sprites/bubbleSprites.test.ts:169-179`

**Issue:** the assertion is `Math.max(contrast(outline, bg), contrast(mainFill, bg)) >= 3`. I computed it over the shipped assets: all four `floorTiles` entries have the identical mean `#8d5f24`, and `contrast(#000000, #8d5f24) = 3.79`, so the outline term alone satisfies the `max()` unconditionally — for every glyph, on every tile, whatever the fill is. The `mainFill` half can never influence the result, and the four-iteration loop runs the same assertion four times.

This matters now because 05-39's summary reasons about this guard as though it protected the repaint ("the black outline term dominates its `max()` … the rule was not weakened"): the rule never constrained the fill at all, so the flip of `mainFill` from `#4361ee` to `#c8d4ff` was invisible to it either way. Not introduced by 05-39, but 05-39 is the first change it should have caught and did not.

**Fix:** assert the fill on its own terms, and de-duplicate the tile loop.

```ts
const FLOOR_MEANS = [...new Set(FLOOR_TILES.map(meanColor))];
for (const bg of FLOOR_MEANS) {
  expect(contrast(outline, bg), `${key} outline on ${bg}`).toBeGreaterThanOrEqual(3);
  expect(contrast(mainFill, bg), `${key} fill on ${bg}`).toBeGreaterThanOrEqual(3);
}
```

(Both hold today: `contrast(#c8d4ff, #8d5f24) = 3.77`. Note the old `#a9bcff` fill scored 2.98 — the 05-39 repaint fixed a real floor-legibility gap this guard could not see.)

### IN-07: the harness's `spriteBoxAt` is only "the looser of the two" above the speaker, and 05-38 widened the error

**File:** `scripts/verify-pixel-office-live.mjs:1118-1125`

**Issue:** the docblock says the un-offset sprite box is "the looser of the two" for a seated agent. That is true when the bubble is *above* the speaker (the stated top is `CHARACTER_SITTING_OFFSET_PX` higher than the real one, shrinking the measured `dy`) and false when it is *below*: the stated bottom is 10 px higher than the real one, so `dy` is overstated by 10 and the `<= TAIL_REACH_PX` check is stricter than intended. 05-38 grew that error from 6 px to 10 px while `TAIL_REACH_PX` grew only 18 → 20, i.e. the net margin shrank by 2 px. Not a live failure (the accepted-line case measures `dy = 2` against a 20 px reach), but the comment tells a maintainer the opposite of what happens in one of the two directions.

**Fix:** add the offset when the measured tile is a seat, as the harness already does for `firstRowSpriteBottom` at `:1277`, and correct the docblock.

## Reviewed, no findings

- `packages/pixel-office/src/constants.ts` — both raised values are consumed multiplicatively (`renderer.ts:176`, `:302`, `:519`) and no renderer change was required; the docblocks name the plan, the direction and the guard. Correct.
- `packages/pixel-office/src/sprites/bubble-waiting.json` — opacity mask byte-identical to the prior revision (verified by decoding both), palette-only plus two row reassignments, as claimed.
- `packages/pixel-office/src/handoff/dialogue-templates.ts:36-39` — `capForDialogue` has no off-by-one: `chars.length > max` → `slice(0, max - 1) + "…"` is exactly `max` code points, and a value of exactly `max` passes through uncut. Surrogate-safe via `Array.from`. (It degenerates for `max <= 1`, but both callers pass module constants of 14 and 10.)
- `packages/pixel-office/src/handoff/dialogue-templates.test.ts:72-81` — the budget test is genuinely non-vacuous: `everyLine()` enumerates all four kind × null/present combinations, derives the max (34, the requested-with-title line) rather than pinning which one wins, and `expect(cps).toBe(MAX_DIALOGUE_LINE_CHARS)` fails on slack as well as on overflow.
- `packages/pixel-office/src/sprites/bubbleSprites.test.ts:255-300` — the grayscale describe derives `waistRow` from the silhouette, `outline` from `edgeAndInterior` (verified to be a single colour `#000000` for this sprite), and both fills by luminance order with no hex literal. Each of the four cases goes red on one half of the repaint.
- `packages/pixel-office/src/engine/renderer.ts:492-495`, `:577` — the `taskId` stamp is sound end to end; `taskId: string` on the lookup makes a `null`-stamped placement unmatchable by construction.
- `packages/pixel-office/src/handoff/handoff-choreography.test.ts:1552-1611` — the "a task id is never painted as a title" describe is non-vacuous: `ID_PREFIX` is a 10-character prefix specifically so a regression to `?? taskId` is caught even though the cap would truncate the id, and each case pins the exact expected sentence.
- `scripts/verify-pixel-office-live.mjs:199-201` — the in-repo shots-path refusal is the intentional 05-21 guard, working as designed. Not a defect.

---

_Reviewed: 2026-09-23T18:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
