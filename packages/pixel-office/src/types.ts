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
  dir: Direction;
  /** Pixel position */
  x: number;
  y: number;
  /** Current tile column */
  tileCol: number;
  /** Current tile row */
  tileRow: number;
  /** Remaining path steps (tile coords) */
  path: Array<{ col: number; row: number }>;
  /** 0-1 lerp between current tile and next tile */
  moveProgress: number;
  /** Current tool name for typing vs reading animation, or null */
  currentTool: string | null;
  /** Palette index — per-agent identity colour (never conflated with state signal, D-01) */
  palette: number;
  /** Hue shift in degrees */
  hueShift: number;
  /** Animation frame index */
  frame: number;
  /** Time accumulator for animation */
  frameTimer: number;
  /** Active speech bubble type, or null if none showing. Wired up in 05-02 (D-03 icon overlay). */
  bubbleType: "permission" | "waiting" | null;
}
