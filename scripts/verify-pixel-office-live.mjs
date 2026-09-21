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
// T-05-26 (accepted, low): this script reads secrets from the local, already
// gitignored apps/api/.env and sends them only to the localhost dev server it
// just started. No secret is ever printed to stdout.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
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
const DESK_ROW_START = readNumberConst(officeIndexSrc, "index.ts", "DESK_ROW_START");
const DESK_ROW_PITCH = readNumberConst(officeIndexSrc, "index.ts", "DESK_ROW_PITCH");
const INTERIOR_COLS = DEFAULT_COLS - 2;
const MAP_W = DEFAULT_COLS * TILE_SIZE;
const MAP_H = DEFAULT_ROWS * TILE_SIZE;

/** `nextDeskPosition()`'s formula (packages/pixel-office/src/index.ts). */
function deskPosition(slot) {
  const row = DESK_ROW_START + DESK_ROW_PITCH * Math.floor(slot / INTERIOR_COLS);
  return { col: 1 + (slot % INTERIOR_COLS), row: Math.min(row, DEFAULT_ROWS - 2) };
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

/** A tile column's x-range in unzoomed canvas px. A glyph is 11 wide and its
 *  owner's sprite 16, so a centred glyph is always inside its own column. */
const tileColumnRange = (col) => ({ from: col * TILE_SIZE, to: (col + 1) * TILE_SIZE });

// Sprite height comes from the decoded sheet itself, so a re-decode with
// different frame geometry moves the band assertions with it rather than
// silently invalidating them.
const SPRITE_HEIGHT = JSON.parse(readFileSync(path.join(SPRITE_DIR, "character-metrocity.json"), "utf8")).down[0].length;

/** Top edge of a character's sprite box on a given interior row, unzoomed —
 *  `renderScene`'s bottom-centre anchor: tile centre minus the sprite height.
 *  (A TYPE-posed character sits CHARACTER_SITTING_OFFSET_PX lower; the bounds
 *  below deliberately use the un-offset anchor, which is the desk row's own
 *  geometry rather than one pose's.) */
const spriteTopY = (row) => row * TILE_SIZE + TILE_SIZE / 2 - SPRITE_HEIGHT;
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const FLOOR_RGB = hexToRgb(readColorConst("FALLBACK_FLOOR_COLOR"));
const WALL_RGB = hexToRgb(readColorConst("WALL_COLOR"));

/** Every colour any character sprite frame can paint. */
function characterColors() {
  const data = JSON.parse(readFileSync(path.join(SPRITE_DIR, "character-metrocity.json"), "utf8"));
  const set = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      if (v) set.add(v.toLowerCase());
    } else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(data.down);
  walk(data.up);
  walk(data.right);
  return set;
}

/**
 * The colours a bubble asset paints that NO character sprite pixel can —
 * read from the asset at run time (never hardcoded, so it can't drift from
 * whatever 05-07 actually authored). A hit on one of these is unambiguous
 * proof the bubble itself was painted, not the character underneath it.
 */
function distinctiveBubbleColors(assetFile, charColors) {
  const json = JSON.parse(readFileSync(path.join(SPRITE_DIR, assetFile), "utf8"));
  const found = new Set();
  for (const row of json.pixels) {
    for (const cell of row) {
      if (!cell) continue;
      const hex = (json.palette[cell] ?? "").toLowerCase();
      if (hex && !charColors.has(hex)) found.add(hex);
    }
  }
  if (found.size === 0) throw new Error(`${assetFile} shares every colour with the character sprite — no distinctive signal`);
  return [...found];
}

const charColors = characterColors();
const BLOCKED_COLORS = distinctiveBubbleColors("bubble-blocked.json", charColors);
const HANDOFF_COLORS = distinctiveBubbleColors("bubble-handoff-task.json", charColors);

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

/** Starts a dev server only if one isn't already serving that URL. */
async function ensureServer(url, label, start) {
  if (await reachable(url)) {
    log(`${label} already running at ${url} — reusing it`);
    return;
  }
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
 * always expressed in the engine's own grid coordinates.
 *
 * `blockedMinY`/`blockedMaxY` report the vertical extent of the blocked-glyph
 * pixels found inside the band (null when there are none), which is what turns
 * "a blocked glyph was painted somewhere" into "it was painted on this agent".
 */
async function scanCanvas(page, xRange = null) {
  return page.evaluate(
    ({ floor, wall, blocked, handoff, mapW, mapH, band }) => {
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
      const blockedRgb = blocked.map(toRgb);
      const handoffRgb = handoff.map(toRgb);
      const matches = (r, g, b, list) => list.some((c) => c[0] === r && c[1] === g && c[2] === b);

      const fromX = band ? Math.round(band.from * scale) : 0;
      const toX = band ? Math.min(Math.round(band.to * scale), canvas.width) : canvas.width;

      let sprite = 0;
      let blockedHits = 0;
      let handoffHits = 0;
      let blockedMinPxY = null;
      let blockedMaxPxY = null;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = fromX; x < toX; x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] === 0) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const isFloor = r === floor[0] && g === floor[1] && b === floor[2];
          const isWall = r === wall[0] && g === wall[1] && b === wall[2];
          if (!isFloor && !isWall) sprite++;
          if (matches(r, g, b, blockedRgb)) {
            blockedHits++;
            if (blockedMinPxY === null) blockedMinPxY = y;
            blockedMaxPxY = y;
          }
          if (matches(r, g, b, handoffRgb)) handoffHits++;
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        scale,
        sprite,
        blockedHits,
        handoffHits,
        // Back into the engine's own unzoomed grid coordinates.
        blockedMinY: blockedMinPxY === null ? null : blockedMinPxY / scale,
        blockedMaxY: blockedMaxPxY === null ? null : blockedMaxPxY / scale,
      };
    },
    {
      floor: FLOOR_RGB,
      wall: WALL_RGB,
      blocked: BLOCKED_COLORS,
      handoff: HANDOFF_COLORS,
      mapW: MAP_W,
      mapH: MAP_H,
      band: xRange,
    },
  );
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
  // (If a dev server is ALREADY serving this port, ensureServer reuses it; a
  // reused server pointed at some other database shows up immediately as a
  // non-empty office at the empty-canvas assertion below, not as a silent pass.)
  await ensureServer(`${API_URL}/health`, "apps/api dev server", () =>
    spawnBackground("pnpm", ["--filter", "api", "dev"], { ...apiEnv, DATABASE_URL: TEST_DATABASE_URL }),
  );
  await ensureServer(WEB_URL, "apps/web dev server", () =>
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
    const page = await browser.newPage();
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
      `the office was not empty when it opened (${empty.sprite} non-floor/non-wall px). Either the store was ` +
        `not reset, or the apps/api server on ${API_URL} is connected to a different database than this harness reset`,
    );

    // ── Baseline: two real agents materialised by real task.status_changed
    // events posted while the page was already open, both actively working
    // (no bubble on either of them).
    claimDesk(SENDER);
    claimDesk(BLOCKED);
    await postEvent(token, statusChanged(SENDER, HANDOFF_TASK, "running"));
    await postEvent(token, statusChanged(BLOCKED, "live-proof-task-blocked", "running"));
    await sleep(RENDER_SETTLE_MS);

    const baseline = await scanCanvas(page);
    log(`baseline canvas ${baseline.width}x${baseline.height}: sprite=${baseline.sprite} blocked=${baseline.blockedHits} handoff=${baseline.handoffHits}`);

    // TRUTH 1 — a real agent renders as a real, non-transparent sprite, and
    // it got there LIVE: the canvas was proven empty above, and no navigation
    // happened between these posts and this scan.
    assert(
      baseline.sprite > 0,
      `no non-floor/non-wall pixel found on the canvas — the sprite never painted (sprite pixel count 0)`,
    );
    // The baseline must be clean, otherwise truths 2 and 3 could pass on
    // leftover pixels instead of on this run's events.
    assert(baseline.blockedHits === 0, `blocked-bubble colour already on canvas before the blocked event (${baseline.blockedHits} px)`);
    assert(baseline.handoffHits === 0, `handoff-bubble colour already on canvas before the handoff event (${baseline.handoffHits} px)`);
    log(`TRUTH 1 PASS — ${baseline.sprite} sprite pixels painted from live events on an already-open page`);

    // ── TRUTH 2 — a blocked agent's status bubble is really painted, live.
    // The property being proven: a CONNECTED client re-derives AgentStatus
    // from a relayed task.status_changed with no navigation. That is
    // 05-VERIFICATION.md's headline gap and the first of its human-verification
    // items; the 05-08 proof routed around it with a page reload.
    await postEvent(token, statusChanged(BLOCKED, "live-proof-task-blocked", "blocked"));
    await sleep(RENDER_SETTLE_MS);
    const blockedScan = await scanCanvas(page);
    log(`after blocked: sprite=${blockedScan.sprite} blocked=${blockedScan.blockedHits} handoff=${blockedScan.handoffHits}`);
    assert(
      blockedScan.blockedHits > 0,
      `bubble-blocked's distinctive colour(s) ${BLOCKED_COLORS.join(", ")} never appeared on canvas (0 px)`,
    );
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
    await postEvent(token, {
      type: "agent.handoff_requested",
      taskId: HANDOFF_TASK,
      sourceAgentId: SENDER,
      payload: { taskId: HANDOFF_TASK, fromAgentId: SENDER, toAgentId: RECEIVER },
    });
    await sleep(2500); // walk-and-arrive FSM (WALK_SPEED_PX_PER_SEC over one desk gap)
    const handoffScan = await scanCanvas(page);
    log(`after handoff_requested: sprite=${handoffScan.sprite} blocked=${handoffScan.blockedHits} handoff=${handoffScan.handoffHits}`);
    assert(
      handoffScan.handoffHits > 0,
      `bubble-handoff-task's distinctive colour(s) ${HANDOFF_COLORS.join(", ")} never appeared on canvas during the walk (0 px)`,
    );

    await postEvent(token, {
      type: "agent.handoff_completed",
      taskId: HANDOFF_TASK,
      sourceAgentId: RECEIVER,
      payload: { taskId: HANDOFF_TASK, toAgentId: RECEIVER },
    });
    await sleep(1500);
    const clearedScan = await scanCanvas(page);
    log(`after handoff_completed: sprite=${clearedScan.sprite} blocked=${clearedScan.blockedHits} handoff=${clearedScan.handoffHits}`);
    assert(
      clearedScan.handoffHits === 0,
      `handoff task icon never cleared after agent.handoff_completed (${clearedScan.handoffHits} px still painted)`,
    );
    log(`TRUTH 3 PASS — handoff task icon appeared during the walk and cleared on completion`);

    // ── TRUTH 4 — the blocked glyph belongs to the agent it describes (CR-02).
    // 05-VERIFICATION.md reproduced this defect in a throwaway vitest against a
    // recording ctx; this carries the regression guard on the office's own
    // composited canvas. Against the 05-08 code the first two assertions below
    // went red: the clamp collapsed every early desk row's glyph onto y=0,
    // inside the sprite of the agent in front.
    //
    // Seat INTERIOR_COLS + 1 agents so the first and last land in the SAME
    // interior column on two consecutive desk rows. They start at whatever
    // slot truths 1-3 left free, not at 0, so the column is computed here
    // rather than assumed.
    const cohort = Array.from({ length: INTERIOR_COLS + 1 }, (_, n) => `live-proof-seat-${String(n).padStart(2, "0")}`);
    const cohortDesks = cohort.map((id) => claimDesk(id));
    for (const agentId of cohort) {
      await postEvent(token, statusChanged(agentId, `live-proof-task-${agentId}`, "running"));
    }
    await sleep(RENDER_SETTLE_MS);

    const firstDesk = cohortDesks[0];
    const targetDesk = cohortDesks[cohortDesks.length - 1];
    const targetId = cohort[cohort.length - 1];
    assert(
      firstDesk.col === targetDesk.col && targetDesk.row === firstDesk.row + DESK_ROW_PITCH,
      `the cohort did not straddle two consecutive desk rows in one column: first ${JSON.stringify(firstDesk)}, ` +
        `last ${JSON.stringify(targetDesk)}`,
    );

    await postEvent(token, statusChanged(targetId, `live-proof-task-${targetId}`, "blocked"));
    await sleep(RENDER_SETTLE_MS);

    // Measure inside the target's OWN tile column. scanCanvas over the whole
    // canvas would also pick up the Truth 2 agent, which is still blocked on
    // the FIRST desk row — its glyph sits in exactly the band assertion 1
    // excludes, so a global assertion would fail on every run.
    const targetBand = tileColumnRange(targetDesk.col);
    const bandScan = await scanCanvas(page, targetBand);
    const firstRowSpriteBottom = spriteTopY(firstDesk.row) + SPRITE_HEIGHT;
    const targetSpriteTop = spriteTopY(targetDesk.row);
    log(
      `blocked glyph in col ${targetDesk.col} (x ${targetBand.from}..${targetBand.to}): ` +
        `${bandScan.blockedHits} px, y ${bandScan.blockedMinY}..${bandScan.blockedMaxY} ` +
        `(expected band ${firstRowSpriteBottom}..${targetSpriteTop}, exclusive)`,
    );

    assert(
      bandScan.blockedHits > 0,
      `no blocked-glyph pixel in the blocked agent's own column band (col ${targetDesk.col}, x ` +
        `${targetBand.from}..${targetBand.to}) — the band assertions below would pass vacuously`,
    );
    assert(
      bandScan.blockedMinY > firstRowSpriteBottom,
      `the blocked glyph reaches up into the desk row in front of its owner: measured y ` +
        `${bandScan.blockedMinY}..${bandScan.blockedMaxY} in col ${targetDesk.col}, but a desk-row-${firstDesk.row} ` +
        `sprite ends at y ${firstRowSpriteBottom} — the glyph must sit strictly below it (CR-02)`,
    );
    assert(
      bandScan.blockedMaxY < targetSpriteTop,
      `the blocked glyph is not above its own sprite: measured y ${bandScan.blockedMinY}..${bandScan.blockedMaxY} ` +
        `in col ${targetDesk.col}, but the desk-row-${targetDesk.row} sprite starts at y ${targetSpriteTop}`,
    );
    log(
      `TRUTH 4 PASS — ${bandScan.blockedHits} blocked-glyph px at y ${bandScan.blockedMinY}..${bandScan.blockedMaxY}, ` +
        `inside ${targetId}'s own headroom (${firstRowSpriteBottom} < y < ${targetSpriteTop}) and in no other agent's`,
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
