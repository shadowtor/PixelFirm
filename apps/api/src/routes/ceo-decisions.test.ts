// env.ts parses eagerly at import time, so process.env is set first and every
// env-dependent module is loaded with a dynamic import() in beforeAll.
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";
process.env.BROWSER_ACCESS_TOKEN = "test-browser-access-token";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { WebSocket } from "ws";
import { eq } from "drizzle-orm";
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
