// 05-07: the BubbleType -> SpriteData resolution layer engine/renderer.ts
// needs to actually paint D-03's icon overlay. Character.bubbleType has been
// correctly computed since 05-02 (status-mapping.ts) and 05-04
// (handoff-choreography.ts) but nothing ever turned the key into pixels, so
// 05-VERIFICATION.md's Truth 2 ("a blocked or waiting agent is visually
// distinguishable at a glance") was data-correct but invisible.
//
// Three of the twelve assets below never existed before this file:
// bubble-permission.json / bubble-waiting.json (referenced by STATUS_MAP
// since 05-02, never authored — 05-02-SUMMARY.md's own disclosed gap) and
// bubble-handoff-task.json (referenced by handoff-choreography.ts's
// bubbleType = "handoff-task" since 05-04, likewise never authored).

import type { BubbleType, SpriteData } from "../types.js";

import bubbleBlocked from "./bubble-blocked.json" with { type: "json" };
import bubbleCompleted from "./bubble-completed.json" with { type: "json" };
import bubbleFailed from "./bubble-failed.json" with { type: "json" };
import bubbleHandoffTask from "./bubble-handoff-task.json" with { type: "json" };
import bubblePermission from "./bubble-permission.json" with { type: "json" };
import bubbleWaiting from "./bubble-waiting.json" with { type: "json" };
import badgeDeploying from "./badge-deploying.json" with { type: "json" };
import badgeDiscussing from "./badge-discussing.json" with { type: "json" };
import badgePlanning from "./badge-planning.json" with { type: "json" };
import badgeResearching from "./badge-researching.json" with { type: "json" };
import badgeReviewing from "./badge-reviewing.json" with { type: "json" };
import badgeTesting from "./badge-testing.json" with { type: "json" };

interface PaletteSprite {
  palette: Record<string, string>;
  pixels: string[][];
}

/**
 * Map a {palette, pixels} asset into the flat hex/"" SpriteData shape
 * renderer.ts's drawSpriteData already consumes. An unknown palette key
 * resolves to transparent rather than throwing — a malformed asset should
 * lose a pixel, never take down the render loop.
 */
function resolvePaletteSprite(json: PaletteSprite): SpriteData {
  return json.pixels.map((row) => row.map((cell) => (cell === "" ? "" : (json.palette[cell] ?? ""))));
}

/**
 * Exhaustive BubbleType -> SpriteData table. The Record type makes a missing
 * entry a compile-time error, mirroring status-mapping.ts's STATUS_MAP.
 */
export const BUBBLE_SPRITES: Record<BubbleType, SpriteData> = {
  permission: resolvePaletteSprite(bubblePermission),
  waiting: resolvePaletteSprite(bubbleWaiting),
  blocked: resolvePaletteSprite(bubbleBlocked),
  failed: resolvePaletteSprite(bubbleFailed),
  completed: resolvePaletteSprite(bubbleCompleted),
  planning: resolvePaletteSprite(badgePlanning),
  researching: resolvePaletteSprite(badgeResearching),
  testing: resolvePaletteSprite(badgeTesting),
  reviewing: resolvePaletteSprite(badgeReviewing),
  discussing: resolvePaletteSprite(badgeDiscussing),
  deploying: resolvePaletteSprite(badgeDeploying),
  "handoff-task": resolvePaletteSprite(bubbleHandoffTask),
};

/** Thin BUBBLE_SPRITES accessor — no fallback branch, see STATUS_MAP. */
export function resolveBubbleSprite(bubbleType: BubbleType): SpriteData {
  return BUBBLE_SPRITES[bubbleType];
}
