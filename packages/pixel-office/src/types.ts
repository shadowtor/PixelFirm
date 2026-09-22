// Forked from https://github.com/pixel-agents-hq/pixel-agents
// commit 3537e140c2094761beae748592aeb92ece8edfdd (main, fetched 2026-09-21)
// Forked under MIT — see packages/pixel-office/LICENSE
//
// Trimmed to the primitives 05-01 actually needs (Character finite-state
// machine, tile/direction/sprite types). Dropped from the fork's original
// types.ts: FurnitureInstance/FurnitureCatalogEntry/PlacedFurniture,
// CarpetTile/AreaDefinition/OfficeLayout, Seat, Pet/PlacedPet/PetState,
// ToolActivity/EditTool — none of that surface (furniture, carpets, areas,
// pets, the VS Code editor) exists in this plan's minimal renderer. Also
// dropped every Character field the fork uses for autonomous idle-wander,
// seat assignment, matrix spawn/despawn effects, agent-team display, the
// context-fuel gauge, and headless/greeter ghosting — none of that is wired
// up by this plan; re-add fields here if a later plan needs them.

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  FLOOR_8: 8,
  FLOOR_9: 9,
  VOID: 255,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const CharacterState = {
  IDLE: "idle",
  WALK: "walk",
  TYPE: "type",
} as const;
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

/**
 * Speech-bubble overlay glyph key, resolved by status/status-mapping.ts
 * (D-03 OFFICE-03 icon overlay). "permission"/"waiting" are the fork's own
 * near-verbatim-reused bubble concepts (waiting_for_ceo/waiting_for_agent);
 * the rest are new small icon glyphs authored this phase in the same
 * palette+pixels JSON shape (packages/pixel-office/src/sprites/bubble-*.json,
 * badge-*.json). Resolving the key to an actual asset/JSON is a rendering
 * concern deferred past this phase's scope (see engine/renderer.ts header) —
 * this field only carries which glyph a character's current status implies.
 */
export type BubbleType =
  | "permission"
  | "waiting"
  | "blocked"
  | "failed"
  | "completed"
  | "planning"
  | "researching"
  | "testing"
  | "reviewing"
  | "discussing"
  | "deploying"
  // Phase 5 addition (05-04, HANDOFF-01): the transient task-icon overlay
  // shown above a character mid-handoff. Deliberately NOT reused from any
  // AgentStatus bubble value above — a handoff-in-progress icon is a
  // render-only overlay driven by handoff-choreography.ts's FSM, not an
  // AgentStatus value (per 05-04-PLAN.md Task 1's own instruction).
  | "handoff-task";

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** 2D array of hex color strings: '' = transparent, '#RRGGBB' = opaque, '#RRGGBBAA' = semi-transparent. [row][col] */
export type SpriteData = string[][];

/** H/S/B/C color-adjustment tuple used by colorize.ts's adjust/colorize modes. */
export interface ColorValue {
  h: number;
  s: number;
  b: number;
  c: number;
  colorize?: boolean;
}

export interface Character {
  /** Real agentId (company-core's AgentState.id) — a string, not the fork's
   *  numeric per-VS-Code-session id. */
  id: string;
  state: CharacterState;
  /** The pose shown whenever the character is not walking: its latest
   *  AgentStatus pose, or TYPE once it accepted a handoff. Applied at once
   *  when not walking and at the end of every walk. Only setRestPose writes
   *  it (05-19, review CR-01/IN-03). */
  restPose: CharacterState;
  dir: Direction;
  /** Pixel position */
  x: number;
  y: number;
  /** Current tile column */
  tileCol: number;
  /** Current tile row */
  tileRow: number;
  /** Home desk tile column — set once at creation (createCharacter), never
   *  mutated by movement. The return target for 05-04's handoff
   *  walk-to-desk choreography ("return to own desk" leg) and the walk
   *  target another agent's handoff aims at ("walk to receiver's desk"). */
  seatCol: number;
  /** Home desk tile row — see seatCol. */
  seatRow: number;
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>;
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number;
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null;
  /** Per-agent identity hue in degrees, derived from the agentId and seated hues (index.ts's
   *  identityHueFor). IDENTITY only — never a state signal (D-01, OFFICE-03).
   *  The former `palette` index that sat alongside this was removed in 05-10:
   *  nothing ever read it, so every agent rendered identical pixels (WR-08). */
  hueShift: number;
  /** Animation frame index */
  frame: number;
  /** Time accumulator for animation */
  frameTimer: number;
  /** Active speech bubble type, or null if none showing (D-03 icon overlay, wired up 05-02). */
  bubbleType: BubbleType | null;
  /** True while status/status-mapping.ts's STATUS_MAP marks this status frozen
   *  (blocked/waiting_for_agent/waiting_for_ceo, D-03) — suppresses animation
   *  frame advance in engine/characters.ts's updateCharacter regardless of
   *  pose, so a stuck agent never reads as still actively working. */
  frozen: boolean;
  /** Multiplies dt for animation frame-timer accumulation. The one legitimate
   *  procedural-variation state signal this project uses (deploying's sped-up
   *  typing animation) — never tint, since hue/palette is already claimed by
   *  per-agent identity colour (RESEARCH.md Pattern 2). Defaults to 1. */
  frameSpeedMultiplier: number;
  /** Display name, if known (AgentState.name) — used to interpolate handoff
   *  dialogue (05-04, HANDOFF-02). Falls back to the raw agentId when absent. */
  name?: string;
  /** Tooltip/label text attached to the current bubble overlay, if any — set
   *  by handoff-choreography.ts's deterministic dialogue templates (05-04,
   *  HANDOFF-02). Drawn by engine/renderer.ts's renderScene dialogue pass in
   *  an owner-bound box beneath state glyphs (05-13). Carries only strings
   *  produced by resolveHandoffDialogue (length-capped). */
  bubbleText?: string | null;
}
