// One-time-but-reusable decode script (05-06-PLAN.md Task 2).
//
// Fetches the fork's own bundled MetroCity character_0.png at the exact
// commit SHA pinned throughout Phase 5 (never `main`, to avoid supply-chain
// drift — see T-05-22 in 05-06-PLAN.md's threat model) and decodes it into
// this package's character-metrocity.json data asset.
//
// Verified against the fork's own core/src/assets/pngDecoder.ts
// (decodeCharacterPng) and constants.ts before writing this script:
//   - char_0.png is 112x96 (confirmed by direct pngjs decode of the fetched
//     bytes, not just the fork's source)
//   - 3 direction rows top-to-bottom: down, up, right (CHARACTER_DIRECTIONS)
//   - 7 columns of 16x32 frames per row (CHAR_FRAME_W/H, CHAR_FRAMES_PER_ROW)
//   - frame roles per row, confirmed against the fork's own
//     webview-ui/src/office/sprites/spriteData.ts getCharacterSprites():
//     walk = [0,1,2,1], typing = [3,4], reading = [5,6]
//
// ponytail: alpha<128 binary transparent/opaque threshold (per this plan's
// own explicit instruction) collapses any genuine semi-transparent pixel to
// fully opaque or fully transparent. MetroCity's pixel-art style has no
// real semi-transparent pixels, so this is a non-issue in practice; if a
// future asset does use antialiasing/semi-transparency, switch to carrying
// an explicit alpha suffix (#RRGGBBAA, already supported by this repo's
// SpriteData convention — see colorize.ts's extractAlpha/appendAlpha).
//
// Re-run: `node scripts/decode-metrocity-sprites.mjs` from
// packages/pixel-office/. Requires the pngjs devDependency (pnpm install).

import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COMMIT_SHA = "3537e140c2094761beae748592aeb92ece8edfdd";
const SOURCE_URL = `https://raw.githubusercontent.com/pixel-agents-hq/pixel-agents/${COMMIT_SHA}/webview-ui/public/assets/characters/char_0.png`;

const FRAME_W = 16;
const FRAME_H = 32;
const FRAMES_PER_ROW = 7;
const DIRECTIONS = ["down", "up", "right"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "src", "sprites", "character-metrocity.json");

function rgbaToHex(r, g, b, a) {
  if (a < 128) return "";
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toLowerCase();
}

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const png = PNG.sync.read(buffer);

  if (png.width !== FRAME_W * FRAMES_PER_ROW || png.height !== FRAME_H * DIRECTIONS.length) {
    throw new Error(
      `Unexpected char_0.png dimensions: ${png.width}x${png.height} (expected ${FRAME_W * FRAMES_PER_ROW}x${FRAME_H * DIRECTIONS.length})`,
    );
  }

  const result = { sourceUrl: SOURCE_URL, commitSha: COMMIT_SHA };

  for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
    const dir = DIRECTIONS[dirIdx];
    const rowOffsetY = dirIdx * FRAME_H;
    const frames = [];

    for (let f = 0; f < FRAMES_PER_ROW; f++) {
      const frameOffsetX = f * FRAME_W;
      const sprite = [];
      for (let y = 0; y < FRAME_H; y++) {
        const row = [];
        for (let x = 0; x < FRAME_W; x++) {
          const idx = ((rowOffsetY + y) * png.width + (frameOffsetX + x)) * 4;
          row.push(rgbaToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]));
        }
        sprite.push(row);
      }
      frames.push(sprite);
    }

    result[dir] = frames;
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
