// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// Trimmed from the fork's original ~300-line constants.ts (grid/animation
// timing values only, verbatim). Dropped: the VS Code extension's editor UI
// constants (ghost preview, selection/delete/rotate buttons, zoom/camera/undo
// stack), matrix-effect timing, carpet/area/pet/notification-sound/context-
// gauge/agent-team constants — none of that surface exists in this plan's
// minimal renderer. Re-add the relevant block here (not a fresh guess) if a
// later plan needs one of those subsystems.

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
/** Visible air (unzoomed px) between a glyph's lowest ink row and its owner's
 *  first opaque sprite row, per frame (05-30, G-05-1c) — no longer the frame box.
 *  Raised 1 -> 3 by 05-38 (G-05-1c): at 1 px the glyph touched the head and read
 *  as part of the sprite at stream scale. Unzoomed engine px, like every other
 *  spacing value here, so at display scale 4 the on-screen air is 12 device px. */
export const BUBBLE_ICON_GAP_PX = 3;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const FALLBACK_FLOOR_COLOR = "#808080";
export const WALL_COLOR = "#3A3A5C";
/** Handoff speech-bubble font size in world px (05-28, G-05-1b); the renderer
 *  multiplies by zoom, so it is 5N device px on screen (>= 15 at the minimum display scale). */
export const DIALOGUE_FONT_PX = 5;
/** Bubble height: 1px border + 1px pad + 5px text + 1px pad + 1px border. */
export const DIALOGUE_BOX_HEIGHT_PX = 9;
/** Horizontal padding inside the bubble border, each side. */
export const DIALOGUE_BOX_PAD_X_PX = 2;
/** Tail length from the speaker's foot line down to the bubble. */
export const DIALOGUE_TAIL_PX = 2;
// Both dialogue colours are achromatic (R = G = B) so antialiased blends between them stay achromatic, and neither appears in any character (any hue), glyph or office sprite palette (renderer.test.ts and officeSprites.test.ts guard this).
/** Bubble fill (light). */
export const DIALOGUE_BOX_COLOR = "#dcdcdc";
/** Bubble ink: border, tail and text (dark). */
export const DIALOGUE_TEXT_COLOR = "#161616";

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
