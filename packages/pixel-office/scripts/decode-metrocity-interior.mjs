// Office sprite decode script (05-22-PLAN.md Task 1, UAT gap G-05-1e).
//
// Decodes the MetroCity Interior sheets committed under
// ../assets/metrocity-interior/ (byte-for-byte copies of the user-supplied
// Interior.rar, keeping the pack's own Home/ and Hospital/ paths) into
// ../src/sprites/office-metrocity.json. No network access: the committed
// sheets are the only input, and each one's SHA-256 is recorded in the JSON.
//
// Source pack: "MetroCity - Free Top Down Interior Asset Pack" by JIK-A-4,
// https://jik-a-4.itch.io/metrocity, CC0 1.0 (see references/ASSET-LICENSES.md §1a).
//
// Modes: "tile" copies the rect verbatim; "bbox" crops to the tight
// alpha>=128 bounding box inside the search rect. monitorBack is an original
// authored inline below (the pack has no small monitor seen from behind).
//
// ponytail: alpha<128 binary transparent/opaque threshold, same as
// decode-metrocity-sprites.mjs. MetroCity has no real semi-transparent
// pixels; if a future sheet does, carry #RRGGBBAA instead.
//
// Re-run: `node scripts/decode-metrocity-interior.mjs` from packages/pixel-office/.
// Verify:  `node scripts/decode-metrocity-interior.mjs --check` (exit 1 on drift).

import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_ROOT = join(__dirname, "..", "assets", "metrocity-interior");
const OUTPUT_PATH = join(__dirname, "..", "src", "sprites", "office-metrocity.json");

const MANIFEST = [
  { key: "floorTiles", sheet: "Home/TilesHouse.png", rect: [96, 128, 32, 32], mode: "tile" },
  { key: "wallTop", sheet: "Home/TilesHouse.png", rect: [16, 24, 16, 16], mode: "tile" },
  { key: "desk", sheet: "Home/LivingRoom-Sheet.png", rect: [0, 0, 96, 96], mode: "bbox" },
  { key: "plant", sheet: "Home/Flowers-Sheet.png", rect: [0, 0, 64, 96], mode: "bbox" },
  { key: "plantSmall", sheet: "Home/Flowers-Sheet.png", rect: [64, 0, 64, 96], mode: "bbox" },
  { key: "bookcase", sheet: "Home/Cupboard-Sheet.png", rect: [256, 0, 64, 96], mode: "bbox" },
  { key: "cabinet", sheet: "Hospital/Miscellaneous-Sheet.png", rect: [1320, 0, 48, 64], mode: "bbox" },
  { key: "painting", sheet: "Home/Paintings-Sheet.png", rect: [64, 0, 32, 32], mode: "bbox" },
];

// Original (this repo): 10x9 monitor seen from behind — casing, darker 1 px
// edge, 2 px stand. Palette deliberately avoids #121212 / #f0f0f0 (dialogue colours).
const MONITOR_BACK = {
  palette: { ".": "", E: "#2a2a30", C: "#4a4a52", H: "#5c5c66", S: "#3a3a40" },
  rows: [
    "EEEEEEEEEE",
    "ECHHHHHHCE",
    "ECCCCCCCCE",
    "ECCCCCCCCE",
    "ECCCCCCCCE",
    "ECCCCCCCCE",
    "EEEEEEEEEE",
    "....SS....",
    "..SSSSSS..",
  ],
};

function hex(d, i) {
  if (d[i + 3] < 128) return "";
  return "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function crop(png, [x, y, w, h]) {
  const out = [];
  for (let r = 0; r < h; r++) {
    const row = [];
    for (let c = 0; c < w; c++) row.push(hex(png.data, ((y + r) * png.width + (x + c)) * 4));
    out.push(row);
  }
  return out;
}

function tightRect(png, [x, y, w, h], key) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (png.data[(r * png.width + c) * 4 + 3] >= 128) {
        x0 = Math.min(x0, c); y0 = Math.min(y0, r); x1 = Math.max(x1, c); y1 = Math.max(y1, r);
      }
    }
  }
  if (x1 < 0) throw new Error(`${key}: no opaque pixel inside search rect ${[x, y, w, h]}`);
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

export function decode() {
  const sources = {};
  const pngs = {};
  for (const { sheet } of MANIFEST) {
    if (pngs[sheet]) continue;
    const bytes = readFileSync(join(ASSET_ROOT, sheet));
    sources[sheet] = createHash("sha256").update(bytes).digest("hex");
    pngs[sheet] = PNG.sync.read(bytes);
  }

  const sprites = {};
  for (const { key, sheet, rect, mode } of MANIFEST) {
    const png = pngs[sheet];
    const final = mode === "bbox" ? tightRect(png, rect, key) : rect;
    const [x, y] = final;
    const data =
      key === "floorTiles"
        ? [[0, 0], [16, 0], [0, 16], [16, 16]].map(([dx, dy]) => crop(png, [x + dx, y + dy, 16, 16]))
        : crop(png, final);
    sprites[key] = { sheet, rect: final, data };
  }

  sprites.monitorBack = {
    sheet: "original",
    rect: null,
    data: MONITOR_BACK.rows.map((row) => [...row].map((ch) => MONITOR_BACK.palette[ch])),
  };

  return {
    pack: "MetroCity - Free Top Down Interior Asset Pack by JIK-A-4",
    url: "https://jik-a-4.itch.io/metrocity",
    licence: "CC0-1.0",
    sources,
    sprites,
  };
}

function firstDiff(a, b, path = "") {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
  }
  return path || "(root)";
}

function main() {
  const result = decode();
  if (process.argv.includes("--check")) {
    let committed;
    try {
      committed = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
    } catch (err) {
      console.error(`--check: cannot read ${OUTPUT_PATH}: ${err.message}`);
      process.exit(1);
    }
    const diff = firstDiff(result, committed);
    if (diff) {
      console.error(`--check: office-metrocity.json differs from a fresh decode at ${diff}`);
      process.exit(1);
    }
    console.log("--check: office-metrocity.json matches a fresh decode");
    return;
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
