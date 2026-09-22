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
/** Vertical gap (unzoomed px) between a character's sprite top edge and the
 *  bottom edge of its bubble/badge icon overlay (05-07, D-03). */
export const BUBBLE_ICON_GAP_PX = 2;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const FALLBACK_FLOOR_COLOR = "#808080";
export const WALL_COLOR = "#3A3A5C";
/** Height of a state-glyph SLOT (the locked 11x13 format, enforced per asset by bubbleSprites.test.ts); reserved whether or not a glyph shows, so dialogue never jumps. */
export const BUBBLE_ICON_HEIGHT_PX = 13;
/** Handoff dialogue font size — 05-UI-SPEC.md's reserved monospace/11px scale (05-13). */
export const DIALOGUE_FONT_PX = 11;
/** Dialogue box height: the 11px font plus 1px padding top and bottom. */
export const DIALOGUE_BOX_HEIGHT_PX = 13;
/** Horizontal padding inside a dialogue box, each side. */
export const DIALOGUE_BOX_PAD_X_PX = 2;
// Both dialogue colours are achromatic (R = G = B) so antialiased blends between them stay achromatic, and neither appears in any character (any hue) or glyph palette (#1a1a1a and #ffffff do; renderer.test.ts guards this).
/** Dialogue box fill. */
export const DIALOGUE_BOX_COLOR = "#121212";
/** Dialogue text fill. */
export const DIALOGUE_TEXT_COLOR = "#f0f0f0";

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
