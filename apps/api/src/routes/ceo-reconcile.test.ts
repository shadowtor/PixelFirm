// env.ts parses eagerly at import time, so process.env is set first and every
// env-dependent module is loaded with a dynamic import() in beforeAll.
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";
process.env.BROWSER_ACCESS_TOKEN = "test-browser-access-token";
process.env.CEO_DEV_AUTH_BYPASS = "1";
process.env.CEO_ALLOWED_ORIGINS = "http://localhost:5173";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { WebSocket, type ClientOptions } from "ws";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { WorkerDownlinkSchema } from "event-schema";
import { events, workers } from "../db/schema.js";
import type { buildServer as buildServerType } from "../server.js";
import type { db as dbType } from "../db/client.js";
import type { issueCredential as issueCredentialType } from "../auth/credentials.js";

const migrationPaths = [
  "../../drizzle/0000_init.sql",
  "../../drizzle/0001_append_only_trigger.sql",
  "../../drizzle/0002_workers_table.sql",
  "../../drizzle/0003_no_truncate_trigger.sql",
  "../../drizzle/0004_ceo_decision_once.sql",
].map((p) => fileURLToPath(new URL(p, import.meta.url)));

const WORKER_ID = "ceo-reconcile-test-worker";
const WORKER_B_ID = "ceo-reconcile-test-worker-b";
const AGENT_ID = "agent-reconcile";
const ORIGIN = "http://localhost:5173";
const DEV_CEO = "dev-bypass@pixelfirm.invalid";

let buildServer: typeof buildServerType;
let db: typeof dbType;
let issueCredential: typeof issueCredentialType;
let wsBaseUrl: string;
let server: Awaited<ReturnType<typeof buildServerType>>;
let workerToken: string;
let workerBToken: string;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyIdempotently(client: Client, text: string) {
  try {
    await client.query(text);
  } catch (err) {
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
  }
}

function openSocket(url: string, options: ClientOptions = {}): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`ws refused: ${res.statusCode}`)));
    ws.once("error", reject);
  });
}

/** Every frame a socket receives, parsed, in order. */
function record(ws: WebSocket): unknown[] {
  const frames: unknown[] = [];
  ws.on("message", (data) => frames.push(JSON.parse(data.toString())));
  return frames;
}

// /ws is rate limited to 20 upgrades a minute per IP: one fake worker socket
// for the whole file, reconnected only if it closed.
let worker: WebSocket | undefined;
let workerFrames: unknown[] = [];
async function fakeWorker(): Promise<WebSocket> {
  if (worker?.readyState !== WebSocket.OPEN) {
    worker = await openSocket(`${wsBaseUrl}/ws`, { headers: { authorization: `Bearer ${workerToken}` } });
    workerFrames = record(worker);
  }
  return worker;
}

function hello(ws: WebSocket, bootId: string): void {
  ws.send(JSON.stringify({ type: "hello", bootId }));
}

function postEvent(body: unknown, token = workerToken) {
  return server.inject({
    method: "POST",
    url: "/events",
    headers: { authorization: `Bearer ${token}` },
    payload: body as object,
  });
}

/** Posts a PRIVATE ceo.approval_requested stamped (server-side) with the posting worker's id. */
async function openRequest(workerBootId: string, token = workerToken) {
  const taskId = `task-${randomUUID()}`;
  const decisionId = randomUUID();
  const sessionId = `session-${randomUUID()}`;
  const worktreePath = "F:/repos/demo";
  const res = await postEvent(
    {
      id: randomUUID(),
      type: "ceo.approval_requested",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      taskId,
      sourceAgentId: AGENT_ID,
      visibility: "PRIVATE",
      payload: {
        taskId,
        reason: "needs CEO approval",
        decisionId,
        kind: "ceo_gated_tool",
        toolName: "Bash",
        toolInput: JSON.stringify({ command: "git push" }),
        sessionId,
        worktreePath,
        workerBootId,
      },
    },
    token,
  );
  expect(res.statusCode).toBe(202);
  return { taskId, decisionId, sessionId, worktreePath };
}

function postDecision(decisionId: string, body: unknown) {
  return server.inject({
    method: "POST",
    url: `/ceo/api/decisions/${decisionId}`,
    headers: { "content-type": "application/json", origin: ORIGIN, "x-pixelfirm-csrf": "1" },
    payload: JSON.stringify(body),
  });
}

function rowsOfType(type: string, decisionId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.type, type), sql`${events.payload}->>'decisionId' = ${decisionId}`));
}

function blockedRows(taskId: string) {
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.type, "task.status_changed"),
        eq(events.taskId, taskId),
        sql`${events.payload}->>'status' = 'blocked'`,
      ),
    );
}

/** Polls until check() returns a truthy value; fails with `what` on timeout. */
async function waitFor<T>(what: string, check: () => Promise<T | undefined | false>, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

beforeAll(async () => {
  const migrateClient = new Client({ connectionString: process.env.DATABASE_URL });
  await migrateClient.connect();
  for (const path of migrationPaths) {
    await applyIdempotently(migrateClient, readFileSync(path, "utf8"));
  }
  await migrateClient.end();

  ({ buildServer } = await import("../server.js"));
  ({ db } = await import("../db/client.js"));
  ({ issueCredential } = await import("../auth/credentials.js"));

  for (const id of [WORKER_ID, WORKER_B_ID]) {
    const issued = issueCredential(id);
    if (id === WORKER_ID) workerToken = issued.token;
    else workerBToken = issued.token;
    await db
      .insert(workers)
      .values({ id, secretHash: issued.secretHash })
      .onConflictDoUpdate({ target: workers.id, set: { secretHash: issued.secretHash, revokedAt: null } });
  }

  server = buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  wsBaseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  worker?.close();
  await server.close();
  await db.$client.end();
});

describe("hello reconcile (D-02, 06-04)", () => {
  it("a new bootId expires the open request (never approves) and blocks its task for the requesting agent", async () => {
    const ws = await fakeWorker();
    const office = await openSocket(`${wsBaseUrl}/ws/browser?token=test-browser-access-token`);
    const ceo = await openSocket(`${wsBaseUrl}/ceo/ws`, { origin: ORIGIN });
    const officeFrames = record(office);
    const ceoFrames = record(ceo);

    const { taskId, decisionId } = await openRequest(randomUUID());
    hello(ws, randomUUID());

    const [expired] = await waitFor("ceo.approval_expired", async () => {
      const rows = await rowsOfType("ceo.approval_expired", decisionId);
      return rows.length > 0 && rows;
    });
    expect(expired!.visibility).toBe("PRIVATE");
    expect(expired!.payload).toEqual({ decisionId, taskId, reason: "worker_restarted" });

    const [blocked] = await waitFor("task.status_changed blocked", async () => {
      const rows = await blockedRows(taskId);
      return rows.length > 0 && rows;
    });
    expect(blocked!.visibility).toBe("INTERNAL");
    expect(blocked!.sourceAgentId).toBe(AGENT_ID);
    expect(blocked!.payload).toEqual({ taskId, status: "blocked" });
    expect(await rowsOfType("ceo.decision_made", decisionId)).toHaveLength(0);

    await waitFor("office blocked frame", async () =>
      officeFrames.some(
        (f) => (f as { event?: { type: string; taskId?: string } }).event?.taskId === taskId &&
          (f as { event: { type: string } }).event.type === "task.status_changed",
      ),
    );
    await waitFor("ceo expiry frame", async () =>
      ceoFrames.some((f) => (f as { event?: { id: string } }).event?.id === expired!.id),
    );
    // The office never sees the PRIVATE expiry.
    expect(officeFrames.some((f) => (f as { event?: { type: string } }).event?.type === "ceo.approval_expired")).toBe(false);

    office.close();
    ceo.close();
  });

  it("is idempotent: repeating the same new bootId adds no second expiry or blocked event", async () => {
    const ws = await fakeWorker();
    const { taskId, decisionId } = await openRequest(randomUUID());
    const bootB = randomUUID();
    hello(ws, bootB);
    hello(ws, bootB);
    await waitFor("ceo.approval_expired", async () => (await rowsOfType("ceo.approval_expired", decisionId)).length > 0);
    hello(ws, bootB);
    await sleep(500);

    expect(await rowsOfType("ceo.approval_expired", decisionId)).toHaveLength(1);
    expect(await blockedRows(taskId)).toHaveLength(1);
  });

  it("the same bootId redelivers a decision that was recorded but never applied", async () => {
    const ws = await fakeWorker();
    const bootB = randomUUID();
    const { decisionId } = await openRequest(bootB);

    const firstFrame = waitFor("original decision frame", async () =>
      workerFrames.find((f) => (f as { decisionId?: string }).decisionId === decisionId),
    );
    const res = await postDecision(decisionId, { action: "request_changes", note: "split the commit" });
    expect(res.statusCode).toBe(202);
    const original = await firstFrame;
    const countBefore = workerFrames.filter((f) => (f as { decisionId?: string }).decisionId === decisionId).length;

    hello(ws, bootB);
    const redelivered = await waitFor("redelivered decision frame", async () => {
      const matching = workerFrames.filter((f) => (f as { decisionId?: string }).decisionId === decisionId);
      return matching.length > countBefore && matching[matching.length - 1];
    });
    expect(WorkerDownlinkSchema.parse(redelivered)).toEqual(original);
    expect(redelivered).toEqual({ type: "decision", decisionId, action: "request_changes", note: "split the commit" });
    expect(await rowsOfType("ceo.approval_expired", decisionId)).toHaveLength(0);
  });

  it("leaves a request with ceo.decision_applied alone on any hello", async () => {
    const ws = await fakeWorker();
    const bootA = randomUUID();
    const { taskId, decisionId } = await openRequest(bootA);
    expect((await postDecision(decisionId, { action: "approve" })).statusCode).toBe(202);
    const applied = await postEvent({
      id: randomUUID(),
      type: "ceo.decision_applied",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      taskId,
      visibility: "PRIVATE",
      payload: { decisionId, taskId, action: "approve", outcome: "allowed" },
    });
    expect(applied.statusCode).toBe(202);
    await sleep(100);
    const framesBefore = workerFrames.filter((f) => (f as { decisionId?: string }).decisionId === decisionId).length;

    hello(ws, bootA);
    hello(ws, randomUUID());
    await sleep(500);

    expect(await rowsOfType("ceo.approval_expired", decisionId)).toHaveLength(0);
    expect(await blockedRows(taskId)).toHaveLength(0);
    expect(workerFrames.filter((f) => (f as { decisionId?: string }).decisionId === decisionId)).toHaveLength(
      framesBefore,
    );
  });

  it("never touches a request stamped with another worker", async () => {
    const ws = await fakeWorker();
    const { taskId, decisionId } = await openRequest(randomUUID(), workerBToken);
    // A request of W's own, so the hello provably ran before the assertion.
    const own = await openRequest(randomUUID());
    hello(ws, randomUUID());
    await waitFor("W's own expiry", async () => (await rowsOfType("ceo.approval_expired", own.decisionId)).length > 0);
    await sleep(200);

    expect(await rowsOfType("ceo.approval_expired", decisionId)).toHaveLength(0);
    expect(await blockedRows(taskId)).toHaveLength(0);
  });

  it("ignores a malformed or non-hello frame and keeps the socket open", async () => {
    const ws = await fakeWorker();
    ws.send("{not json");
    ws.send(JSON.stringify({ type: "task.start", prompt: "rm -rf /" }));
    ws.send(JSON.stringify({ type: "hello", bootId: "not-a-uuid" }));
    await sleep(200);
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Still reconciles afterwards.
    const { decisionId } = await openRequest(randomUUID());
    hello(ws, randomUUID());
    await waitFor("expiry after junk frames", async () => (await rowsOfType("ceo.approval_expired", decisionId)).length > 0);
  });
});

function postResume(taskId: string, opts: { omit?: string[] } = {}) {
  // requireCsrf wants the full D-12 set, including a JSON content-type.
  const headers: Record<string, string> = { "content-type": "application/json", origin: ORIGIN, "x-pixelfirm-csrf": "1" };
  for (const key of opts.omit ?? []) delete headers[key];
  return server.inject({
    method: "POST",
    url: `/ceo/api/tasks/${encodeURIComponent(taskId)}/resume`,
    headers,
    payload: "{}",
  });
}

function resumeRows(taskId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.type, "ceo.task_resume_requested"), eq(events.taskId, taskId)));
}

/** An open request of W's that a new-bootId hello has expired. */
async function expiredRequest() {
  const ws = await fakeWorker();
  const request = await openRequest(randomUUID());
  hello(ws, randomUUID());
  await waitFor("expiry", async () => (await rowsOfType("ceo.approval_expired", request.decisionId)).length > 0);
  return request;
}

describe("POST /ceo/api/tasks/:taskId/resume (D-02, 06-04)", () => {
  it("409 not blocked when the task's latest request has not expired", async () => {
    await fakeWorker();
    const { taskId } = await openRequest(randomUUID());
    const res = await postResume(taskId);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "not blocked" });
    expect(await resumeRows(taskId)).toHaveLength(0);
  });

  it("202 after the expiry: records the resume with the verified decider and sends task.resume with the stored ids", async () => {
    const { taskId, sessionId, worktreePath } = await expiredRequest();
    const framesBefore = workerFrames.length;

    const res = await postResume(taskId);
    expect(res.statusCode).toBe(202);

    const rows = await resumeRows(taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.visibility).toBe("PRIVATE");
    expect(rows[0]!.payload).toEqual({ taskId, decidedBy: DEV_CEO });

    const frame = await waitFor("task.resume frame", async () =>
      workerFrames.slice(framesBefore).find((f) => (f as { type?: string }).type === "task.resume"),
    );
    expect(WorkerDownlinkSchema.parse(frame)).toEqual({
      type: "task.resume",
      taskId,
      sessionId,
      worktreePath,
      agentId: AGENT_ID,
    });
    // SEC-03: stored identifiers only, never a prompt.
    expect(Object.keys(frame as object).sort()).toEqual(["agentId", "sessionId", "taskId", "type", "worktreePath"]);

    const again = await postResume(taskId);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "already resumed" });
    expect(await resumeRows(taskId)).toHaveLength(1);
  });

  it("503 and no row when the request's worker is offline", async () => {
    // Worker B never opens a socket; it records its own request's expiry.
    const { taskId, decisionId } = await openRequest(randomUUID(), workerBToken);
    const expiry = await postEvent(
      {
        id: randomUUID(),
        type: "ceo.approval_expired",
        version: 1,
        occurredAt: new Date().toISOString(),
        companyId: "company-1",
        taskId,
        visibility: "PRIVATE",
        payload: { decisionId, taskId, reason: "aborted" },
      },
      workerBToken,
    );
    expect(expiry.statusCode).toBe(202);

    const res = await postResume(taskId);
    expect(res.statusCode).toBe(503);
    expect(await resumeRows(taskId)).toHaveLength(0);
  });

  it("404 for a task with no decision request", async () => {
    const res = await postResume(`task-${randomUUID()}`);
    expect(res.statusCode).toBe(404);
  });

  it("403 without the CSRF header, and nothing is recorded", async () => {
    const { taskId } = await expiredRequest();
    const res = await postResume(taskId, { omit: ["x-pixelfirm-csrf"] });
    expect(res.statusCode).toBe(403);
    expect(await resumeRows(taskId)).toHaveLength(0);
  });
});
