---
phase: 05-pixel-office-renderer
reviewed: 2026-09-23T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - apps/web/src/App.test.tsx
  - apps/web/src/App.tsx
  - apps/worker/src/poll-loop.test.ts
  - packages/pixel-office/src/engine/renderer.test.ts
  - packages/pixel-office/src/engine/renderer.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.ts
  - packages/pixel-office/src/layout/office-layout.json
  - packages/pixel-office/src/layout/officeLayout.ts
  - packages/pixel-office/src/types.ts
  - scripts/verify-pixel-office-live.mjs
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-23T00:00:00Z
**Depth:** standard (incremental, diff base `c24b401`)
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Incremental review of the gap-closure work since `c24b401`: 05-36 (WR-02, footer backdrop) and 05-37 (WR-07 record-identity attribution, WR-08 aisle-slot reservation), plus the renderer changes for WR-01/WR-05/CR-01, the `homeNearRow` validator for WR-04, and the widened `interaction.colOffsets` for WR-03.

Both headline fixes are correct at the site they were applied. Verified by tracing, not by trusting the comments:

- **WR-08** (`handoff-choreography.ts:112`) genuinely closes the hole. Every walk destination in the system is now reserved — a handoff sender's slot by the record's `target` for the record's whole lifetime, and a sender walking home by the always-reserved `seatCol/seatRow`. The new test at `handoff-choreography.test.ts:960` goes red on a revert (re-adding the `phase !== "RETURNING_TO_DESK"` exemption hands the second sender the tile the first is still standing on).
- **WR-07** (`showsLineOf`, `clearLine`, `Character.bubbleTextTaskId`) is sound on the FSM's own read and clear paths. `bubbleTextTaskId` is `undefined` on a fresh `createCharacter` and `null` after `clearLine`, and `AgentHandoffRequestedPayload.taskId` is a required `z.string()`, so the identity comparison cannot false-match. The colliding-title tests are non-vacuous — they assert the byte-identical collision before relying on it.
- **WR-02** (`App.test.tsx:46-52`) is a real equality on the shipped declarations; it does go red for "no backdrop at all", which is what the previous guard could not do.
- Both suites pass (`pixel-office` 196/196, `web` 24/24).

What the fixes did **not** reach:

- WR-07's identity rule stops at the FSM boundary. The renderer's per-frame record and `getDialogueBox` still key on the bubble **text**, so the exact collision WR-07 exists for still mis-attributes a drawn rect (WR-01 below).
- WR-05's "the tail always belongs to its box" invariant holds on X for below/above and does not hold on Y for right/left; the new test explicitly carves the uncovered case out (WR-02 below).
- The WR-02 guards pin `footerBackground === WALL_COLOR` against the same constant the app uses, so they assert identity rather than the contrast property they exist to protect (WR-04 below), and the new "overflow viewport" test renders nothing at that viewport (WR-05 below).
- Making the footer opaque bought contrast at the cost of an opaque band over the canvas, which on a sub-minimum viewport can cover a state glyph — the one thing `renderScene`'s pass-3 ordering exists to prevent (WR-03 below).

No Critical findings: I could not construct a crash, data-loss or security path in the changed code, and I am not inflating a WARNING to reach a number.

## Warnings

### WR-01: `getDialogueBox` still attributes by bubble text — WR-07's identity fix stops short of the renderer

**File:** `packages/pixel-office/src/engine/renderer.ts:485-488`, `packages/pixel-office/src/engine/renderer.ts:570`, `packages/pixel-office/src/handoff/handoff-choreography.ts:438`

**Issue:** 05-37 replaced text-equality attribution with `Character.bubbleTextTaskId` everywhere inside the FSM, but the frame record still stamps `text: l.ch.bubbleText ?? ""` and `getDialogueBox(agentId, text)` still matches on that string. `getActiveHandoffs` therefore uses the stamp for `speakerId` and the **text** for `box`, so the freshness guard is defeated by exactly the collision WR-07 was raised about: two successive records from the *same* speaker whose titles cap to the same 12 code points (`handoff-choreography.test.ts:1353-1354` constructs precisely that pair). In that case the new record is handed the previous record's rect, contradicting the contract stated at `handoff-choreography.ts:390-391` ("null also when no rendered frame has drawn this line yet, **or drew a different one**"). The CR-01 test at `handoff-choreography.test.ts:1271` only exercises the non-colliding case ("A different title entirely"), so nothing catches this.

**Fix:** carry the same stamp the FSM writes into the frame record and key the lookup on it.

```ts
// renderer.ts
let framePlacements: Array<DialoguePlacement & { speakerId: string; taskId: string | null }> = [];
// ...in renderScene:
framePlacements.push({ speakerId: l.ch.id, taskId: l.ch.bubbleTextTaskId ?? null, ...placement });

export function getDialogueBox(agentId: string, taskId: string): DialogueRect | undefined {
  const p = framePlacements.find((f) => f.speakerId === agentId && f.taskId === taskId);
  return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : undefined;
}

// handoff-choreography.ts getActiveHandoffs():
box: (speakerId === null ? undefined : getDialogueBox(speakerId, record.taskId)) ?? null,
```

This also deletes the `speakerText` local, which exists only to feed the text lookup.

### WR-02: the side tail's Y is not clamped with its box, so `tailFor`'s stated invariant does not hold for `right`/`left`

**File:** `packages/pixel-office/src/engine/renderer.ts:303`, `packages/pixel-office/src/engine/renderer.ts:317-328`, `packages/pixel-office/src/engine/renderer.ts:373-375`

**Issue:** `tailFor` is documented as "one function and one call per box, so a candidate's tail and the returned winner's tail can never disagree about where the box ended up". That holds on X for `below`/`above` via `tailXIn`, but the `right`/`left` branches use `sideY` (line 303), which is derived from `speaker.headTop` and is *independent* of the returned `y`. The winner's `y` is now clamped unconditionally (line 374), so whenever the clamp moves a winning side candidate vertically, the tail is painted at `sideY` outside the box's own vertical span — the detached 1-px stub WR-05 set out to remove, in the same function that claims to have removed it.

Reachability: `speaker.headTop < floor.top` for any speaker within about a tile of the top interior row (a row-1 character's `headTop` is roughly `offsetY - 5 * zoom` while `floor.top` is `offsetY + 16 * zoom`), which invalidates both side candidates and forces the clamp if one wins the no-valid-candidate fallback. The shipped layout keeps characters on rows 4/6/8, so this is latent rather than live — but the new test at `renderer.test.ts:576-582` explicitly excludes side tails from the containment assertion ("the side tails span the gap … so they are outside by construction"), which is true of X and silently also waives Y. So the fix and its guard have the same blind spot.

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

### WR-03: the opaque footer can cover a state glyph on a sub-minimum viewport, defeating D-03/OFFICE-03

**File:** `apps/web/src/App.tsx:124`, `apps/web/src/App.tsx:178-193`

**Issue:** the footer went from transparent to an opaque `WALL_COLOR` band roughly 19 CSS px tall, pinned with `position: fixed; bottom: 0`. The scroll container at line 124 has `overflow: auto` and no bottom padding, so on any viewport below the `MIN_DISPLAY_SCALE` canvas floor (960x528) there is **no** scroll position that brings the bottom ~19 px of office content clear of the footer — including the rows characters actually stand on. `renderScene` goes out of its way (pass 3, `renderer.ts:574-577`) to guarantee "a transient handoff line can never hide a blocked/waiting/failed signal"; an opaque DOM band over the canvas defeats that guarantee for whatever rows land underneath it. The 05-36 comment at `App.tsx:171-175` correctly identifies that the footer *does* sit over the floor at these viewports, then treats that as a contrast problem only.

The live proof now asserts the footer's backdrop at 800x480 (`verify-pixel-office-live.mjs:916-921) but asserts nothing about what that backdrop covers; TRUTH 4's glyph-ownership check runs only at 1280x720.

**Fix:** reserve the footer's height in the scrolling container so office content can always be scrolled clear of it.

```tsx
const FOOTER_HEIGHT_PX = 19; // 4px pad + 11px line + 4px pad
<div style={{ position: "fixed", inset: 0, display: "flex", overflow: "auto",
              background: WALL_COLOR, paddingBottom: FOOTER_HEIGHT_PX }}>
```

(or make the footer a sticky/flow element inside the wrapper rather than a fixed overlay).

### WR-04: the WR-02 guards assert identity with a moving target, not the contrast property they exist for

**File:** `apps/web/src/App.test.tsx:113-115`, `apps/web/src/App.test.tsx:137`, `scripts/verify-pixel-office-live.mjs:916-921`

**Issue:** every guard added for WR-02 asserts `footer background === WALL_COLOR`, where `WALL_COLOR` is imported (test) or regex-read from `constants.ts` (live script) — i.e. from the *same* source the app renders from. Change `WALL_COLOR` and both sides of the equality move together: the assertions stay green while the 6.74:1 ratio the comment cites (`App.tsx:175`) silently drops below AA. The text colour `#cccccc` (`App.tsx:187`) is not asserted anywhere at all, so changing it alone also passes. This is the same shape as the original WR-02 defect — a guard that is green in the broken state — just one level up.

I confirmed the current pair is fine: `#cccccc` on `#3A3A5C` computes to 6.74:1, matching the comment. The gap is that nothing holds it there.

**Fix:** assert the ratio, computed from the two literals the app actually uses.

```ts
// App.tsx
export const FOOTER_TEXT_COLOR = "#cccccc";

// App.test.tsx
const luminance = (hex: string): number => { /* sRGB relative luminance */ };
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
it("keeps the credit above WCAG AA on its own backdrop", () => {
  expect(ratio(FOOTER_TEXT_COLOR, WALL_COLOR)).toBeGreaterThanOrEqual(4.5);
});
```

Keep the existing equality assertion — it catches "no backdrop"; the ratio assertion catches "wrong backdrop".

### WR-05: the new "overflow viewport" test exercises no overflow and duplicates the assertion above it

**File:** `apps/web/src/App.test.tsx:125-138`

**Issue:** the test is named "keeps the credit legible where the canvas overflows the viewport and scrolls under it", but `markup` is a single `renderToStaticMarkup` produced once at module scope (line 24) with no window, no viewport and no layout. Its four assertions are: one arithmetic check of `displayScaleFor(800, 480)`, two arithmetic comparisons between exported constants, and a verbatim repeat of the assertion three lines above it (line 114). Nothing renders at 800x480 and nothing scrolls, so the test would stay green through any regression in the footer's actual behaviour at an overflowing viewport that is not a change to the static style string — which the previous test already covers.

The cost is not the wasted assertion; it is that a reader or a fixer reads the name and concludes CI covers the overflow case, when the only real coverage is in the manually-run `verify-pixel-office-live.mjs`.

**Fix:** either rename it to what it proves and drop the duplicated backdrop assertion:

```ts
it("floors the canvas above an 800x480 viewport on both axes, so the office overflows and scrolls", () => { ... });
```

or make it a real check — `vitest` with `environment: "jsdom"`, `window.innerWidth/innerHeight` set to 800x480, render with `@testing-library/react`, and assert `footer.getBoundingClientRect()` against the canvas box.

## Info

### IN-01: unreachable `?? ""` that can mint a matchable empty-text placement

**File:** `packages/pixel-office/src/engine/renderer.ts:570`

**Issue:** `drawDialogue` returns `null` for any falsy `bubbleText` (line 411), so `l.ch.bubbleText ?? ""` can never produce `""` today. If that guard ever changes, the fallback silently records a placement keyed on `""` that `getDialogueBox(id, "")` would match.

**Fix:** superseded by WR-01's stamp change; otherwise use `text: l.ch.bubbleText!`.

### IN-02: a dead record's aisle slot stays reserved for up to one tick

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:108-113`

**Issue:** the reservation loop does not check `senderIsCurrent`, so a record whose sender went OFFLINE or was re-seated keeps blocking its target (and its Chebyshev-1 neighbours) until the next `checkHandoffArrivals`. `handleHandoffEvent` runs off the host's WS handler, not off the loop — `handoff-choreography.test.ts:790` ("OFFLINE, re-seat and completion with no step between") proves that window is real — so a request arriving in it is denied a slot nobody is standing on. Not a regression (this predates WR-08), but WR-08's whole-lifetime reservation widens it.

**Fix:** `if (record.fromChar !== fromChar && senderIsCurrent(record)) taken.push(record.target);`

### IN-03: the null-slot fallback target is reserved as though it were an aisle slot

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:232`

**Issue:** when `interactionTileFor` returns null, the record's `target` becomes the sender's *current* tile, and WR-08 now reserves that for the record's whole lifetime. A sender standing near the aisle can therefore block a genuine slot it never occupied as a handoff position.

**Fix:** flag the fallback on the record (`targetIsFallback: true`) and skip those in the reservation loop.

### IN-04: nothing bounds how far a waiting sender may stand from its receiver

**File:** `packages/pixel-office/src/layout/office-layout.json:39`

**Issue:** `colOffsets` widened to `[1, -1, 3, -3, 5, -5]` for WR-03. A 4th/5th concurrent sender now waits five tiles from the receiver, which is where the pair-midpoint bubble centring (`renderer.ts:297`) starts dragging the box away from the speaker and the WR-05 tail clamp starts degrading. The WR-03 test asserts "3+ slots per home" but no test pins an upper bound on sender-receiver distance or asserts the bubble still reads as connecting the pair at the widest offset.

**Fix:** add a sweep assertion that the chosen box still spans (or is within tail reach of) both participants at the `±5` slots.

### IN-05: `ReadonlySet` cast away at the `isWalkable` boundary

**File:** `packages/pixel-office/src/handoff/handoff-choreography.ts:116`

**Issue:** `FURNITURE_BLOCKED_TILES as Set<string>` discards the `ReadonlySet` guarantee on shared module-level layout state; `isWalkable` is free to mutate it as far as the type system is concerned.

**Fix:** widen `isWalkable`'s parameter to `ReadonlySet<string>` and drop the cast.

### IN-06: `readColorConst`'s regex is unanchored

**File:** `scripts/verify-pixel-office-live.mjs:178-182`

**Issue:** `new RegExp(`${name}\\s*=\\s*"(#[0-9a-fA-F]{6})"`)` matches any identifier *ending* in the requested name. It is correct against today's `constants.ts`, but a future `FLOOR_WALL_COLOR` declared above `WALL_COLOR` would be picked up instead, and the live proof would then assert the footer against the wrong colour while looking like it read the engine's own source.

**Fix:** anchor the declaration: `new RegExp(`(?:^|\\s)(?:export\\s+)?const\\s+${name}\\s*=\\s*"(#[0-9a-fA-F]{6})"`, "m")`.

### IN-07: the disconnected banner kept the translucent backdrop the footer fix removed

**File:** `apps/web/src/App.tsx:134-151`

**Issue:** the sibling fixed overlay still uses `background: "rgba(153, 0, 0, 0.85)"`, i.e. its contrast still depends on what is behind it — the pattern 05-36 set out to eliminate. I computed the blend: white on `rgba(153,0,0,0.85)` over the worse MetroCity plank is about 8.7:1, so it clears AA comfortably today. This is consistency and future-proofing, not a live defect.

**Fix:** make it opaque (`background: "#990000"`) so the same rule holds for both fixed overlays, and it can then be covered by WR-04's ratio assertion.

## Reviewed, no findings

- `apps/worker/src/poll-loop.test.ts:35` — the 5s→3s `waitFor` default is correct: test 1's worst case is now ~6.4s inside a 10s `it()` timeout (it was ~10.4s, i.e. it hit the opaque vitest timeout instead of the intended assertion shortfall). 3s is still 75 poll intervals at `intervalMs: 40`.
- `packages/pixel-office/src/layout/officeLayout.ts:99-121` — `homeNearRow` is evaluated after `SEATS`/`STANDING_SPOTS` are initialised (function declaration hoisted, first call inside the `INTERACTION` IIFE at line 115), so the WR-04 validator cannot TDZ. Its test pins both the accepted aisle row and the four rejected ones.
- `packages/pixel-office/src/types.ts:158-165` and `packages/pixel-office/src/index.ts:211-219` — the `bubbleTextTaskId` field and the `_resetFrameForTests` addition to `_resetForTests` are correct and minimal; no stale caller of the old 1-arg `getDialogueBox` remains anywhere in the repo.
- `packages/pixel-office/src/engine/renderer.ts:357-375` — the `beats` comparator with `valid` promoted to the first key is a total strict order, and `let best = candidates[0]; for (…) if (beats(c, best)) best = c;` is a correct argmin with earlier-index tie-break. The unconditional floor clamp is provably a no-op for any valid winner (validity already implies `x ∈ [left, right-w]`, `y ∈ [top, bottom-h]`).

---

_Reviewed: 2026-09-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
