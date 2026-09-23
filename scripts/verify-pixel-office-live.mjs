#!/usr/bin/env node
// Live, real-browser end-to-end proof of Phase 5's Core Value claim
// (05-08). Run manually:  node scripts/verify-pixel-office-live.mjs
//
// Zero mocking anywhere in this file: real test Postgres, real `apps/api`
// dev server, real `apps/web` Vite dev server, real worker credential issued
// through POST /admin/workers, real events POSTed through POST /events, real
// /ws/browser relay, real headless Chromium, real canvas pixels read back via
// getImageData. Nothing here fabricates a frame or short-circuits a check.
//
// WHY THESE EVENT TYPES (honest deviation from 05-08-PLAN.md's literal draft):
// the plan's draft posted `agent.online` and `task.created`, but neither is in
// apps/api/src/routes/events.ts's WORKER_ALLOWED_EVENT_TYPES — a worker
// credential is 403'd for both, and no producer of `agent.online` exists
// anywhere in this codebase (flagged since 05-01). Widening that allow-list to
// make a demo pass would be faking the proof. Instead this script drives the
// same truths using only event types the REAL pipeline actually carries today:
// `task.status_changed` (whose reducer handler upserts the owning agent and
// derives its AgentStatus) and the `agent.handoff_requested` /
// `agent.handoff_completed` pair.
//
// One precision about the handoff pair, so this header does not out-claim the
// code (05-11, D-04 answered `delete-trigger`): ClaudeCodeRuntime emits that
// pair through `requestHandoff`/`completeHandoff`, but NO in-repo producer
// triggers it automatically any more — the role-poll that used to fabricate a
// handoff out of a GSD workflow role change was deleted, because a role change
// is an observation, not a handoff to a role-named agent. A real pair needs a
// caller supplying a genuine receiving agent id, which Phase 6's multi-agent
// orchestration owns. What this script proves is the RENDERING half end to end:
// a real pair on the live relay drives reducer -> character upsert ->
// choreography -> painted canvas.
//
// Truths: (0) the office is presented at an integer scale >= MIN_DISPLAY_SCALE,
// never native (05-21, G-05-1a); (1) a live agent paints a sprite; (2) a live blocked status paints
// its glyph; (3) a handoff pair paints the task icon, then clears it; (4) the
// blocked glyph is owner-bound; (5) the handoff speech bubble is painted in the
// band under the pair, spanning sender and receiver (05-28), the accepted line is
// positively observed after agent.handoff_completed (05-17, WR-10), and
// nothing is left once the sequence ends (polled against a walk-home deadline
// derived from WALK_SPEED_PX_PER_SEC). Dialogue is shown for its sequence only (requested line while the
// sender waits; accepted line until the sender is home); (6) the empty office
// is furnished — no bare FALLBACK_FLOOR_COLOR pixel, and every desk paints at
// its layout rectangle (05-26, G-05-1e); (7) with the whole cohort on the floor
// the page sustains >= 30 animation frames per second (05-26).
//
// Geometry and colours come from the engine's own data files (05-12 rule):
// seats and standing spots from layout/office-layout.json, office colours from
// sprites/office-metrocity.json. An "agent pixel" is any pixel in no office
// colour — on a textured, furnished floor "not grey" no longer means "sprite".
//
// The harness refuses to run while the API or web port is taken and never
// reuses a server it did not start (WR-06).
//
// T-05-26 (accepted, low): this script reads secrets from the local, already
// gitignored apps/api/.env and sends them only to the localhost dev server it
// just started. No secret is ever printed to stdout.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SPRITE_DIR = path.join(ROOT, "packages", "pixel-office", "src", "sprites");
const WEB_PORT = 5177;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const COMPANY_ID = "live-proof-co";
// Fixed, readable ids. They no longer need to be fixed for correctness — every
// run starts from an empty store (see the target-resolution block below), so
// nothing accumulates between runs — they are fixed because a named desk is
// easier to reason about in a failure message than a fresh UUID.
const SENDER = "live-proof-sender";
const RECEIVER = "live-proof-receiver";
const BLOCKED = "live-proof-blocked";
const HANDOFF_TASK = "live-proof-task-handoff";

const log = (msg) => console.log(`[live-proof] ${msg}`);

// ── local env / constants (read, never printed) ──────────────────────────────

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const apiEnv = parseEnvFile(path.join(ROOT, "apps", "api", ".env"));
const webEnv = parseEnvFile(path.join(ROOT, "apps", "web", ".env"));

for (const key of ["DATABASE_URL", "BOOTSTRAP_SECRET", "BROWSER_ACCESS_TOKEN", "CREDENTIAL_PEPPER"]) {
  if (!apiEnv[key]) {
    throw new Error(
      `apps/api/.env is missing ${key}. Generate it per 05-01-SUMMARY.md's documented pattern before running this proof.`,
    );
  }
}

// ── test-container target resolution (WR-05) ─────────────────────────────────
//
// This harness SELECTS its target rather than inheriting it. `apps/api/.env`'s
// DATABASE_URL names a developer's DEV database; this run wipes its store
// before every proof, so inheriting that name would aim a volume removal at a
// developer's data. The only unambiguous description of a harness-owned store
// in this repo is `apps/api/docker-compose.test.yml`'s own POSTGRES_DB and
// published port, so both are parsed out of that file at run time (never
// hardcoded here, so the harness and the container cannot disagree) and
// override DATABASE_URL's corresponding components. The resulting URL is the
// single target for the whole run: this file's own pg client AND the
// DATABASE_URL handed to the spawned apps/api dev server.
const COMPOSE_PATH = path.join(ROOT, "apps", "api", "docker-compose.test.yml");

function parseComposeTarget(file) {
  const src = readFileSync(file, "utf8");
  const db = src.match(/POSTGRES_DB:\s*["']?([A-Za-z0-9_-]+)["']?/)?.[1];
  const port = src.match(/^\s*-\s*["']?(\d+):\d+["']?\s*$/m)?.[1];
  if (!db || !port) {
    throw new Error(`could not read POSTGRES_DB and the published host port from ${file}`);
  }
  return { db, port };
}

const COMPOSE_TARGET = parseComposeTarget(COMPOSE_PATH);

const testDbUrl = new URL(apiEnv.DATABASE_URL);
testDbUrl.pathname = `/${COMPOSE_TARGET.db}`;
testDbUrl.port = COMPOSE_TARGET.port;
const TEST_DATABASE_URL = testDbUrl.toString();

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Halts unless the resolved target is the loopback container `docker-compose
 * .test.yml` describes. Its job is NOT to make a destructive statement safe —
 * this harness issues none — but to guarantee the container whose volume is
 * about to be recreated is the same one the dev server will then connect to,
 * and to stop a dev server plus a volume wipe ever being pointed at a
 * non-local Postgres.
 */
function assertHarnessOwnedTarget() {
  const url = new URL(TEST_DATABASE_URL);
  const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const actual = `host=${url.hostname} port=${url.port} db=${db}`;
  const expected = `host=<loopback> port=${COMPOSE_TARGET.port} db=${COMPOSE_TARGET.db}`;
  if (!LOOPBACK_HOSTS.has(url.hostname) || db !== COMPOSE_TARGET.db || url.port !== COMPOSE_TARGET.port) {
    throw new Error(
      `refusing to run — the resolved target is not the docker-compose.test.yml container.\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `Nothing has been reset. This harness recreates that container's volume and starts a dev\n` +
        `server against the same URL; both must be the local test container.`,
    );
  }
  log(`target resolved from apps/api/docker-compose.test.yml: ${actual}`);
}

// The browser talks to whatever VITE_WS_BASE_URL names; post to that same
// server so a port mismatch can never make this proof silently test two
// different API processes.
const wsBase = webEnv.VITE_WS_BASE_URL ?? "";
const API_PORT = Number(wsBase.match(/:(\d+)\s*$/)?.[1] ?? apiEnv.PORT ?? 3000);
const API_URL = `http://localhost:${API_PORT}`;

const constantsSrc = readFileSync(path.join(ROOT, "packages", "pixel-office", "src", "constants.ts"), "utf8");
const officeIndexSrc = readFileSync(path.join(ROOT, "packages", "pixel-office", "src", "index.ts"), "utf8");
function readColorConst(name) {
  const m = constantsSrc.match(new RegExp(`${name}\\s*=\\s*"(#[0-9a-fA-F]{6})"`));
  if (!m) throw new Error(`could not read ${name} from packages/pixel-office/src/constants.ts`);
  return m[1];
}
function readNumberConst(src, where, name) {
  const m = src.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`could not read ${name} from ${where}`);
  return Number(m[1]);
}

// Grid geometry, read from the engine's own source rather than restated here:
// a layout change moves these assertions with it instead of silently
// invalidating them.
const TILE_SIZE = readNumberConst(constantsSrc, "constants.ts", "TILE_SIZE");
const DEFAULT_COLS = readNumberConst(constantsSrc, "constants.ts", "DEFAULT_COLS");
const DEFAULT_ROWS = readNumberConst(constantsSrc, "constants.ts", "DEFAULT_ROWS");
const MIN_DISPLAY_SCALE = readNumberConst(officeIndexSrc, "index.ts", "MIN_DISPLAY_SCALE");
// Optional review screenshots (05-21): only when PIXEL_OFFICE_SHOTS names a
// directory outside the repo. Unset means no files are written.
const SHOTS_DIR = process.env.PIXEL_OFFICE_SHOTS ? path.resolve(process.env.PIXEL_OFFICE_SHOTS) : null;
if (SHOTS_DIR && !path.relative(ROOT, SHOTS_DIR).startsWith("..") && !path.isAbsolute(path.relative(ROOT, SHOTS_DIR))) {
  throw new Error(`PIXEL_OFFICE_SHOTS must be outside the repo (${ROOT}), got ${SHOTS_DIR}`);
}
async function shot(page, name) {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, name) });
  log(`screenshot: ${path.join(SHOTS_DIR, name)}`);
}
const WALK_SPEED_PX_PER_SEC = readNumberConst(constantsSrc, "constants.ts", "WALK_SPEED_PX_PER_SEC");
const CHARACTER_SITTING_OFFSET_PX = readNumberConst(constantsSrc, "constants.ts", "CHARACTER_SITTING_OFFSET_PX");
const MAP_W = DEFAULT_COLS * TILE_SIZE;
const MAP_H = DEFAULT_ROWS * TILE_SIZE;

// The furnished office's own data (05-24/05-25), never restated here.
const LAYOUT = JSON.parse(
  readFileSync(path.join(ROOT, "packages", "pixel-office", "src", "layout", "office-layout.json"), "utf8"),
);
const OFFICE_SPRITES = JSON.parse(readFileSync(path.join(SPRITE_DIR, "office-metrocity.json"), "utf8")).sprites;
/** `nextDeskPosition()`'s order (packages/pixel-office/src/index.ts): seats, then standing spots. */
const SPOTS = [...LAYOUT.seats, ...LAYOUT.standing].map(([col, row]) => ({ col, row }));

/** Home tile for a creation-order slot; past the last spot everyone shares it. */
function deskPosition(slot) {
  return SPOTS[Math.min(slot, SPOTS.length - 1)];
}

// Desk slots are handed out in Character-CREATION order, so which column an
// agent lands in depends on how many agents were materialised before it. Track
// that here rather than assuming any agent starts at slot 0.
let nextDeskSlot = 0;
const deskSlots = new Map();
function claimDesk(agentId) {
  if (!deskSlots.has(agentId)) deskSlots.set(agentId, nextDeskSlot++);
  return deskPosition(deskSlots.get(agentId));
}

// Blocking furniture footprint tiles ("col,row"), from the same layout data.
const FURNITURE_BLOCKS = new Set(
  LAYOUT.furniture
    .filter((f) => f.blocks)
    .flatMap((f) => Array.from({ length: f.w * f.h }, (_, i) => `${f.col + (i % f.w)},${f.row + Math.floor(i / f.w)}`)),
);

/** Every furniture piece's rect in unzoomed map px, by officeLayout.ts's own
 *  placement rule (centred in its footprint, bottom-aligned, plus dy) — the
 *  single source for TRUTH 6's desk rects and for TRUTH 5's "the bubble covers
 *  no furniture" check (05-33, G-05-P1). Must change with officeLayout.ts. */
const FURNITURE_RECTS = LAYOUT.furniture.map((f) => {
  const sprite = OFFICE_SPRITES[f.sprite].data;
  return {
    sprite: f.sprite,
    col: f.col,
    row: f.row,
    x: f.col * TILE_SIZE + Math.round((f.w * TILE_SIZE - sprite[0].length) / 2),
    y: (f.row + f.h) * TILE_SIZE - sprite.length + (f.dy ?? 0),
    w: sprite[0].length,
    h: sprite.length,
  };
});

/** The floor interior a bubble must stay inside (05-33, G-05-P1). */
const FLOOR = { left: TILE_SIZE, top: TILE_SIZE, right: MAP_W - TILE_SIZE, bottom: MAP_H - TILE_SIZE };

/** Every home tile ("col,row") — a slot may never be one (05-34, review WR-05). */
const HOME_TILES = new Set(SPOTS.map((s) => `${s.col},${s.row}`));

/** Where a handoff sender waits (05-34, G-05-P2, superseding 05-27's seat-row
 *  search): the fixed slots of the receiver's HOME on `LAYOUT.interaction.row`
 *  at `LAYOUT.interaction.colOffsets`, taken in that order; a slot must be a
 *  floor tile that is neither furniture nor a home, with no occupied tile within
 *  Chebyshev distance 1 of it.
 *  Mirrors `interactionSlotsFor` + `interactionTileFor` in
 *  packages/pixel-office/src, and must change with them. */
function interactionTile(receiverHome, occupiedTiles) {
  const { row, colOffsets } = LAYOUT.interaction;
  const occupied = [...occupiedTiles].map((k) => k.split(",").map(Number));
  for (const d of colOffsets) {
    const col = receiverHome.col + d;
    const key = `${col},${row}`;
    if (LAYOUT.tiles[row]?.[col] !== "." || FURNITURE_BLOCKS.has(key) || HOME_TILES.has(key)) continue;
    if (occupied.some(([c, r]) => Math.max(Math.abs(c - col), Math.abs(r - row)) <= 1)) continue;
    return { col, row };
  }
  return null;
}

/** A tile column's x-range in unzoomed canvas px. A glyph is 11 wide and its
 *  owner's sprite 16, so a centred glyph is always inside its own column. */
const tileColumnRange = (col) => ({ from: col * TILE_SIZE, to: (col + 1) * TILE_SIZE });

// Sprite height comes from the decoded sheet itself, so a re-decode with
// different frame geometry moves the band assertions with it rather than
// silently invalidating them.
const CHARACTER_SHEET = JSON.parse(readFileSync(path.join(SPRITE_DIR, "character-metrocity.json"), "utf8"));
const SPRITE_HEIGHT = CHARACTER_SHEET.down[0].length;
/** Smallest opaque cell count over every frame of every direction (05-27's
 *  sender-visible floor): the waiting sender faces the receiver, so its side
 *  frame (~241 cells) is what is on screen, not a down frame (~294). */
const MIN_FRAME_OPAQUE = Math.min(
  ...["down", "up", "right"].flatMap((dir) => CHARACTER_SHEET[dir].map((f) => f.flat().filter((c) => c).length)),
);

/** Top edge of a character's sprite box on a given interior row, unzoomed —
 *  `renderScene`'s bottom-centre anchor: tile centre minus the sprite height.
 *  (A character RESTING on its own seat sits CHARACTER_SITTING_OFFSET_PX lower,
 *  whatever its status — 05-32 / G-05-P3. This returns the un-offset anchor,
 *  which is the desk row's own geometry rather than one pose's; callers add the
 *  offset themselves when the character they measure is seated.) */
const spriteTopY = (row) => row * TILE_SIZE + TILE_SIZE / 2 - SPRITE_HEIGHT;
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const FALLBACK_FLOOR_COLOR = readColorConst("FALLBACK_FLOOR_COLOR");
const FALLBACK_FLOOR_RGB = hexToRgb(FALLBACK_FLOOR_COLOR);

/** Every non-empty colour string anywhere under `v` (nested sprite arrays). */
function collectColors(v, set = new Set()) {
  if (typeof v === "string") {
    if (v) set.add(v.toLowerCase());
  } else if (Array.isArray(v)) v.forEach((x) => collectColors(x, set));
  return set;
}
/** Every colour the office itself can paint: all office sprites (floor tiles
 *  included), the flat wall fill, and the fallback floor constant. */
const OFFICE_COLORS = collectColors(Object.values(OFFICE_SPRITES).map((s) => s.data));
OFFICE_COLORS.add(readColorConst("WALL_COLOR").toLowerCase());
OFFICE_COLORS.add(FALLBACK_FLOOR_COLOR.toLowerCase());

/** Every colour any character sprite frame can paint. */
function characterColors() {
  const data = JSON.parse(readFileSync(path.join(SPRITE_DIR, "character-metrocity.json"), "utf8"));
  return collectColors([data.down, data.up, data.right]);
}

/**
 * The colours a bubble asset paints that NO character sprite pixel and no
 * office pixel can —
 * read from the asset at run time (never hardcoded, so it can't drift from
 * whatever 05-07 actually authored). A hit on one of these is unambiguous
 * proof the bubble itself was painted, not the character underneath it.
 */
function distinctiveBubbleColors(assetFile, excluded) {
  const json = JSON.parse(readFileSync(path.join(SPRITE_DIR, assetFile), "utf8"));
  const found = new Set();
  for (const row of json.pixels) {
    for (const cell of row) {
      if (!cell) continue;
      const hex = (json.palette[cell] ?? "").toLowerCase();
      if (hex && !excluded.has(hex)) found.add(hex);
    }
  }
  if (found.size === 0) throw new Error(`${assetFile} shares every colour with the character or office sprites — no distinctive signal`);
  return [...found];
}

const NOT_DISTINCTIVE = new Set([...characterColors(), ...OFFICE_COLORS]);
const BLOCKED_COLORS = distinctiveBubbleColors("bubble-blocked.json", NOT_DISTINCTIVE);
const HANDOFF_COLORS = distinctiveBubbleColors("bubble-handoff-task.json", NOT_DISTINCTIVE);
// 05-33: the receiver waits while the handoff is in flight, so its hourglass is
// the third glyph that could land on a bubble. All three are counted inside the
// bubble's box in TRUTH 5, where the answer must be zero.
const WAITING_COLORS = distinctiveBubbleColors("bubble-waiting.json", NOT_DISTINCTIVE);

// Handoff dialogue geometry/colour (05-13), read from the engine source. A
// pixel count of DIALOGUE_BOX_COLOR is unambiguous because 05-13's renderer
// colour-guard test proves no character (at any of the twelve identity hues)
// or glyph can paint it. The raw-palette partition behind BLOCKED_COLORS /
// HANDOFF_COLORS above does not model hue shifts (review WR-04, out of scope).
const DIALOGUE_BOX_COLOR = readColorConst("DIALOGUE_BOX_COLOR");

// ── process helpers ──────────────────────────────────────────────────────────

const children = [];

function runToCompletion(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

function spawnBackground(cmd, args, env) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

function killChildren() {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      child.kill("SIGKILL");
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await reachable(url)) return;
    await sleep(500);
  }
  throw new Error(`${label} never became reachable at ${url} within ${timeoutMs}ms`);
}

/** True when anything accepts a TCP connection on `port` (IPv4 or IPv6
 *  loopback). TCP rather than reachable(): an HTTP probe misses a listener that
 *  answers 5xx, speaks something else, or is slow to answer. */
function portTaken(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const sock = net.connect({ host, port });
      const done = (taken) => {
        sock.destroy();
        resolve(taken);
      };
      sock.setTimeout(1000, () => done(false));
      sock.once("connect", () => done(true));
      sock.once("error", () => done(false));
    });
  return Promise.all([probe("127.0.0.1"), probe("::1")]).then((r) => r.some(Boolean));
}

/** Always starts the server — main()'s port preflight guaranteed the port was free. */
async function startServer(url, label, start) {
  log(`starting ${label}...`);
  start();
  await waitFor(url, label);
  log(`${label} ready at ${url}`);
}

// ── event posting ────────────────────────────────────────────────────────────

let occurredAtCursor = Date.now();
const nextOccurredAt = () => new Date((occurredAtCursor += 25)).toISOString();

async function postEvent(token, event) {
  const body = {
    id: randomUUID(),
    version: 1,
    occurredAt: nextOccurredAt(),
    companyId: COMPANY_ID,
    visibility: "INTERNAL",
    ...event,
  };
  const res = await fetch(`${API_URL}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status !== 202) {
    throw new Error(`POST /events ${body.type} -> ${res.status} ${await res.text()}`);
  }
  log(`posted ${body.type}${body.sourceAgentId ? ` (${body.sourceAgentId})` : ""}`);
}

const statusChanged = (agentId, taskId, status) => ({
  type: "task.status_changed",
  taskId,
  sourceAgentId: agentId,
  payload: { taskId, status },
});

// ── canvas sampling ──────────────────────────────────────────────────────────

/**
 * Counts colour matches on the real composited canvas.
 *
 * `xRange` (unzoomed grid px, `{from, to}`) scopes the scan to a horizontal
 * band — without it every count is a claim about EVERY agent on the floor, not
 * about one. Backing-store scaling is normalised in both axes, so a band is
 * always expressed in the engine's own grid coordinates. `yRange` does the
 * same vertically (05-27: one sprite's rows, without the glyph above it).
 *
 * `blockedMinY`/`blockedMaxY` report the vertical extent of the blocked-glyph
 * pixels found inside the band (null when there are none), which is what turns
 * "a blocked glyph was painted somewhere" into "it was painted on this agent".
 */
async function scanCanvas(page, xRange = null, textAboveY = null, yRange = null) {
  return page.evaluate(
    ({ office, fallbackFloor, blocked, handoff, dialogueBox, mapW, mapH, band, textAbove, rows }) => {
      const canvas = document.getElementById("office-canvas");
      if (!canvas) throw new Error("#office-canvas is not in the DOM");
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const scale = canvas.height / mapH;
      if (Math.abs(canvas.width / mapW - scale) > 1e-6) {
        throw new Error(`canvas ${canvas.width}x${canvas.height} is not a uniform scale of the ${mapW}x${mapH} map`);
      }
      const toRgb = (hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      const officeSet = new Set(office.map((hex) => parseInt(hex.slice(1), 16)));
      const blockedRgb = blocked.map(toRgb);
      const handoffRgb = handoff.map(toRgb);
      const dlg = toRgb(dialogueBox);
      const isDlg = (i) => data[i + 3] !== 0 && data[i] === dlg[0] && data[i + 1] === dlg[1] && data[i + 2] === dlg[2];
      const matches = (r, g, b, list) => list.some((c) => c[0] === r && c[1] === g && c[2] === b);

      const fromX = band ? Math.round(band.from * scale) : 0;
      const toX = band ? Math.min(Math.round(band.to * scale), canvas.width) : canvas.width;
      const fromY = rows ? Math.round(rows.from * scale) : 0;
      const toY = rows ? Math.min(Math.round(rows.to * scale), canvas.height) : canvas.height;

      let sprite = 0;
      let fallbackFloorHits = 0;
      let blockedHits = 0;
      let handoffHits = 0;
      let blockedMinPxY = null;
      let blockedMaxPxY = null;
      let dialogueHits = 0;
      let dMinX = null;
      let dMaxX = null;
      let dMinY = null;
      let dMaxY = null;
      for (let y = fromY; y < toY; y++) {
        for (let x = fromX; x < toX; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] === 0) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (!officeSet.has((r << 16) | (g << 8) | b)) sprite++;
          if (r === fallbackFloor[0] && g === fallbackFloor[1] && b === fallbackFloor[2]) fallbackFloorHits++;
          if (matches(r, g, b, blockedRgb)) {
            blockedHits++;
            if (blockedMinPxY === null) blockedMinPxY = y;
            blockedMaxPxY = y;
          }
          if (matches(r, g, b, handoffRgb)) handoffHits++;
          if (isDlg(i)) {
            dialogueHits++;
            if (dMinX === null || x < dMinX) dMinX = x;
            if (dMaxX === null || x > dMaxX) dMaxX = x;
            if (dMinY === null) dMinY = y;
            dMaxY = y;
          }
        }
      }
      // Painted text: non-box pixels inside the box's bounding box, from its top
      // row down to (excluding) textAbove — state glyphs are drawn on top below it.
      let dialogueTextPx = 0;
      if (dMinY !== null) {
        const stopY = textAbove === null ? dMaxY + 1 : Math.min(dMaxY + 1, Math.round(textAbove * scale));
        for (let y = dMinY; y < stopY; y++) {
          for (let x = dMinX; x <= dMaxX; x++) {
            if (!isDlg((y * canvas.width + x) * 4)) dialogueTextPx++;
          }
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        scale,
        sprite,
        fallbackFloorHits,
        blockedHits,
        handoffHits,
        // Back into the engine's own unzoomed grid coordinates.
        blockedMinY: blockedMinPxY === null ? null : blockedMinPxY / scale,
        blockedMaxY: blockedMaxPxY === null ? null : blockedMaxPxY / scale,
        dialogueHits,
        dialogueMinX: dMinX === null ? null : dMinX / scale,
        dialogueMaxX: dMaxX === null ? null : dMaxX / scale,
        dialogueMinY: dMinY === null ? null : dMinY / scale,
        dialogueMaxY: dMaxY === null ? null : dMaxY / scale,
        dialogueTextPx,
      };
    },
    {
      office: [...OFFICE_COLORS],
      fallbackFloor: FALLBACK_FLOOR_RGB,
      blocked: BLOCKED_COLORS,
      handoff: HANDOFF_COLORS,
      dialogueBox: DIALOGUE_BOX_COLOR,
      mapW: MAP_W,
      mapH: MAP_H,
      band: xRange,
      textAbove: textAboveY,
      rows: yRange,
    },
  );
}

/** Re-scans about every 50 ms until `predicate(scan)` holds or `timeoutMs`
 *  passes; returns the last scan either way. */
async function pollScan(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let scan = await scanCanvas(page);
  while (!predicate(scan) && Date.now() < deadline) {
    await sleep(50);
    scan = await scanCanvas(page);
  }
  return scan;
}

/** Pixels inside each unzoomed rect `{x, y, w, h}` whose colour is in `colors`. */
async function countColorsInRects(page, rects, colors) {
  return page.evaluate(
    ({ rects, colors, mapH }) => {
      const canvas = document.getElementById("office-canvas");
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const scale = canvas.height / mapH;
      const set = new Set(colors.map((hex) => parseInt(hex.slice(1), 16)));
      return rects.map((r) => {
        let n = 0;
        for (let y = Math.round(r.y * scale); y < Math.round((r.y + r.h) * scale); y++) {
          for (let x = Math.round(r.x * scale); x < Math.round((r.x + r.w) * scale); x++) {
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
            const i = (y * canvas.width + x) * 4;
            if (data[i + 3] !== 0 && set.has((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])) n++;
          }
        }
        return n;
      });
    },
    { rects, colors, mapH: MAP_H },
  );
}

/** requestAnimationFrame callbacks the page runs per second, measured over `ms`. */
async function measureFps(page, ms = 1000) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          if (now - start >= ms) return resolve((frames * 1000) / (now - start));
          frames++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

// ── near-black screenshot scan (05-31, G-05-P6) ───────────────────────────────
//
// The canvas checks above read the canvas; this reads the VIEWPORT, which is the
// only place the defect lived — a too-small canvas pinned top-left left the rest
// of the frame showing the host page's black background, and getImageData on the
// canvas cannot see that. pngjs is already a devDependency of
// packages/pixel-office (its sprite tooling), so it is resolved from there
// rather than added anywhere.
const { PNG } = createRequire(path.join(ROOT, "packages", "pixel-office", "package.json"))("pngjs");

/** A channel value at or below this counts as black for G-05-P6's purposes.
 *  No office sprite colour is anywhere near it (none has r+g+b < 60), and the
 *  footer's #cccccc text antialiases against WALL_COLOR's 58,58,92 — so any hit
 *  is genuinely unpainted page background. */
const NEAR_BLACK_MAX = 16;

/** Every near-black pixel in a full-viewport screenshot, plus the first one. */
async function scanViewportForBlack(page) {
  const png = PNG.sync.read(await page.screenshot());
  let count = 0;
  let first = null;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i] <= NEAR_BLACK_MAX && png.data[i + 1] <= NEAR_BLACK_MAX && png.data[i + 2] <= NEAR_BLACK_MAX) {
        count++;
        if (!first) first = { x, y };
      }
    }
  }
  return { count, first, width: png.width, height: png.height };
}

/** Frames the renderer needs to settle after an event lands (or after load). */
const RENDER_SETTLE_MS = 1500;

async function openOffice(page) {
  await page.goto(WEB_URL, { waitUntil: "load" });
  await page.waitForSelector("#office-canvas", { state: "attached", timeout: 15_000 });
  // Snapshot-on-connect + a few render frames.
  await sleep(RENDER_SETTLE_MS);
}

function assert(condition, message) {
  if (!condition) throw new Error(`TRUTH FAILED: ${message}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  assertHarnessOwnedTarget();

  // WR-06: never talk to a server this harness did not start — a reused dev
  // server may be wired to a developer's own append-only database.
  // ponytail: a listener appearing between this probe and the spawn (seconds) is not detected; fine for a manually run local harness.
  const taken = [];
  for (const port of [API_PORT, WEB_PORT]) if (await portTaken(port)) taken.push(port);
  if (taken.length > 0) {
    throw new Error(
      `refusing to reuse a server this harness did not start — port(s) ${taken.join(", ")} already accept connections.\n` +
        `A reused server may be connected to a developer's own append-only database (WR-06).\n` +
        `Nothing has been reset, started or written. Stop whatever holds the port(s) and re-run.`,
    );
  }

  // A clean store per run, with no destructive SQL anywhere in this harness:
  // `db:test:down` is the repo's own `docker compose down -v`, i.e. removal of
  // the TEST container's volume and nothing else. Row-level cleanup is not
  // available by design (0001_append_only_trigger.sql raises on UPDATE/DELETE,
  // 0003_no_truncate_trigger.sql on TRUNCATE) and unblocking it would subvert
  // the append-only guarantee the whole event store rests on.
  //
  // Blast radius, so a reader is not surprised: this also clears anything
  // apps/api's own vitest suite left in that container. Harmless — those suites
  // apply their own migrations and depend on no persisted state.
  log("resetting the test Postgres container (down -v, then up)...");
  await runToCompletion("pnpm", ["--filter", "api", "db:test:down"]);
  await runToCompletion("pnpm", ["--filter", "api", "db:test:up"]);

  const require = createRequire(path.join(ROOT, "apps", "api", "package.json"));
  const { Client } = require("pg");

  log("applying migrations (idempotent)...");
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  for (const file of ["0000_init.sql", "0001_append_only_trigger.sql", "0002_workers_table.sql", "0003_no_truncate_trigger.sql"]) {
    const sql = readFileSync(path.join(ROOT, "apps", "api", "drizzle", file), "utf8");
    try {
      await client.query(sql);
    } catch (err) {
      if (!/already exists/i.test(String(err?.message))) throw err;
    }
  }
  await client.end();

  // The dev server gets the SAME overridden URL the reset above operated on —
  // resetting one database and asserting against another would prove nothing.
  // The harness only ever talks to servers it started, enforced by the port
  // preflight at the top of main(); the empty-canvas assertion below stays as
  // a second line of defence.
  await startServer(`${API_URL}/health`, "apps/api dev server", () =>
    spawnBackground("pnpm", ["--filter", "api", "dev"], { ...apiEnv, DATABASE_URL: TEST_DATABASE_URL }),
  );
  await startServer(WEB_URL, "apps/web dev server", () =>
    spawnBackground("pnpm", ["--filter", "web", "exec", "vite", "--port", String(WEB_PORT), "--strictPort"], {}),
  );

  log("issuing a real worker credential via POST /admin/workers...");
  const credRes = await fetch(`${API_URL}/admin/workers`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bootstrap-secret": apiEnv.BOOTSTRAP_SECRET },
    body: JSON.stringify({ label: "live-proof" }),
  });
  if (credRes.status !== 201) throw new Error(`POST /admin/workers -> ${credRes.status} ${await credRes.text()}`);
  const { workerId, token } = await credRes.json();
  log(`worker credential issued (workerId ${workerId})`);

  const browser = await chromium.launch({ headless: true });
  try {
    // 1280x720 was already Playwright's implicit default; 05-31 states it, since
    // TRUTH 0 now asserts the literal display scale each documented OBS source
    // size must produce.
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("console", (m) => {
      if (m.type() === "error") log(`browser console error: ${m.text()}`);
    });

    // ── The office opens EMPTY, and stays open for the whole proof.
    // Every character asserted on below is therefore created by an event that
    // arrived over the LIVE relay, not folded in by the connect-time snapshot.
    // Without this assertion, posting after the open would prove nothing.
    await openOffice(page);
    const empty = await scanCanvas(page);
    log(`office open: canvas ${empty.width}x${empty.height} (scale ${empty.scale}) — sprite=${empty.sprite}`);
    assert(
      empty.sprite === 0,
      `the office was not empty when it opened (${empty.sprite} px in no office colour). Either the store was ` +
        `not reset, or the apps/api server on ${API_URL} is connected to a different database than this harness reset`,
    );

    // ── TRUTH 0 — the frame shows ONLY the office (05-21 G-05-1a, 05-31
    // G-05-P6): at each documented OBS source size the office is presented at
    // an integer scale >= MIN_DISPLAY_SCALE, drawn 1:1 in CSS with pixelated
    // scaling, centred, the attribution overlaying the bottom wall row, and not
    // one near-black pixel anywhere in the viewport. 1920x1080 is checked first
    // so the run ENDS back at 1280x720 and every later truth sees the viewport
    // it always has.
    const OBS_SIZES = [
      { w: 1920, h: 1080, obsScale: 6 },
      { w: 1280, h: 720, obsScale: 4 },
    ];
    const truth0 = [];
    for (const { w, h, obsScale } of OBS_SIZES) {
      // The same floor the host computes, restated from the engine's own
      // constants — with NO footer allowance, which is the whole of G-05-P6.
      const expected = Math.max(MIN_DISPLAY_SCALE, Math.floor(Math.min(w / MAP_W, h / MAP_H)));
      assert(
        expected === obsScale,
        `a ${w}x${h} OBS source must present the office at scale ${obsScale}, but the full-viewport floor gives ${expected}`,
      );

      await page.setViewportSize({ width: w, height: h });
      // The host resizes the backing store from a resize listener, and writing
      // canvas.width clears it — poll for the new size instead of assuming the
      // next frame has already landed.
      try {
        await page.waitForFunction(
          (want) => document.getElementById("office-canvas")?.width === want,
          MAP_W * expected,
          { timeout: 3000 },
        );
      } catch {
        const got = await page.evaluate(() => document.getElementById("office-canvas")?.width);
        assert(
          false,
          `at ${w}x${h} the canvas backing store never reached ${MAP_W * expected}px wide (scale ${expected}) — it is ${got}`,
        );
      }
      await sleep(RENDER_SETTLE_MS);

      const geom = await page.evaluate(() => {
        const canvas = document.getElementById("office-canvas");
        const footer = document.querySelector("footer");
        const c = canvas.getBoundingClientRect();
        const f = footer?.getBoundingClientRect();
        return {
          w: canvas.width,
          h: canvas.height,
          cssW: c.width,
          cssH: c.height,
          left: c.left,
          top: c.top,
          bottom: c.bottom,
          rendering: getComputedStyle(canvas).imageRendering,
          footer: f ? { top: f.top, bottom: f.bottom } : null,
          footerText: footer?.textContent ?? "",
          viewW: window.innerWidth,
          viewH: window.innerHeight,
        };
      });
      const scale = geom.w / MAP_W;
      const where =
        `at ${w}x${h}: backing ${geom.w}x${geom.h}, CSS box ${geom.cssW}x${geom.cssH} at (${geom.left},${geom.top}), ` +
        `image-rendering ${geom.rendering}`;

      // 05-21, kept verbatim in intent: integer scale, CSS box == backing store,
      // pixelated.
      assert(
        Number.isInteger(scale) && scale >= MIN_DISPLAY_SCALE,
        `display scale ${scale} is not an integer >= MIN_DISPLAY_SCALE ${MIN_DISPLAY_SCALE} (${where})`,
      );
      assert(scale === expected, `display scale ${scale} is not the expected ${expected} (${where})`);
      assert(geom.h === MAP_H * expected, `backing height ${geom.h} is not ${MAP_H} x ${expected} (${where})`);
      assert(
        Math.abs(geom.cssW - geom.w) <= 0.5 && Math.abs(geom.cssH - geom.h) <= 0.5,
        `the canvas CSS box does not equal its backing store (${where})`,
      );
      assert(geom.rendering === "pixelated", `canvas image-rendering is not pixelated (${where})`);

      // 05-31: the remainder is split evenly, so the surround reads as a border
      // rather than the canvas being pinned to one corner.
      assert(
        Math.abs(geom.left - (geom.viewW - geom.cssW) / 2) <= 0.5,
        `the office is not horizontally centred — left ${geom.left}, expected ${(geom.viewW - geom.cssW) / 2} (${where})`,
      );
      assert(
        Math.abs(geom.top - (geom.viewH - geom.cssH) / 2) <= 0.5,
        `the office is not vertically centred — top ${geom.top}, expected ${(geom.viewH - geom.cssH) / 2} (${where})`,
      );

      // OFFICE-02 / SC4: the credit is still on screen, and it sits over the
      // office's bottom wall row (one tile tall at this scale) plus whatever
      // remainder strip is below it — never over the floor.
      assert(geom.footer !== null, `no attribution <footer> is in the DOM (${where})`);
      const bandTop = geom.bottom - TILE_SIZE * scale;
      assert(
        geom.footer.top >= bandTop - 0.5 && geom.footer.bottom <= geom.viewH + 0.5,
        `the attribution footer (${geom.footer.top}..${geom.footer.bottom}) is outside the bottom wall row and remainder ` +
          `(${bandTop}..${geom.viewH}) (${where})`,
      );
      assert(
        geom.footerText.includes("pixel-agents-hq/pixel-agents"),
        `the attribution footer does not name the fork it credits (${where})`,
      );

      // The defect itself: any unpainted host-page background left in the frame.
      const black = await scanViewportForBlack(page);
      assert(
        black.count === 0,
        `${black.count} near-black px (every channel <= ${NEAR_BLACK_MAX}) in the ${black.width}x${black.height} viewport ` +
          `screenshot, first at x=${black.first?.x},y=${black.first?.y} — the frame is not only the office (${where})`,
      );

      await shot(page, `viewport-${w}x${h}.png`);
      truth0.push(`${w}x${h}: scale ${scale} (backing ${geom.w}x${geom.h})`);
    }
    log(`TRUTH 0 PASS — ${truth0.join(", ")}; centred, pixelated, CSS box == backing store, credit on the bottom wall, 0 near-black px`);

    // ── TRUTH 6 — the office is furnished (05-26, G-05-1e): (a) the bare grey
    // floor is gone; (b) every desk paints at its layout rectangle, placed by
    // officeLayout.ts's rule (centred in its footprint, bottom-aligned, dy).
    assert(
      empty.fallbackFloorHits === 0,
      `${empty.fallbackFloorHits} px of FALLBACK_FLOOR_COLOR ${FALLBACK_FLOOR_COLOR} painted — the bare grey floor is still showing`,
    );
    const deskSprite = OFFICE_SPRITES.desk.data;
    const deskColors = [...collectColors(deskSprite)];
    const deskOpaque = deskSprite.flat().filter(Boolean).length;
    const deskMinPx = Math.ceil((deskOpaque * empty.scale * empty.scale) / 2);
    // 05-33 generalised this placement arithmetic into FURNITURE_RECTS, so the
    // rects TRUTH 6 measures and the rects TRUTH 5 keeps the bubble off are
    // computed once, from officeLayout.ts's one rule.
    const deskRects = FURNITURE_RECTS.filter((r) => r.sprite === "desk");
    const deskCounts = await countColorsInRects(page, deskRects, deskColors);
    assert(deskRects.length > 0, `office-layout.json places no desk`);
    deskRects.forEach((r, i) =>
      assert(
        deskCounts[i] >= deskMinPx,
        `desk at (${r.col},${r.row}) paints ${deskCounts[i]} desk-colour px in its rectangle ` +
          `${JSON.stringify({ x: r.x, y: r.y, w: r.w, h: r.h })}, fewer than half its ${deskOpaque} opaque cells x scale^2 (${deskMinPx})`,
      ),
    );
    await shot(page, "empty.png");
    log(`TRUTH 6 PASS — furnished office: ${deskRects.length} desks, 0 bare-floor px (desk px ${deskCounts.join("/")} >= ${deskMinPx})`);

    // ── Baseline: two real agents materialised by real task.status_changed
    // events posted while the page was already open, both actively working
    // (no bubble on either of them).
    claimDesk(SENDER);
    claimDesk(BLOCKED);
    await postEvent(token, statusChanged(SENDER, HANDOFF_TASK, "running"));
    await postEvent(token, statusChanged(BLOCKED, "live-proof-task-blocked", "running"));
    await sleep(RENDER_SETTLE_MS);

    const baseline = await scanCanvas(page);
    log(`baseline canvas ${baseline.width}x${baseline.height}: sprite=${baseline.sprite} blocked=${baseline.blockedHits} handoff=${baseline.handoffHits} dialogue=${baseline.dialogueHits}`);

    // TRUTH 1 — a real agent renders as a real, non-transparent sprite, and
    // it got there LIVE: the canvas was proven empty above, and no navigation
    // happened between these posts and this scan.
    assert(
      baseline.sprite > 0,
      `no pixel in a non-office colour found on the canvas — the sprite never painted (sprite pixel count 0)`,
    );
    // The baseline must be clean, otherwise truths 2 and 3 could pass on
    // leftover pixels instead of on this run's events.
    assert(baseline.blockedHits === 0, `blocked-bubble colour already on canvas before the blocked event (${baseline.blockedHits} px)`);
    assert(baseline.handoffHits === 0, `handoff-bubble colour already on canvas before the handoff event (${baseline.handoffHits} px)`);
    assert(baseline.dialogueHits === 0, `dialogue-box colour already on canvas before the handoff event (${baseline.dialogueHits} px)`);
    log(`TRUTH 1 PASS — ${baseline.sprite} sprite pixels painted from live events on an already-open page`);

    // ── TRUTH 2 — a blocked agent's status bubble is really painted, live.
    // The property being proven: a CONNECTED client re-derives AgentStatus
    // from a relayed task.status_changed with no navigation. That is
    // 05-VERIFICATION.md's headline gap and the first of its human-verification
    // items; the 05-08 proof routed around it by reloading the page.
    await postEvent(token, statusChanged(BLOCKED, "live-proof-task-blocked", "blocked"));
    await sleep(RENDER_SETTLE_MS);
    const blockedScan = await scanCanvas(page);
    log(`after blocked: sprite=${blockedScan.sprite} blocked=${blockedScan.blockedHits} handoff=${blockedScan.handoffHits}`);
    assert(
      blockedScan.blockedHits > 0,
      `bubble-blocked's distinctive colour(s) ${BLOCKED_COLORS.join(", ")} never appeared on canvas (0 px)`,
    );
    await shot(page, "states.png");
    log(`TRUTH 2 PASS — ${blockedScan.blockedHits} blocked-bubble pixels, no navigation between the event and the scan`);

    // ── TRUTH 3 — a real handoff pair paints the task icon, then clears it.
    // The RECEIVER is deliberately not pre-seeded: the reducer's
    // agent.handoff_requested handler upserts it and App.tsx applies that
    // upsert before calling the choreography, so the receiving character is
    // created by the handoff event itself. handoff-choreography.ts's
    // `if (!fromChar || !toChar) return;` guard means a painted task icon is
    // itself proof that both characters exist — including the one this event
    // just created.
    const receiverDesk = claimDesk(RECEIVER);
    const receiverBand = tileColumnRange(receiverDesk.col);
    const beforeHandoff = await scanCanvas(page, receiverBand);
    assert(
      beforeHandoff.sprite === 0,
      `the receiver's desk column (col ${receiverDesk.col}, x ${receiverBand.from}..${receiverBand.to}) already ` +
        `carried ${beforeHandoff.sprite} sprite px before the handoff — Truth 3 would be assuming live receiver ` +
        `creation rather than demonstrating it`,
    );
    // Where the sender will wait, and therefore how long the walk can take —
    // resolved BEFORE the post so the icon poll has a real deadline instead of
    // 05-08's fixed sleep (05-34, G-05-P2: the aisle slot is two rows off the
    // seat row, so a one-desk-gap sleep no longer covers the walk).
    const senderHome = claimDesk(SENDER);
    const othersSeats = new Set(
      [...deskSlots.keys()].filter((id) => id !== SENDER).map((id) => `${claimDesk(id).col},${claimDesk(id).row}`),
    );
    const senderTile = interactionTile(receiverDesk, othersSeats);
    assert(
      senderTile !== null,
      `no interaction slot free on aisle row ${LAYOUT.interaction.row} for the receiver's home ` +
        `(${receiverDesk.col},${receiverDesk.row})`,
    );
    /** Walk budget: the Manhattan run to the slot plus 6 tiles of detour around
     *  occupied seats and the desk rows (walks avoid both, 05-27). */
    const walkMs =
      ((Math.abs(senderTile.col - senderHome.col) + Math.abs(senderTile.row - senderHome.row) + 6) * TILE_SIZE * 1000) /
      WALK_SPEED_PX_PER_SEC;

    await postEvent(token, {
      type: "agent.handoff_requested",
      taskId: HANDOFF_TASK,
      sourceAgentId: SENDER,
      payload: { taskId: HANDOFF_TASK, fromAgentId: SENDER, toAgentId: RECEIVER },
    });
    const handoffScan = await pollScan(page, (s) => s.handoffHits > 0, walkMs + RENDER_SETTLE_MS);
    log(`after handoff_requested: sprite=${handoffScan.sprite} blocked=${handoffScan.blockedHits} handoff=${handoffScan.handoffHits}`);
    assert(
      handoffScan.handoffHits > 0,
      `bubble-handoff-task's distinctive colour(s) ${HANDOFF_COLORS.join(", ")} never appeared on canvas during the ` +
        `walk to (${senderTile.col},${senderTile.row}) within ${Math.round(walkMs + RENDER_SETTLE_MS)} ms (0 px)`,
    );

    // TRUTH 5 (during) — the sender stands on the receiver's fixed aisle slot
    // (05-34, G-05-P2, superseding 05-27's tile beside the receiver) in its
    // own status pose (TYPE for this running, so CODING, sender; 05-19) and
    // speaks the requested line. No task.created is posted and the
    // receiver has no name, so the line interpolates the raw 23-char task id
    // and 19-char agent id — both over 05-13's caps: the pixels counted are a
    // capped line.
    // 05-33 (G-05-P1) rebases this on the candidate placement rule, superseding
    // 05-28's fixed band under the pair's feet: the bubble is wherever the
    // frame's obstacles allow, so what is asserted is the PROPERTY — inside the
    // floor interior, carrying text, with no state glyph painted over it, off
    // every furniture rect, and within tail reach of its speaker.
    // The fill-colour extent is the bubble's interior (the 1 px ink border and
    // tail paint over the fill), so non-fill px inside it are the text, and the
    // box itself is one px larger on every side.
    /** Longest any 05-33 candidate's tail can be: the "above" candidate clears
     *  the whole glyph band (GLYPH_ROWS 13 + BUBBLE_ICON_GAP_PX 1) plus the
     *  DIALOGUE_TAIL_PX gap, then 2 px of slack for the interior inset. */
    const TAIL_REACH_PX = 18;
    /** A character's sprite box on a tile, un-offset (a seated agent sits
     *  CHARACTER_SITTING_OFFSET_PX lower, so this is the looser of the two). */
    const spriteBoxAt = (tile) => ({
      x: tile.col * TILE_SIZE,
      y: spriteTopY(tile.row),
      w: TILE_SIZE,
      h: tile.row * TILE_SIZE + TILE_SIZE / 2 - spriteTopY(tile.row),
    });
    const assertBubble = async (scan, label, speakerTile) => {
      const px = 1 / scan.scale;
      const box = {
        x: scan.dialogueMinX - 1,
        y: scan.dialogueMinY - 1,
        w: scan.dialogueMaxX - scan.dialogueMinX + px + 2,
        h: scan.dialogueMaxY - scan.dialogueMinY + px + 2,
      };
      const sprite = spriteBoxAt(speakerTile);
      const where =
        `${label}: ${scan.dialogueHits} bubble px + ${scan.dialogueTextPx} text px, box x ${box.x}..${box.x + box.w}, ` +
        `y ${box.y}..${box.y + box.h}; speaker tile (${speakerTile.col},${speakerTile.row}) sprite ` +
        `x ${sprite.x}..${sprite.x + sprite.w}, y ${sprite.y}..${sprite.y + sprite.h}`;
      assert(scan.dialogueHits > 0, `no ${DIALOGUE_BOX_COLOR} bubble px on canvas: ${where}`);
      assert(
        box.x >= FLOOR.left && box.x + box.w <= FLOOR.right && box.y >= FLOOR.top && box.y + box.h <= FLOOR.bottom,
        `bubble leaves the floor interior (x ${FLOOR.left}..${FLOOR.right}, y ${FLOOR.top}..${FLOOR.bottom}): ${where}`,
      );
      assert(scan.dialogueTextPx > 0, `no text px inside the bubble: ${where}`);
      // Glyphs are the top pass, so a glyph colour anywhere in the box means a
      // state signal is painted over the line — exactly what G-05-P1 forbids.
      const [glyphPx] = await countColorsInRects(page, [box], [...BLOCKED_COLORS, ...HANDOFF_COLORS, ...WAITING_COLORS]);
      assert(glyphPx === 0, `${glyphPx} state-glyph px inside the bubble box: ${where}`);
      const hit = FURNITURE_RECTS.find(
        (r) => box.x < r.x + r.w && r.x < box.x + box.w && box.y < r.y + r.h && r.y < box.y + box.h,
      );
      assert(
        !hit,
        `bubble covers ${hit?.sprite} at (${hit?.col},${hit?.row}) ` +
          `${JSON.stringify(hit && { x: hit.x, y: hit.y, w: hit.w, h: hit.h })}, and this scene has a clear placement: ${where}`,
      );
      const dx = Math.max(0, box.x - (sprite.x + sprite.w), sprite.x - (box.x + box.w));
      const dy = Math.max(0, box.y - (sprite.y + sprite.h), sprite.y - (box.y + box.h));
      assert(
        Math.max(dx, dy) <= TAIL_REACH_PX,
        `bubble is ${dx} px across / ${dy} px away from its speaker, beyond the ${TAIL_REACH_PX} px tail reach: ${where}`,
      );
      return where;
    };
    const dlg = await scanCanvas(page);
    await shot(page, "handoff.png");
    const dlgWhere = await assertBubble(dlg, "requested", senderTile);
    log(`TRUTH 5 (during) PASS — ${dlgWhere}`);

    // TRUTH 5 (sender visible) — 05-34 (G-05-P2), rebasing 05-27 (G-05-1d):
    // the sender waits on the receiver's fixed aisle slot, two rows clear of
    // every seat, so its full sprite sits in its own tile column with nobody
    // beside it (the UAT defect left 22% of the sender visible; the seat-row
    // tile it replaces left only 2 px between shoulders).
    // Only the standing sprite's own rows: the glyph and dialogue above it are not the body.
    const senderRows = { from: spriteTopY(senderTile.row), to: spriteTopY(senderTile.row) + SPRITE_HEIGHT };
    const senderBandScan = await scanCanvas(page, tileColumnRange(senderTile.col), null, senderRows);
    const receiverBandScan = await scanCanvas(page, tileColumnRange(receiverDesk.col));
    const senderMinPx = Math.ceil(0.8 * MIN_FRAME_OPAQUE * dlg.scale * dlg.scale);
    const visibleWhere =
      `sender (${senderTile.col},${senderTile.row}) ${senderBandScan.sprite} agent px (need >= ${senderMinPx}), ` +
      `receiver (${receiverDesk.col},${receiverDesk.row}) ${receiverBandScan.sprite} agent px`;
    assert(senderBandScan.sprite >= senderMinPx, `the waiting sender's sprite is not fully visible: ${visibleWhere}`);
    assert(receiverBandScan.sprite > 0, `the receiver's column holds no agent px: ${visibleWhere}`);
    log(`TRUTH 5 (sender visible) PASS — ${visibleWhere}`);

    await postEvent(token, {
      type: "agent.handoff_completed",
      taskId: HANDOFF_TASK,
      sourceAgentId: RECEIVER,
      payload: { taskId: HANDOFF_TASK, toAgentId: RECEIVER },
    });
    // The sender walks home from its interaction tile; +2 tiles for the detour
    // around occupied seats on the way (05-27: walks avoid other agents).
    const walkHomeMs =
      ((Math.abs(senderHome.col - senderTile.col) + Math.abs(senderHome.row - senderTile.row) + 2) * TILE_SIZE * 1000) /
      WALK_SPEED_PX_PER_SEC;
    const handoffEndDeadlineMs = walkHomeMs + RENDER_SETTLE_MS;
    // Icon gone = the completion was processed, so these px are the accepted
    // line, never the requested line still painted before the event landed.
    const acceptedScan = await pollScan(page, (s) => s.handoffHits === 0 && s.dialogueHits > 0, handoffEndDeadlineMs);
    assert(
      acceptedScan.handoffHits === 0 && acceptedScan.dialogueHits > 0,
      `WR-10: the receiver's accepted line was never painted after agent.handoff_completed ` +
        `(0 dialogue-box px within ${Math.round(handoffEndDeadlineMs)} ms)`,
    );
    log(`TRUTH 5 (accepted) PASS — ${await assertBubble(acceptedScan, "accepted", receiverDesk)}`);
    const clearedScan = await pollScan(
      page,
      (s) => s.dialogueHits === 0 && s.handoffHits === 0,
      handoffEndDeadlineMs,
    );
    log(`after handoff_completed: sprite=${clearedScan.sprite} blocked=${clearedScan.blockedHits} handoff=${clearedScan.handoffHits}`);
    assert(
      clearedScan.handoffHits === 0,
      `handoff task icon never cleared after agent.handoff_completed (${clearedScan.handoffHits} px still painted)`,
    );
    log(`TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion`);
    // TRUTH 5 (after) — the sender is home, so the accepted line is cleared too.
    assert(
      clearedScan.dialogueHits === 0,
      `${clearedScan.dialogueHits} dialogue-box px still painted after the handoff sequence ended (sender home)`,
    );
    log(
      `TRUTH 5 PASS — ${dlgWhere}; cleared after the sequence`,
    );

    // ── TRUTH 4 — the blocked glyph belongs to the agent it describes (CR-02).
    // 05-VERIFICATION.md reproduced this defect in a throwaway vitest against a
    // recording ctx; this carries the regression guard on the office's own
    // composited canvas. Against the 05-08 code the first two assertions below
    // went red: the clamp collapsed every early desk row's glyph onto y=0,
    // inside the sprite of the agent in front.
    //
    // Seat the cohort until the first pod-row-2 seat directly behind an
    // already-occupied pod-row-1 seat is taken (computed from the layout; the
    // cohort starts at whatever slot truths 1-3 left free).
    const podRows = [...new Set(LAYOUT.seats.map(([, row]) => row))].sort((a, b) => a - b);
    const occupiedFront = new Map();
    for (const [id, slot] of deskSlots) {
      const d = deskPosition(slot);
      if (d.row === podRows[0]) occupiedFront.set(d.col, id);
    }
    const targetSlot = SPOTS.findIndex((s, i) => i < LAYOUT.seats.length && s.row === podRows[1] && occupiedFront.has(s.col));
    assert(targetSlot >= nextDeskSlot, `no free pod-row-2 seat sits behind an occupied pod-row-1 seat (from slot ${nextDeskSlot})`);
    const cohort = Array.from({ length: targetSlot - nextDeskSlot + 1 }, (_, n) => `live-proof-seat-${String(n).padStart(2, "0")}`);
    const cohortDesks = cohort.map((id) => claimDesk(id));
    for (const agentId of cohort) {
      await postEvent(token, statusChanged(agentId, `live-proof-task-${agentId}`, "running"));
    }
    await sleep(RENDER_SETTLE_MS);

    const targetDesk = cohortDesks[cohortDesks.length - 1];
    const targetId = cohort[cohort.length - 1];
    const frontId = occupiedFront.get(targetDesk.col);
    const firstDesk = claimDesk(frontId);

    // ── TRUTH 7 — frame rate with the whole cohort on the floor (05-26): the
    // heaviest live scene, drawn through 05-24's per-(sprite, zoom) cache.
    const fps = await measureFps(page);
    assert(fps >= 30, `only ${fps.toFixed(1)} animation frames per second with ${deskSlots.size} agents on the floor (need >= 30)`);
    log(`TRUTH 7 PASS — ${fps.toFixed(1)} fps with ${deskSlots.size} agents on the floor`);

    await postEvent(token, statusChanged(targetId, `live-proof-task-${targetId}`, "blocked"));
    await sleep(RENDER_SETTLE_MS);

    // Measure inside the target's OWN tile column. scanCanvas over the whole
    // canvas would also pick up the Truth 2 agent, which is still blocked on
    // the FIRST desk row — its glyph sits in exactly the band assertion 1
    // excludes, so a global assertion would fail on every run.
    const targetBand = tileColumnRange(targetDesk.col);
    const bandScan = await scanCanvas(page, targetBand);
    await shot(page, "cohort.png");
    // The front agent rests at its own desk, so it sits CHARACTER_SITTING_OFFSET_PX
    // lower (05-32 / G-05-P3 — since this plan that holds for every resting
    // status, not only the TYPE pose this agent happens to be in).
    const firstRowSpriteBottom = spriteTopY(firstDesk.row) + SPRITE_HEIGHT + CHARACTER_SITTING_OFFSET_PX;
    // The blocked owner SITS at its own seat: it is resting, not walking, so it
    // is sunk by CHARACTER_SITTING_OFFSET_PX while keeping its IDLE frame
    // (down[1]) — 05-32 / G-05-P3, superseding 05-25's TYPE-only sitting rule.
    // Its visible head starts at that frame's first opaque row (05-30,
    // G-05-1c: glyphs anchor on the head, so the glyph follows the seated head).
    const headRow = CHARACTER_SHEET.down[1].findIndex((r) => r.some((c) => c));
    const headTop = spriteTopY(targetDesk.row) + CHARACTER_SITTING_OFFSET_PX + headRow;
    const headGap = bandScan.blockedMaxY === null ? null : headTop - (bandScan.blockedMaxY + 1);
    log(
      `blocked glyph in col ${targetDesk.col} (x ${targetBand.from}..${targetBand.to}): ` +
        `${bandScan.blockedHits} px, y ${bandScan.blockedMinY}..${bandScan.blockedMaxY}, ` +
        `head top ${headTop}, gap ${headGap} (front sprite ends at ${firstRowSpriteBottom})`,
    );

    assert(
      bandScan.blockedHits > 0,
      `no blocked-glyph pixel in the blocked agent's own column band (col ${targetDesk.col}, x ` +
        `${targetBand.from}..${targetBand.to}) — the band assertions below would pass vacuously`,
    );
    assert(
      bandScan.blockedMinY > firstRowSpriteBottom,
      `the blocked glyph reaches up into the agent seated in front of its owner: measured y ` +
        `${bandScan.blockedMinY}..${bandScan.blockedMaxY} in col ${targetDesk.col}, but ${frontId}'s seated ` +
        `sprite at (${firstDesk.col},${firstDesk.row}) ends at y ${firstRowSpriteBottom} — the glyph must sit strictly below it (CR-02)`,
    );
    assert(
      bandScan.blockedMaxY < headTop && headGap <= 2,
      `the blocked glyph is not attached to its owner's head: measured y ${bandScan.blockedMinY}..${bandScan.blockedMaxY} ` +
        `in col ${targetDesk.col}, head top ${headTop}, gap ${headGap} (need 0..2, G-05-1c)`,
    );
    assert(
      bandScan.blockedMinY >= TILE_SIZE,
      `the blocked glyph straddles the wall: top y ${bandScan.blockedMinY} < ${TILE_SIZE} (G-05-1c)`,
    );
    log(
      `TRUTH 4 PASS — ${bandScan.blockedHits} blocked-glyph px at y ${bandScan.blockedMinY}..${bandScan.blockedMaxY}, ` +
        `${headGap} px above ${targetId}'s head (top ${headTop}), on the floor, below ${frontId} (ends ${firstRowSpriteBottom})`,
    );
  } finally {
    await browser.close();
  }

  // The test Postgres container is deliberately left running (matching
  // 05-01/05-04's documented choice) — `pnpm --filter api db:test:down`.
  console.log("LIVE PROOF: PASS");
}

main()
  .catch((err) => {
    console.error(`\n[live-proof] ${err?.stack ?? err}`);
    process.exitCode = 1;
  })
  .finally(() => {
    killChildren();
    // Give taskkill a beat before the event loop drains.
    setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
  });
