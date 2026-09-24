#!/usr/bin/env node
// Live, zero-mock proof of Phase 6's CEO approval workflow (06-11).
// Run manually:  CEO_LIVE_SHOTS=<dir outside the repo> node scripts/verify-ceo-approval-live.mjs
//
// Real test Postgres, real apps/api, real apps/web (Vite), a real worker
// credential from POST /admin/workers, the real worker hosting a real Claude
// Code session (the developer's subscription; the runtime strips
// ANTHROPIC_API_KEY), the real /ceo dashboard in headless Chromium driven like a
// person would, and the audit events read back from the test database.
//
// The agent works in a disposable git repo under os.tmpdir(), never here. That
// repo's .claude/settings.local.json allow-lists `Bash(node -e *)`, so the two
// probe commands would run unasked if the PreToolUse "ask" backstop lost to a
// settings allow rule (research Assumption A1). The approve decision is held
// for 125 s, past the 100 s watchdog, with a string prompt (Assumption A2, D-03).
//
// Helpers are copied from scripts/verify-pixel-office-live.mjs (not imported:
// that file runs its own proof at load). Same rules: never reuse a server this
// harness did not start, never write review frames into the repo.

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

// T-06-11-02: review frames never enter the repo (project memory: never relax this).
const SHOTS_DIR = process.env.CEO_LIVE_SHOTS ? path.resolve(process.env.CEO_LIVE_SHOTS) : null;
if (SHOTS_DIR && !path.relative(ROOT, SHOTS_DIR).startsWith("..") && !path.isAbsolute(path.relative(ROOT, SHOTS_DIR))) {
  throw new Error(`CEO_LIVE_SHOTS must be outside the repo (${ROOT}), got ${SHOTS_DIR}`);
}

const API_PORT = 3000;
const WEB_PORT = 5197;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const COMPANY_ID = "live-ceo-co";
const AGENT_ID = "live-ceo-agent";
const TASK_ID = `live-ceo-task-${randomUUID()}`;
const TASK_TITLE = "CEO approval live proof";
const DEV_CEO = "dev-bypass@pixelfirm.invalid";
const HOLD_MS = 125_000;
const QUESTION = "Which greeting should the probe write?";
const APPROVED_FILE = "deploy-probe-approved.txt";
const REJECTED_FILE = "deploy-probe-rejected.txt";
const APPROVED_CMD = `node -e "require('fs').writeFileSync('${APPROVED_FILE}', '<answer>')"`;
const REJECTED_CMD = `node -e "require('fs').writeFileSync('${REJECTED_FILE}', 'x')"`;
const PROMPT = [
  "This is a scripted test of an approval workflow. Do exactly these steps, in order, and nothing else:",
  `1. Use the AskUserQuestion tool to ask "${QUESTION}" with exactly two options, labelled "hello" and "goodbye".`,
  `2. Run this exact Bash command, with <answer> replaced by the chosen label: ${APPROVED_CMD}`,
  `3. Run this exact Bash command: ${REJECTED_CMD}`,
  "If a tool call is denied, do not retry it and do not try another way.",
  "4. Finish with a one-line summary.",
].join("\n");

const log = (msg) => console.log(`[ceo-live] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── test database (apps/api/docker-compose.test.yml is the only source) ─────

const compose = readFileSync(path.join(ROOT, "apps", "api", "docker-compose.test.yml"), "utf8");
const TEST_DB = compose.match(/POSTGRES_DB:\s*["']?([A-Za-z0-9_-]+)/)?.[1];
const TEST_PASSWORD = compose.match(/POSTGRES_PASSWORD:\s*["']?([^"'\s]+)/)?.[1];
const TEST_PORT = compose.match(/^\s*-\s*["']?(\d+):\d+["']?\s*$/m)?.[1];
if (!TEST_DB || !TEST_PASSWORD || !TEST_PORT) throw new Error("could not read the test database from docker-compose.test.yml");
const TEST_DATABASE_URL = `postgres://postgres:${TEST_PASSWORD}@127.0.0.1:${TEST_PORT}/${TEST_DB}`;

// T-06-11-04 (accepted): throwaway secrets for a local test database only; never printed.
const SECRETS = {
  CREDENTIAL_PEPPER: randomBytes(32).toString("hex"),
  BOOTSTRAP_SECRET: randomBytes(32).toString("hex"),
  BROWSER_ACCESS_TOKEN: randomBytes(32).toString("hex"),
};

// ── office geometry and colours, from the engine's own data (05-12 rule) ─────

const OFFICE_SRC = path.join(ROOT, "packages", "pixel-office", "src");
const constantsSrc = readFileSync(path.join(OFFICE_SRC, "constants.ts"), "utf8");
const readConst = (name, re) => {
  const m = constantsSrc.match(new RegExp(`${name}\\s*=\\s*${re}`));
  if (!m) throw new Error(`could not read ${name} from constants.ts`);
  return m[1];
};
const TILE_SIZE = Number(readConst("TILE_SIZE", "(\\d+)"));
const MAP_W = Number(readConst("DEFAULT_COLS", "(\\d+)")) * TILE_SIZE;
const MAP_H = Number(readConst("DEFAULT_ROWS", "(\\d+)")) * TILE_SIZE;
/** The CEO room: cols 20-22, rows 1-11 (office-layout.json), in unzoomed map px. */
const CEO_ROOM = { x: 20 * TILE_SIZE, y: 1 * TILE_SIZE, w: 3 * TILE_SIZE, h: 11 * TILE_SIZE };

function collectColors(v, set = new Set()) {
  if (typeof v === "string") {
    if (v) set.add(v.toLowerCase());
  } else if (Array.isArray(v)) v.forEach((x) => collectColors(x, set));
  return set;
}
const officeSprites = JSON.parse(readFileSync(path.join(OFFICE_SRC, "sprites", "office-metrocity.json"), "utf8")).sprites;
/** Every colour the office itself paints. An "agent pixel" is any pixel in none of them. */
const OFFICE_COLORS = collectColors(Object.values(officeSprites).map((s) => s.data));
OFFICE_COLORS.add(readConst("WALL_COLOR", '"(#[0-9a-fA-F]{6})"').toLowerCase());
OFFICE_COLORS.add(readConst("FALLBACK_FLOOR_COLOR", '"(#[0-9a-fA-F]{6})"').toLowerCase());

/** Pixels inside the CEO room that are in no office colour (the live-harness classification). */
async function ceoRoomSpritePixels(page) {
  return page.evaluate(
    ({ office, rect, mapW, mapH }) => {
      const canvas = document.getElementById("office-canvas");
      if (!canvas) throw new Error("#office-canvas is not in the DOM");
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const scale = canvas.height / mapH;
      if (Math.abs(canvas.width / mapW - scale) > 1e-6) throw new Error("canvas is not a uniform scale of the map");
      const set = new Set(office.map((hex) => parseInt(hex.slice(1), 16)));
      let n = 0;
      for (let y = Math.round(rect.y * scale); y < Math.round((rect.y + rect.h) * scale); y++) {
        for (let x = Math.round(rect.x * scale); x < Math.round((rect.x + rect.w) * scale); x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i + 3] !== 0 && !set.has((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])) n++;
        }
      }
      return n;
    },
    { office: [...OFFICE_COLORS], rect: CEO_ROOM, mapW: MAP_W, mapH: MAP_H },
  );
}

// ── process helpers ──────────────────────────────────────────────────────────

const children = [];

function runToCompletion(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

function spawnBackground(label, cmd, args, env, echo = false) {
  const child = spawn(cmd, args, { cwd: ROOT, shell: true, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const out = (d) => {
    if (!echo) return;
    for (const line of d.toString().split(/\r?\n/)) if (line.trim()) console.log(`[${label}] ${line}`);
  };
  child.stdout.on("data", out);
  child.stderr.on("data", out);
  return child;
}

function killChildren() {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return log(`${label} ready at ${url}`);
    } catch {}
    await sleep(500);
  }
  throw new Error(`${label} never became reachable at ${url} within ${timeoutMs}ms`);
}

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

async function shot(page, name) {
  if (!SHOTS_DIR) return null;
  mkdirSync(SHOTS_DIR, { recursive: true });
  const file = path.join(SHOTS_DIR, name);
  await page.screenshot({ path: file });
  log(`screenshot: ${file}`);
  return file;
}

// ── database read-back ───────────────────────────────────────────────────────

const { Client } = createRequire(path.join(ROOT, "apps", "api", "package.json"))("pg");
let db;
const taskEvents = async () =>
  (
    await db.query(
      "SELECT type, payload, source_agent_id, visibility, received_at FROM events WHERE task_id = $1 ORDER BY received_at, occurred_at",
      [TASK_ID],
    )
  ).rows;
const statuses = (rows) => rows.filter((r) => r.type === "task.status_changed").map((r) => r.payload.status);

async function waitForEvents(predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await taskEvents();
    if (predicate(rows)) return rows;
    await sleep(1000);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

// ── main ─────────────────────────────────────────────────────────────────────

let tempRepo = null;

async function main() {
  const taken = [];
  for (const port of [API_PORT, WEB_PORT]) if (await portTaken(port)) taken.push(port);
  if (taken.length) throw new Error(`refusing to reuse a server this harness did not start: port(s) ${taken.join(", ")} in use`);

  log(`resetting the test Postgres container (${TEST_DB} on ${TEST_PORT})...`);
  await runToCompletion("pnpm", ["--filter", "api", "db:test:down"]);
  await runToCompletion("pnpm", ["--filter", "api", "db:test:up"]);
  await runToCompletion("node", ["apps/api/scripts/migrate.mjs"], { DATABASE_URL: TEST_DATABASE_URL });

  spawnBackground("api", "pnpm", ["--filter", "api", "start"], {
    DATABASE_URL: TEST_DATABASE_URL,
    ...SECRETS,
    PORT: String(API_PORT),
    CEO_DEV_AUTH_BYPASS: "1",
    CEO_ALLOWED_ORIGINS: WEB_URL,
    NODE_ENV: "development",
  });
  await waitFor(`${API_URL}/health`, "apps/api");
  spawnBackground("web", "pnpm", ["--filter", "web", "exec", "vite", "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], {
    VITE_WS_BASE_URL: `ws://127.0.0.1:${API_PORT}`,
    VITE_BROWSER_ACCESS_TOKEN: SECRETS.BROWSER_ACCESS_TOKEN,
  });
  await waitFor(WEB_URL, "apps/web");

  const credRes = await fetch(`${API_URL}/admin/workers`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bootstrap-secret": SECRETS.BOOTSTRAP_SECRET },
    body: JSON.stringify({ label: "ceo-live-proof" }),
  });
  if (credRes.status !== 201) throw new Error(`POST /admin/workers -> ${credRes.status} ${await credRes.text()}`);
  const { workerId, token } = await credRes.json();
  log(`worker credential issued (workerId ${workerId})`);

  // T-06-11-01: the agent only ever works in a disposable repo outside this one.
  tempRepo = mkdtempSync(path.join(os.tmpdir(), "pixelfirm-ceo-live-"));
  mkdirSync(path.join(tempRepo, ".claude"));
  writeFileSync(
    path.join(tempRepo, ".claude", "settings.local.json"),
    JSON.stringify({ permissions: { allow: ["Bash(node -e *)"] } }, null, 2),
  );
  writeFileSync(path.join(tempRepo, "README.md"), "CEO approval live proof scratch repo\n");
  const git = (...args) => execFileSync("git", ["-C", tempRepo, ...args], { stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=ceo-live", "-c", "user.email=ceo-live@pixelfirm.invalid", "commit", "-q", "-m", "init");
  log(`disposable repo: ${tempRepo}`);
  const approvedPath = path.join(tempRepo, APPROVED_FILE);
  const rejectedPath = path.join(tempRepo, REJECTED_FILE);

  db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();

  const browser = await chromium.launch({ headless: true });
  const checks = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: Boolean(pass), detail });
    log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  };
  const shots = [];
  try {
    // Page B: the office route, recording every /ws/browser frame from before the task starts.
    const office = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const officeFrames = [];
    office.on("websocket", (ws) => {
      if (!ws.url().includes("/ws/browser")) return;
      ws.on("framereceived", (f) => officeFrames.push(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8")));
    });
    await office.goto(`${WEB_URL}/`, { waitUntil: "load" });
    await office.waitForSelector("#office-canvas", { state: "attached", timeout: 15_000 });
    await sleep(1500);
    const roomBefore = await ceoRoomSpritePixels(office);
    check("CEO room empty before the task starts", roomBefore === 0, { spritePx: roomBefore });

    // Page A: the CEO dashboard (dev bypass over loopback).
    const ceo = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await ceo.goto(`${WEB_URL}/ceo`, { waitUntil: "load" });
    const queue = ceo.locator('[aria-label="Pending queue"]');
    const detail = ceo.locator('[aria-label="Decision detail"]');

    spawnBackground(
      "worker",
      "pnpm",
      ["--filter", "worker", "start"],
      {
        CONTROL_PLANE_URL: API_URL,
        WORKER_TOKEN: token,
        WORKER_COMPANY_ID: COMPANY_ID,
        WORKER_REPO_PATH: tempRepo,
        WORKER_AGENT_ID: AGENT_ID,
        WORKER_TASK_ID: TASK_ID,
        WORKER_TASK_TITLE: TASK_TITLE,
        WORKER_TASK_PROMPT: PROMPT,
      },
      true,
    );
    log(`worker started for task ${TASK_ID}`);

    // Decision 1: the AskUserQuestion, answered "hello".
    await detail.getByText(QUESTION).first().waitFor({ timeout: 300_000 });
    log("decision 1 (question) is on /ceo");
    await detail.getByText("hello", { exact: true }).first().click();
    await ceo.getByRole("button", { name: "Send answers" }).click();
    log('decision 1: answered "hello"');

    // Decision 2: the approved probe, held 125 s before Approve.
    const approvedItem = queue.getByRole("button").filter({ hasText: APPROVED_FILE });
    await approvedItem.waitFor({ timeout: 300_000 });
    await approvedItem.click();
    await detail.locator("pre").filter({ hasText: APPROVED_FILE }).first().waitFor({ timeout: 10_000 });
    const holdStart = Date.now();
    log(`decision 2 (approved probe) is on /ceo — holding ${HOLD_MS / 1000}s`);
    await sleep(1500);
    shots.push(await shot(ceo, "ceo-pending-queue.png"));
    shots.push(await shot(office, "office-ceo-room-hold.png"));
    const holdSamples = [];
    while (Date.now() - holdStart < HOLD_MS) {
      const rows = await taskEvents();
      holdSamples.push({
        atMs: Date.now() - holdStart,
        blocked: statuses(rows).includes("blocked"),
        roomPx: await ceoRoomSpritePixels(office),
        approvedFileExists: existsSync(approvedPath),
      });
      await sleep(Math.min(5000, Math.max(0, HOLD_MS - (Date.now() - holdStart))));
    }
    const holdMs = Date.now() - holdStart;
    await ceo.getByRole("button", { name: "Approve", exact: true }).click();
    await ceo.getByRole("button", { name: "Approve and run" }).click();
    log(`decision 2: approved after ${holdMs}ms`);

    // Decision 3: the rejected probe.
    const rejectedItem = queue.getByRole("button").filter({ hasText: REJECTED_FILE });
    await rejectedItem.waitFor({ timeout: 300_000 });
    await rejectedItem.click();
    await detail.locator("pre").filter({ hasText: REJECTED_FILE }).first().waitFor({ timeout: 10_000 });
    await ceo.getByRole("button", { name: "Reject", exact: true }).click();
    const lastDecisionAt = Date.now();
    log("decision 3: rejected");

    const finalRows = await waitForEvents(
      (rows) => statuses(rows).some((s) => s === "completed" || s === "failed"),
      "the task's completed or failed status",
      600_000,
    );
    const finalStatus = statuses(finalRows).find((s) => s === "completed" || s === "failed");
    log(`task finished: ${finalStatus}`);

    // The agent walks out of the CEO room once nothing is pending.
    let roomAfter = await ceoRoomSpritePixels(office);
    for (const deadline = Date.now() + 30_000; roomAfter !== 0 && Date.now() < deadline; ) {
      await sleep(500);
      roomAfter = await ceoRoomSpritePixels(office);
    }
    shots.push(await shot(office, "office-after.png"));

    // ── assertions ──
    const approvedContent = existsSync(approvedPath) ? readFileSync(approvedPath, "utf8") : null;
    check("approved probe ran exactly as parked", approvedContent === "hello", { content: approvedContent });
    check("rejected probe never ran", !existsSync(rejectedPath), { exists: existsSync(rejectedPath) });

    const rows = await taskEvents();
    const requests = rows.filter((r) => r.type === "ceo.approval_requested");
    const find = (pred) => requests.filter((r) => pred(r.payload));
    const byRole = {
      question: find((p) => p.kind === "clarifying_question"),
      approved: find((p) => p.toolInput?.includes(APPROVED_FILE)),
      rejected: find((p) => p.toolInput?.includes(REJECTED_FILE)),
    };
    check("exactly three approval requests: one question, one approved probe, one rejected probe", requests.length === 3 && Object.values(byRole).every((l) => l.length === 1), {
      total: requests.length,
      question: byRole.question.length,
      approved: byRole.approved.length,
      rejected: byRole.rejected.length,
    });

    const expected = { question: ["approve", "allowed"], approved: ["approve", "allowed"], rejected: ["reject", "denied"] };
    const chains = {};
    for (const [role, [action, outcome]] of Object.entries(expected)) {
      const decisionId = byRole[role][0]?.payload.decisionId;
      const chain = rows.filter((r) => r.payload?.decisionId === decisionId);
      const made = chain.find((r) => r.type === "ceo.decision_made");
      const applied = chain.find((r) => r.type === "ceo.decision_applied");
      chains[role] = {
        decisionId,
        types: chain.map((r) => r.type),
        decidedBy: made?.payload.decidedBy,
        action: made?.payload.action,
        answers: made?.payload.answers,
        outcome: applied?.payload.outcome,
        at: chain.map((r) => r.received_at.toISOString()),
      };
      check(
        `${role}: requested -> decision_made (${DEV_CEO}, ${action}) -> decision_applied (${outcome})`,
        decisionId &&
          JSON.stringify(chains[role].types) === JSON.stringify(["ceo.approval_requested", "ceo.decision_made", "ceo.decision_applied"]) &&
          made.payload.decidedBy === DEV_CEO &&
          made.payload.action === action &&
          applied.payload.outcome === outcome,
        chains[role],
      );
    }

    // A1: the allow-listed probes both parked; the approved file did not exist at any point while parked.
    check(
      "A1: each allow-listed probe parked for a CEO decision before it could run",
      byRole.approved.length === 1 && byRole.rejected.length === 1 && holdSamples.every((s) => !s.approvedFileExists),
      { approvedFileSeenDuringHold: holdSamples.some((s) => s.approvedFileExists), samples: holdSamples.length },
    );
    check("A2 / D-03: the decision was held at least 125 s", holdMs >= HOLD_MS, { holdMs });
    check("A2 / D-03: no blocked status while the decision waited", holdSamples.every((s) => !s.blocked), {
      samples: holdSamples.length,
    });
    check("A2: the session continued after the held decision", approvedContent === "hello" && byRole.rejected.length === 1, {
      finalStatus,
    });
    check("CEO-01: the requesting agent is in the CEO room while its decision is pending", holdSamples.every((s) => s.roomPx > 0), {
      minRoomPx: Math.min(...holdSamples.map((s) => s.roomPx)),
    });
    check("CEO-01: the CEO room is empty after the last decision", roomAfter === 0, {
      roomPx: roomAfter,
      msAfterLastDecision: Date.now() - lastDecisionAt,
    });
    check("the task reached a terminal status", finalStatus === "completed", { finalStatus, statuses: statuses(rows) });

    // Privacy backstop: nothing but the pose and glyph reaches the office route.
    const privateStrings = new Set(["deploy-probe", QUESTION]);
    for (const r of requests) {
      const p = r.payload;
      for (const s of [p.title, p.context, p.toolInput, ...(p.questions ?? []).map((q) => q.question)]) if (s) privateStrings.add(s);
    }
    const officeDom = await office.content();
    const haystacks = [...officeFrames, officeDom];
    const leaks = [...privateStrings].filter((s) => {
      const escaped = JSON.stringify(s).slice(1, -1);
      return haystacks.some((h) => h.includes(s) || h.includes(escaped));
    });
    check("the office relay carried frames, including the waiting pose", officeFrames.some((f) => f.includes("waiting_for_review")), {
      frames: officeFrames.length,
    });
    check("privacy: no decision text in any office frame or the office DOM", leaks.length === 0, {
      privateStrings: privateStrings.size,
      leaks: leaks.map((s) => s.slice(0, 80)),
    });

    const ok = checks.every((c) => c.pass);
    const summary = {
      ok,
      date: new Date().toISOString(),
      taskId: TASK_ID,
      agentId: AGENT_ID,
      workerId,
      finalStatus,
      holdMs,
      holdSamples,
      approvedContent,
      rejectedFileExists: existsSync(rejectedPath),
      chains,
      officeFrames: officeFrames.length,
      shots: shots.filter(Boolean),
      checks,
    };
    console.log("\n=== CEO LIVE PROOF SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    if (!ok) throw new Error(`ASSERTION FAILED: ${checks.find((c) => !c.pass).name}`);
    console.log("CEO LIVE PROOF: PASS");
  } finally {
    await browser.close();
    await db.end();
  }
}

main()
  .catch((err) => {
    console.error(`\n[ceo-live] ${err?.stack ?? err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    killChildren();
    await sleep(2000);
    if (tempRepo) rmSync(tempRepo, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    process.exit(process.exitCode ?? 0);
  });
