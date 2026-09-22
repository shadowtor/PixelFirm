import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DIALOGUE_BOX_COLOR, DIALOGUE_TEXT_COLOR } from "../constants.js";

type SpriteData = string[][];
interface OfficeSprite {
  sheet: string;
  rect: [number, number, number, number] | null;
  data: SpriteData | SpriteData[];
}

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", "..");
const script = join(pkgRoot, "scripts", "decode-metrocity-interior.mjs");
const jsonPath = join(here, "office-metrocity.json");
const assetRoot = join(pkgRoot, "assets", "metrocity-interior");

function load(): { sources: Record<string, string>; sprites: Record<string, OfficeSprite> } {
  return JSON.parse(readFileSync(jsonPath, "utf-8"));
}

const HEX = /^#[0-9a-f]{6}$/;

function expectOpaque(s: SpriteData, w: number, h: number): void {
  expect(s.length).toBe(h);
  for (const row of s) {
    expect(row.length).toBe(w);
    for (const cell of row) expect(cell).toMatch(HEX);
  }
}

function expectSprite(s: SpriteData, w: number, h: number): void {
  expect(s.length).toBe(h);
  for (const row of s) expect(row.length).toBe(w);
  expect(s.some((row) => row.some((c) => c !== ""))).toBe(true);
}

describe("office-metrocity.json (05-22, G-05-1e)", () => {
  it("office-metrocity.json is the decode of the committed sheets", () => {
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("floor and wall tiles are full opaque tiles", () => {
    const { sprites } = load();
    const floor = sprites.floorTiles.data as SpriteData[];
    expect(floor).toHaveLength(4);
    for (const q of floor) expectOpaque(q, 16, 16);
    expectOpaque(sprites.wallTop.data as SpriteData, 16, 16);
  });

  it("furniture sprites have their measured size and real pixels", () => {
    const { sprites } = load();
    const sizes: Record<string, [number, number]> = {
      desk: [46, 30],
      plant: [20, 41],
      plantSmall: [14, 21],
      bookcase: [36, 43],
      cabinet: [22, 27],
      painting: [14, 16],
    };
    for (const [key, [w, h]] of Object.entries(sizes)) expectSprite(sprites[key].data as SpriteData, w, h);
    const mb = sprites.monitorBack.data as SpriteData;
    expect(mb.length).toBeLessThanOrEqual(10);
    expectSprite(mb, mb[0].length, mb.length);
    expect(mb[0].length).toBeLessThanOrEqual(12);
  });

  it("every sprite is traceable", () => {
    const { sources, sprites } = load();
    for (const file of Object.keys(sources)) expect(existsSync(join(assetRoot, file))).toBe(true);
    for (const [key, s] of Object.entries(sprites)) {
      if (key === "monitorBack") expect(s.sheet).toBe("original");
      else expect(Object.keys(sources)).toContain(s.sheet);
    }
  });

  it("no office sprite paints a dialogue colour", () => {
    const { sprites } = load();
    const banned = new Set([DIALOGUE_BOX_COLOR.toLowerCase(), DIALOGUE_TEXT_COLOR.toLowerCase()]);
    for (const s of Object.values(sprites)) {
      const frames = Array.isArray((s.data as unknown[][])[0][0]) ? (s.data as SpriteData[]) : [s.data as SpriteData];
      for (const f of frames) for (const row of f) for (const c of row) expect(banned.has(c.toLowerCase())).toBe(false);
    }
  });
});
