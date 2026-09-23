---
phase: 05-pixel-office-renderer
reviewed: 2026-09-23T20:55:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps/web/src/App.tsx
  - packages/pixel-office/src/handoff/dialogue-templates.test.ts
  - packages/pixel-office/src/handoff/dialogue-templates.ts
  - packages/pixel-office/src/handoff/handoff-choreography.test.ts
  - packages/pixel-office/src/handoff/handoff-choreography.ts
  - packages/pixel-office/src/index.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-09-23T20:55:00Z
**Depth:** standard (incremental, diff base `b0e30f0`)
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This is an incremental review of gap-closure plan 05-41: the `titleOrNull` helper (CR-01), the nullable `ActiveHandoff.fullTitle` (WR-01), the `App.tsx` live-title guard, the dead-record slot release (IN-02) and the removed tautology (IN-01). `pnpm --filter pixel-office test` passes (216/216) and `apps/web` typechecks clean.

**Prior findings resolved (checked against the source, not taken from the docblocks):**

- **CR-01 is closed.** `resolveHandoffDialogue` sends every title through `titleOrNull` (`dialogue-templates.ts:69`), so the rule sits in the shared function and not at each call site. Running the module directly, `""` and `"   "` now give `"hands off to Ada"` / `"Ada accepts the handoff"`, and `"  Fix login  "` gives `"hands Fix login to Ada"`. The `everyLine` sweep now includes `""` and `"   "`. The choreography test at `handoff-choreography.test.ts:1621` exercises the real registration path end to end.
- **WR-01 is closed.** `fullTitle` is typed `string | null` and computed with `titleOrNull(getTaskTitle(...))` (`handoff-choreography.ts:440`). Nothing outside the package reads `fullTitle`, so the type change breaks no caller. The three stale docblocks the previous pass named (`:150`, `:379-386`, `index.ts:57-61`) are fixed. One stale `12-code-point` was missed (IN-01 below).
- **IN-01 is closed.** The self-comparison is gone. Byte-identity is now asserted at `handoff-choreography.test.ts:1495` against `lineBefore`, which is task-x's line captured before the superseding request. That assertion can fail.
- **IN-02 is closed.** Adding `senderIsCurrent(record)` in `interactionTileFor` (`:114`) is correct. A record fails that check only when its `fromChar` object has left the `characters` map, so nothing is physically standing on its target. A re-seated sender is a *new* object, and the `getCharacters()` loop above already counts its real tile. The new test (`handoff-choreography.test.ts:1006`) catches the bug: without the guard, the dead record still reserves slot 0 and `c` is sent to a later slot.

**Findings from the previous pass outside this round's file scope, not re-reviewed and still open:** WR-02 (side-tail Y, `renderer.ts`), WR-04 (sweep pins the narrower line, `renderer.test.ts`), WR-05 (TRUTH 4 window, `verify-pixel-office-live.mjs`), IN-04, IN-06 and IN-07. WR-03 (footer), IN-03 and IN-05 are in files reviewed this round. They are unchanged and carried forward below.

**The main new concern:** 05-41 closed the blank-*title* hole only. The dialogue has two interpolated values, and the other one, the receiver's name, still paints a broken sentence when it is whitespace-only (WR-01).

## Warnings

### WR-01: a whitespace-only agent name still paints a broken sentence, the same bug CR-01 fixed for titles

**File:** `packages/pixel-office/src/handoff/dialogue-templates.ts:72`, `packages/pixel-office/src/index.ts:171`, `packages/pixel-office/src/handoff/handoff-choreography.ts:280`, `packages/pixel-office/src/handoff/handoff-choreography.ts:320`

**Issue:** `titleOrNull` cleans the title, but `toAgentName` goes straight into `capForDialogue(toAgentName, MAX_DIALOGUE_NAME_CHARS)` untouched. The name comes from `AgentOnlinePayload`, which is `z.object({ name: z.string(), ... })` (`packages/event-schema/src/payloads/index.ts:8`), through the reducer (`company-core/src/reducer.ts:70`) into `upsertCharacterFromAgent`. There, `if (name) ch.name = name` blocks `""` but lets `"   "` through. Both call sites then use `toChar.name ?? record.toAgentId`, and `??` does not catch a blank string, which is the same trap CR-01 described. Output from the shipped module:

```
resolveHandoffDialogue("requested", "Fix login", "   ") -> "hands Fix login to    "
resolveHandoffDialogue("accepted",  "Fix login", "   ") -> "    accepts Fix login"
resolveHandoffDialogue("requested", null,        "   ") -> "hands off to    "
```

It enters through the same trust boundary as CR-01 (`POST /events` accepts `name: "   "` from any worker credential). It is a WARNING rather than a BLOCKER only because `""`, the likelier bad value, is already stopped by `if (name)` and falls back to the agent id. The test sweep (`everyLine`) varies the title across blank values but never the name.

**Fix:** fix it once, where every name is written. Treat a blank name as absent so the existing `?? record.toAgentId` fallback applies:

```ts
// index.ts:171
const trimmedName = name?.trim();
if (trimmedName) ch.name = trimmedName;
```

Add `"   "` as a name to the `everyLine` sweep, with an assertion that the line contains the id fallback. (Normalising inside `resolveHandoffDialogue` would not work: it has no id to fall back to.)

### WR-02 (carried from the previous pass as WR-03, re-verified and unchanged): the opaque footer can cover a state glyph on a viewport below the minimum

**File:** `apps/web/src/App.tsx:127`, `apps/web/src/App.tsx:181-193`

**Issue:** `App.tsx` was edited this round, but the footer and the scroll wrapper were not touched. The footer is still an opaque `WALL_COLOR` band about 19 CSS px tall, pinned `position: fixed; bottom: 0`. The `overflow: auto` wrapper still has no bottom padding. So on any viewport smaller than the `MIN_DISPLAY_SCALE` canvas (960x528), no scroll position brings the bottom ~19 px of the office out from under the footer. That strip includes rows characters stand on, so it defeats the renderer's rule that a blocked/waiting/failed glyph is never hidden. The comment at `:170-180` concedes the footer sits over the floor at these sizes but treats it only as a contrast problem.

**Fix:** reserve the footer's height inside the scroll container:

```tsx
const FOOTER_HEIGHT_PX = 19; // 4px pad + 11px line + 4px pad
<div style={{ position: "fixed", inset: 0, display: "flex", overflow: "auto",
              background: WALL_COLOR, paddingBottom: FOOTER_HEIGHT_PX }}>
```

Alternatively, make the footer a normal-flow or sticky element inside the wrapper instead of a fixed overlay.

## Info

### IN-01: one stale "12-code-point" docblock survived the WR-01 cleanup

**File:** `packages/pixel-office/src/index.ts:37-38`

**Issue:** "the bubble keeps its 12-code-point label". The cap has been `MAX_DIALOGUE_TITLE_CHARS = 14` since 05-40. 05-41 fixed the same wording in `handoff-choreography.ts` but missed this re-export comment. There is a sibling at `packages/pixel-office/src/types.ts:162`, outside this round's scope.

**Fix:** replace `12-code-point` with `MAX_DIALOGUE_TITLE_CHARS-capped` in both places.

### IN-02: a cut that falls on a space leaves "word …", and the default test fixture hits it

**File:** `packages/pixel-office/src/handoff/dialogue-templates.ts:36-39`

**Issue:** `capForDialogue` keeps the first `max - 1` code points and appends `…`, but does not trim the end first. The host-read-path fixture `LONG_TITLE = "Refactor the projection reduce"` has a space as its 13th code point, so the canvas line is `"hands Refactor the … to Ada"`. That is the stray-whitespace look 05-41's trim was meant to remove ("never leaving a doubled space"), coming back through the cut path.

**Fix:** `chars.slice(0, max - 1).join("").trimEnd() + "…"`.

### IN-03: invisible characters that are not whitespace get past `titleOrNull`

**File:** `packages/pixel-office/src/handoff/dialogue-templates.ts:50-53`

**Issue:** `String.prototype.trim` strips Unicode whitespace but not format characters or fillers. `"\u200B"` (zero-width space) and `"\u3164"` (Hangul filler) survive as "present" titles and render as `"hands <U+200B> to Ada"` / `"hands <U+3164> to Ada"`, which look the same as the pre-05-41 `"hands  to Ada"`. This is stream-safety ground (SAFE-01/02, Phase 7), which the file's header already defers.

**Fix:** leave it for Phase 7. If fixed here: `title?.replace(/[\p{Cf}\p{Zs}\u3164\u115F\u1160]/gu, " ").trim()`.

### IN-04 (carried from the previous pass as IN-03, unchanged): `MAX_DIALOGUE_LINE_CHARS` looks like a cap but nothing enforces it

**File:** `packages/pixel-office/src/handoff/dialogue-templates.ts:33`

**Issue:** it is named like the two caps next to it, but only the test suite references it.

**Fix:** rename it to `DIALOGUE_LINE_BUDGET_CHARS` and say in the `:22-30` docblock that the tests assert it but nothing enforces it at runtime.

### IN-05 (carried from the previous pass, unchanged): the "mechanical proof" of zero network surface only greps single files

**File:** `packages/pixel-office/src/handoff/dialogue-templates.test.ts:112-128`

**Issue:** the check is sound for `dialogue-templates.ts`, which imports nothing. It proves nothing about what `handoff-choreography.ts` imports.

**Fix:** narrow the describe title to "this module declares no network call", or walk the relative-import graph and grep every file reachable from it.

---

_Reviewed: 2026-09-23T20:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
