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
import { WebSocket } from "ws";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
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
].map((p) => fileURLToPath(new URL(p, import.meta.url)));

const WORKER_ID = "ceo-decisions-test-worker";

let buildServer: typeof buildServerType;
let db: typeof dbType;
let issueCredential: typeof issueCredentialType;
// Namespace import so a missing export fails on an assertion, not on ESM linking.
let wc: Record<string, unknown>;
let envMod: Record<string, unknown>;
let wsBaseUrl: string;
let server: Awaited<ReturnType<typeof buildServerType>>;
let workerToken: string;

async function applyIdempotently(client: Client, sql: string) {
  try {
    await client.query(sql);
  } catch (err) {
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
  }
}

function connectWorker(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws`, { headers: { authorization: `Bearer ${workerToken}` } });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`worker ws refused: ${res.statusCode}`)));
    ws.once("error", reject);
  });
}

function closeAndWait(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === ws.CLOSED) return resolve();
    ws.once("close", () => resolve());
    ws.close();
  });
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

function approvalRequest(opts: { decisionId?: string; taskId?: string; visibility?: string } = {}) {
  const taskId = opts.taskId ?? `task-${randomUUID()}`;
  return {
    id: randomUUID(),
    type: "ceo.approval_requested",
    version: 1,
    occurredAt: new Date().toISOString(),
    companyId: "company-1",
    taskId,
    visibility: opts.visibility ?? "PRIVATE",
    payload: {
      taskId,
      reason: "needs CEO approval",
      decisionId: opts.decisionId ?? randomUUID(),
      kind: "ceo_gated_tool",
      toolName: "Bash",
      toolInput: JSON.stringify({ command: "git push" }),
      workerId: "forged-worker-id",
    },
  };
}

function postEvent(body: unknown) {
  return server.inject({
    method: "POST",
    url: "/events",
    headers: { authorization: `Bearer ${workerToken}` },
    payload: body as object,
  });
}

async function rowsById(id: string) {
  return db.select().from(events).where(eq(events.id, id));
}

const DEV_CEO = "dev-bypass@pixelfirm.invalid";

function postDecision(
  decisionId: string,
  body: unknown,
  opts: { remoteAddress?: string; headers?: Record<string, string>; omit?: string[] } = {},
) {
  // Every positive-path request carries the full D-12 set: allowlisted Origin,
  // X-PixelFirm-CSRF: 1 and a JSON content-type.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost:5173",
    "x-pixelfirm-csrf": "1",
    ...opts.headers,
  };
  for (const key of opts.omit ?? []) delete headers[key];
  return server.inject({
    method: "POST",
    url: `/ceo/api/decisions/${decisionId}`,
    remoteAddress: opts.remoteAddress,
    headers,
    payload: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function decisionRows(decisionId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.type, "ceo.decision_made"), sql`${events.payload}->>'decisionId' = ${decisionId}`));
}

// One fake worker socket shared by the decision-route tests: /ws is rate
// limited to 20 upgrades a minute per IP, so reconnect only when closed.
let sharedWorker: WebSocket | undefined;

/** The connected fake worker, after it has posted a PRIVATE ceo.approval_requested through /events. */
async function openRequest(kind: "ceo_gated_tool" | "clarifying_question" = "ceo_gated_tool") {
  if (sharedWorker?.readyState !== WebSocket.OPEN) sharedWorker = await connectWorker();
  const ws = sharedWorker;
  const event = approvalRequest();
  event.payload.kind = kind;
  const res = await postEvent(event);
  expect(res.statusCode).toBe(202);
  return { ws, decisionId: event.payload.decisionId, taskId: event.taskId };
}

/** Runs fn with the dev bypass switched off, restoring it afterwards. */
async function withBypassOff<T>(fn: () => Promise<T>): Promise<T> {
  const env = envMod.env as { CEO_DEV_AUTH_BYPASS: boolean };
  env.CEO_DEV_AUTH_BYPASS = false;
  try {
    return await fn();
  } finally {
    env.CEO_DEV_AUTH_BYPASS = true;
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
  wc = (await import("../ws/worker-connections.js")) as Record<string, unknown>;
  envMod = (await import("../env.js")) as Record<string, unknown>;

  const issued = issueCredential(WORKER_ID);
  workerToken = issued.token;
  await db
    .insert(workers)
    .values({ id: WORKER_ID, secretHash: issued.secretHash })
    .onConflictDoUpdate({ target: workers.id, set: { secretHash: issued.secretHash, revokedAt: null } });

  server = buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  wsBaseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.close();
  await db.$client.end();
});

describe("POST /events ceo.* rules", () => {
  it("stamps ceo.approval_requested payload.workerId from the credential, never the body, and relays the stamped event", async () => {
    const browser = new WebSocket(`${wsBaseUrl}/ws/browser?token=test-browser-access-token`);
    await nextMessage(browser); // snapshot

    const event = approvalRequest();
    const relayed = new Promise<{ event: { id: string; payload: { workerId?: string } } }>((resolve) => {
      browser.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "event" && msg.event.id === event.id) resolve(msg);
      });
    });

    const res = await postEvent(event);
    expect(res.statusCode).toBe(202);

    const [row] = await rowsById(event.id);
    expect((row.payload as { workerId?: string }).workerId).toBe(WORKER_ID);
    expect((await relayed).event.payload.workerId).toBe(WORKER_ID);
    browser.close();
  });

  it("refuses a worker-authored ceo.decision_made with 403 and inserts nothing", async () => {
    const id = randomUUID();
    const res = await postEvent({
      id,
      type: "ceo.decision_made",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "PRIVATE",
      payload: { decisionId: randomUUID(), taskId: "t", action: "approve", decidedBy: "ceo@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(await rowsById(id)).toHaveLength(0);
  });

  it("refuses a worker-authored ceo.task_resume_requested with 403 and inserts nothing", async () => {
    const id = randomUUID();
    const res = await postEvent({
      id,
      type: "ceo.task_resume_requested",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "PRIVATE",
      payload: { taskId: "t", decidedBy: "ceo@example.com" },
    });
    expect(res.statusCode).toBe(403);
    expect(await rowsById(id)).toHaveLength(0);
  });

  it("accepts and stores a PRIVATE ceo.decision_applied and a PRIVATE ceo.approval_expired", async () => {
    const applied = {
      id: randomUUID(),
      type: "ceo.decision_applied",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "PRIVATE",
      payload: { decisionId: randomUUID(), taskId: "t", action: "approve", outcome: "allowed" },
    };
    const expired = {
      id: randomUUID(),
      type: "ceo.approval_expired",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "PRIVATE",
      payload: { decisionId: randomUUID(), taskId: "t", reason: "aborted" },
    };
    expect((await postEvent(applied)).statusCode).toBe(202);
    expect((await postEvent(expired)).statusCode).toBe(202);
    expect(await rowsById(applied.id)).toHaveLength(1);
    expect(await rowsById(expired.id)).toHaveLength(1);
  });

  it("refuses a non-PRIVATE ceo.decision_applied with 400 and inserts nothing", async () => {
    const id = randomUUID();
    const res = await postEvent({
      id,
      type: "ceo.decision_applied",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: { decisionId: randomUUID(), taskId: "t", action: "approve", outcome: "allowed" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "ceo events must be PRIVATE" });
    expect(await rowsById(id)).toHaveLength(0);
  });

  it("refuses a non-PRIVATE ceo.approval_requested with 400 and inserts nothing", async () => {
    const event = approvalRequest({ visibility: "INTERNAL" });
    const res = await postEvent(event);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "ceo events must be PRIVATE" });
    expect(await rowsById(event.id)).toHaveLength(0);
  });
});

describe("worker socket registry (downlink)", () => {
  it("delivers a WorkerDownlinkSchema-valid decision frame to a connected worker", async () => {
    expect(typeof wc.sendToWorker).toBe("function");
    const sendToWorker = wc.sendToWorker as (id: string, msg: unknown) => boolean;
    const ws = await connectWorker();
    const decisionId = randomUUID();
    const received = nextMessage(ws);

    expect(sendToWorker(WORKER_ID, { type: "decision", decisionId, action: "approve" })).toBe(true);
    expect(WorkerDownlinkSchema.parse(await received)).toEqual({ type: "decision", decisionId, action: "approve" });
    await closeAndWait(ws);
  });

  it("reports the worker offline after its socket closes, and sendToWorker returns false", async () => {
    expect(typeof wc.isWorkerConnected).toBe("function");
    const isWorkerConnected = wc.isWorkerConnected as (id: string) => boolean;
    const sendToWorker = wc.sendToWorker as (id: string, msg: unknown) => boolean;
    const ws = await connectWorker();
    expect(isWorkerConnected(WORKER_ID)).toBe(true);

    await closeAndWait(ws);
    await vi.waitFor(() => expect(isWorkerConnected(WORKER_ID)).toBe(false));
    expect(sendToWorker(WORKER_ID, { type: "decision", decisionId: randomUUID(), action: "approve" })).toBe(false);
  });

  it("a second connection replaces the first, and the first socket's close does not unregister the second", async () => {
    expect(typeof wc.isWorkerConnected).toBe("function");
    const isWorkerConnected = wc.isWorkerConnected as (id: string) => boolean;
    const sendToWorker = wc.sendToWorker as (id: string, msg: unknown) => boolean;
    const first = await connectWorker();
    const second = await connectWorker();

    await closeAndWait(first);
    await new Promise((r) => setTimeout(r, 50)); // let the server process the close
    expect(isWorkerConnected(WORKER_ID)).toBe(true);

    const decisionId = randomUUID();
    const received = nextMessage(second);
    expect(sendToWorker(WORKER_ID, { type: "decision", decisionId, action: "reject" })).toBe(true);
    expect(WorkerDownlinkSchema.parse(await received)).toEqual({ type: "decision", decisionId, action: "reject" });
    await closeAndWait(second);
  });
});

describe("POST /ceo/api/decisions/:decisionId", () => {
  it("records a PRIVATE ceo.decision_made and sends the decision to the owning worker", async () => {
    const { ws, decisionId, taskId } = await openRequest();
    const received = nextMessage(ws);

    const res = await postDecision(decisionId, { action: "approve" });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: true, decisionId });
    expect(WorkerDownlinkSchema.parse(await received)).toEqual({ type: "decision", decisionId, action: "approve" });

    const rows = await decisionRows(decisionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].visibility).toBe("PRIVATE");
    expect(rows[0].taskId).toBe(taskId);
    expect(rows[0].payload).toEqual({ decisionId, taskId, action: "approve", decidedBy: DEV_CEO });
  });

  it("returns 404 for an unknown decisionId", async () => {
    const res = await postDecision(randomUUID(), { action: "approve" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "unknown decision" });
  });

  it("returns 400 for a non-uuid decisionId", async () => {
    const res = await postDecision("not-a-uuid", { action: "approve" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an invalid body and appends nothing", async () => {
    const { ws, decisionId } = await openRequest();
    const res = await postDecision(decisionId, { action: "yolo" });
    expect(res.statusCode).toBe(400);
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });

  it("returns 503 and appends nothing when the owning worker is offline", async () => {
    const { ws, decisionId } = await openRequest();
    await closeAndWait(ws);
    await vi.waitFor(() => expect((wc.isWorkerConnected as (id: string) => boolean)(WORKER_ID)).toBe(false));

    const res = await postDecision(decisionId, { action: "approve" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "worker offline" });
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });

  it("refuses a non-loopback peer with 401, even when it sends X-Forwarded-For: 127.0.0.1", async () => {
    const { ws, decisionId } = await openRequest();
    const plain = await postDecision(decisionId, { action: "approve" }, { remoteAddress: "10.1.2.3" });
    expect(plain.statusCode).toBe(401);
    expect(plain.json()).toEqual({ error: "unauthorized" });

    const forwarded = await postDecision(
      decisionId,
      { action: "approve" },
      { remoteAddress: "10.1.2.3", headers: { "x-forwarded-for": "127.0.0.1" } },
    );
    expect(forwarded.statusCode).toBe(401);
    expect(forwarded.json()).toEqual({ error: "unauthorized" });
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });

  it("refuses a loopback request with 401 when the dev bypass is off", async () => {
    const { ws, decisionId } = await openRequest();
    const res = await withBypassOff(() => postDecision(decisionId, { action: "approve" }));
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("never accepts BROWSER_ACCESS_TOKEN as CEO auth (401)", async () => {
    const { ws, decisionId } = await openRequest();
    const headers = { authorization: "Bearer test-browser-access-token" };
    const offRes = await withBypassOff(() => postDecision(decisionId, { action: "approve" }, { headers }));
    expect(offRes.statusCode).toBe(401);
    expect(offRes.json()).toEqual({ error: "unauthorized" });
    const remoteRes = await postDecision(decisionId, { action: "approve" }, { headers, remoteAddress: "10.1.2.3" });
    expect(remoteRes.statusCode).toBe(401);
    expect(remoteRes.json()).toEqual({ error: "unauthorized" });
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });
});

describe("parseEnv CEO_DEV_AUTH_BYPASS guard", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    CREDENTIAL_PEPPER: "p",
    BOOTSTRAP_SECRET: "b",
    BROWSER_ACCESS_TOKEN: "t",
  };

  it("throws naming CEO_DEV_AUTH_BYPASS when the bypass is on with NODE_ENV=production", () => {
    expect(typeof envMod.parseEnv).toBe("function");
    const parseEnv = envMod.parseEnv as (src: Record<string, string | undefined>) => unknown;
    expect(() => parseEnv({ ...base, CEO_DEV_AUTH_BYPASS: "1", NODE_ENV: "production" })).toThrow(
      /CEO_DEV_AUTH_BYPASS/,
    );
  });

  it("returns the bypass as true with NODE_ENV unset, and false by default", () => {
    expect(typeof envMod.parseEnv).toBe("function");
    const parseEnv = envMod.parseEnv as (src: Record<string, string | undefined>) => { CEO_DEV_AUTH_BYPASS: boolean };
    expect(parseEnv({ ...base, CEO_DEV_AUTH_BYPASS: "1" }).CEO_DEV_AUTH_BYPASS).toBe(true);
    expect(parseEnv(base).CEO_DEV_AUTH_BYPASS).toBe(false);
  });
});

async function countAllDecisions() {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(events)
    .where(eq(events.type, "ceo.decision_made"));
  return row.n;
}

describe("D-12 CSRF guard on /ceo/api", () => {
  const cases: [string, Parameters<typeof postDecision>[2]][] = [
    ["a missing X-PixelFirm-CSRF header", { omit: ["x-pixelfirm-csrf"] }],
    ["a foreign Origin", { headers: { origin: "https://evil.example" } }],
    ["no Origin", { omit: ["origin"] }],
    ["content-type text/plain", { headers: { "content-type": "text/plain" } }],
  ];

  for (const [label, opts] of cases) {
    it(`refuses ${label} with 403 and appends nothing`, async () => {
      const { ws, decisionId } = await openRequest();
      const before = await countAllDecisions();
      const res = await postDecision(decisionId, { action: "approve" }, opts);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "forbidden" });
      expect(await countAllDecisions()).toBe(before);
    });
  }

  it("refuses an unknown decisionId without the header with 403, not 404 (guard runs before any database work)", async () => {
    const res = await postDecision(randomUUID(), { action: "approve" }, { omit: ["x-pixelfirm-csrf"] });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "forbidden" });
  });
});

describe("D-07 per-action note rules and question answers", () => {
  for (const action of ["request_changes", "more_research", "discuss"] as const) {
    it(`refuses ${action} with a missing, empty or whitespace-only note (400, nothing appended)`, async () => {
      const { ws, decisionId } = await openRequest();
      const before = await countAllDecisions();
      for (const body of [{ action }, { action, note: "" }, { action, note: "   " }]) {
        const res = await postDecision(decisionId, body);
        expect(res.statusCode).toBe(400);
      }
      expect(await countAllDecisions()).toBe(before);
      expect(await decisionRows(decisionId)).toHaveLength(0);
    });
  }

  it("accepts request_changes with a real note and sends it to the worker", async () => {
    const { ws, decisionId, taskId } = await openRequest();
    const received = nextMessage(ws);
    const res = await postDecision(decisionId, { action: "request_changes", note: "use a feature branch" });
    expect(res.statusCode).toBe(202);
    expect(WorkerDownlinkSchema.parse(await received)).toEqual({
      type: "decision",
      decisionId,
      action: "request_changes",
      note: "use a feature branch",
    });
    const [row] = await decisionRows(decisionId);
    expect(row.payload).toEqual({
      decisionId,
      taskId,
      action: "request_changes",
      note: "use a feature branch",
      decidedBy: DEV_CEO,
    });
  });

  it("records a reject with no note as action + decidedBy and no note key", async () => {
    const { ws, decisionId, taskId } = await openRequest();
    const res = await postDecision(decisionId, { action: "reject" });
    expect(res.statusCode).toBe(202);
    const [row] = await decisionRows(decisionId);
    const payload = row.payload as Record<string, unknown>;
    expect(payload).toEqual({ decisionId, taskId, action: "reject", decidedBy: DEV_CEO });
    expect(Object.keys(payload)).not.toContain("note");
  });

  it("refuses approve on a clarifying_question without non-empty answers (400 answers required)", async () => {
    const { ws, decisionId } = await openRequest("clarifying_question");
    for (const body of [{ action: "approve" }, { action: "approve", answers: {} }]) {
      const res = await postDecision(decisionId, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "answers required" });
    }
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });

  it("accepts approve on a clarifying_question with answers and forwards them", async () => {
    const { ws, decisionId } = await openRequest("clarifying_question");
    const received = nextMessage(ws);
    const answers = { "Which database?": "Postgres" };
    const res = await postDecision(decisionId, { action: "approve", answers });
    expect(res.statusCode).toBe(202);
    expect(WorkerDownlinkSchema.parse(await received)).toEqual({ type: "decision", decisionId, action: "approve", answers });
    const [row] = await decisionRows(decisionId);
    expect((row.payload as { answers?: unknown }).answers).toEqual(answers);
  });

  it("drops answers sent with a ceo_gated_tool request before the insert and the downlink", async () => {
    const { ws, decisionId, taskId } = await openRequest("ceo_gated_tool");
    const received = nextMessage(ws);
    const res = await postDecision(decisionId, { action: "approve", answers: { q: "a" } });
    expect(res.statusCode).toBe(202);
    const frame = WorkerDownlinkSchema.parse(await received);
    expect(frame).toEqual({ type: "decision", decisionId, action: "approve" });
    expect(Object.keys(frame)).not.toContain("answers");
    const [row] = await decisionRows(decisionId);
    expect(row.payload).toEqual({ decisionId, taskId, action: "approve", decidedBy: DEV_CEO });
    expect(Object.keys(row.payload as object)).not.toContain("answers");
  });
});
