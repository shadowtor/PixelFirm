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
// same three truths using only event types the REAL pipeline actually carries
// today, all of which packages/claude-adapter's ClaudeCodeRuntime genuinely
// emits: `task.status_changed` (whose reducer handler upserts the owning agent
// and derives its AgentStatus) and the `agent.handoff_requested` /
// `agent.handoff_completed` pair.
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
// Fixed ids (never per-run-unique): the events table is append-only, so fixed
// ids keep a re-run reusing the same three desks instead of accumulating a new
// cohort of stale agents on the floor every time.
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

// The browser talks to whatever VITE_WS_BASE_URL names; post to that same
// server so a port mismatch can never make this proof silently test two
// different API processes.
const wsBase = webEnv.VITE_WS_BASE_URL ?? "";
const API_PORT = Number(wsBase.match(/:(\d+)\s*$/)?.[1] ?? apiEnv.PORT ?? 3000);
const API_URL = `http://localhost:${API_PORT}`;

const constantsSrc = readFileSync(path.join(ROOT, "packages", "pixel-office", "src", "constants.ts"), "utf8");
function readColorConst(name) {
  const m = constantsSrc.match(new RegExp(`${name}\\s*=\\s*"(#[0-9a-fA-F]{6})"`));
  if (!m) throw new Error(`could not read ${name} from packages/pixel-office/src/constants.ts`);
  return m[1];
}
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

async function scanCanvas(page) {
  return page.evaluate(
    ({ floor, wall, blocked, handoff }) => {
      const canvas = document.getElementById("office-canvas");
      if (!canvas) throw new Error("#office-canvas is not in the DOM");
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const toRgb = (hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      const blockedRgb = blocked.map(toRgb);
      const handoffRgb = handoff.map(toRgb);
      const matches = (r, g, b, list) => list.some((c) => c[0] === r && c[1] === g && c[2] === b);

      let sprite = 0;
      let blockedHits = 0;
      let handoffHits = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const isFloor = r === floor[0] && g === floor[1] && b === floor[2];
        const isWall = r === wall[0] && g === wall[1] && b === wall[2];
        if (!isFloor && !isWall) sprite++;
        if (matches(r, g, b, blockedRgb)) blockedHits++;
        if (matches(r, g, b, handoffRgb)) handoffHits++;
      }
      return { width: canvas.width, height: canvas.height, sprite, blockedHits, handoffHits };
    },
    { floor: FLOOR_RGB, wall: WALL_RGB, blocked: BLOCKED_COLORS, handoff: HANDOFF_COLORS },
  );
}

async function openOffice(page, { reload }) {
  if (reload) await page.reload({ waitUntil: "load" });
  else await page.goto(WEB_URL, { waitUntil: "load" });
  await page.waitForSelector("#office-canvas", { state: "attached", timeout: 15_000 });
  // Snapshot-on-connect + a few render frames.
  await sleep(1500);
}

function assert(condition, message) {
  if (!condition) throw new Error(`TRUTH FAILED: ${message}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("ensuring test Postgres is up...");
  await runToCompletion("pnpm", ["--filter", "api", "db:test:up"]);

  const require = createRequire(path.join(ROOT, "apps", "api", "package.json"));
  const { Client } = require("pg");

  // apps/api/.env's DATABASE_URL names the dev database, which the test
  // container (POSTGRES_DB=pixelfirm_test) does not create for us. Create it
  // if missing rather than editing the user's gitignored .env.
  const dbUrl = new URL(apiEnv.DATABASE_URL);
  const dbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (rowCount === 0) {
    log(`creating missing database ${dbName}...`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  log("applying migrations (idempotent)...");
  const client = new Client({ connectionString: apiEnv.DATABASE_URL });
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

  await ensureServer(`${API_URL}/health`, "apps/api dev server", () =>
    spawnBackground("pnpm", ["--filter", "api", "dev"], apiEnv),
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

    // ── Baseline: three real agents materialised by real task.status_changed
    // events, all actively working (no bubble on any of them).
    await postEvent(token, statusChanged(SENDER, HANDOFF_TASK, "running"));
    await postEvent(token, statusChanged(RECEIVER, "live-proof-task-receiver", "running"));
    await postEvent(token, statusChanged(BLOCKED, "live-proof-task-blocked", "running"));

    await openOffice(page, { reload: false });
    const baseline = await scanCanvas(page);
    log(`baseline canvas ${baseline.width}x${baseline.height}: sprite=${baseline.sprite} blocked=${baseline.blockedHits} handoff=${baseline.handoffHits}`);

    // TRUTH 1 — a real agent renders as a real, non-transparent sprite.
    assert(
      baseline.sprite > 0,
      `no non-floor/non-wall pixel found on the canvas — the sprite never painted (sprite pixel count 0)`,
    );
    // The baseline must be clean, otherwise truths 2 and 3 could pass on
    // leftover pixels from an earlier run instead of on this run's events.
    assert(baseline.blockedHits === 0, `blocked-bubble colour already on canvas before the blocked event (${baseline.blockedHits} px)`);
    assert(baseline.handoffHits === 0, `handoff-bubble colour already on canvas before the handoff event (${baseline.handoffHits} px)`);
    log(`TRUTH 1 PASS — ${baseline.sprite} real sprite pixels on a real canvas`);

    // ── TRUTH 2 — a blocked agent's status bubble is really painted.
    // A live-connected client does not currently re-derive AgentStatus from
    // task.status_changed (documented gap, 05-08-PLAN.md objective — NOT
    // fixed here), so reload to take a fresh snapshot through the already
    // proven-correct fold() path.
    await postEvent(token, statusChanged(BLOCKED, "live-proof-task-blocked", "blocked"));
    await openOffice(page, { reload: true });
    const blockedScan = await scanCanvas(page);
    log(`after blocked: sprite=${blockedScan.sprite} blocked=${blockedScan.blockedHits} handoff=${blockedScan.handoffHits}`);
    assert(
      blockedScan.blockedHits > 0,
      `bubble-blocked's distinctive colour(s) ${BLOCKED_COLORS.join(", ")} never appeared on canvas (0 px)`,
    );
    log(`TRUTH 2 PASS — ${blockedScan.blockedHits} blocked-bubble pixels on canvas`);

    // ── TRUTH 3 — a real handoff pair paints the task icon, then clears it.
    // Both halves reach the choreography engine directly off the live relay
    // (App.tsx's handleHandoffEvent wiring), independent of the status gap.
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
