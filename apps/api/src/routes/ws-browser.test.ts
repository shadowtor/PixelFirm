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
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { asc, like } from "drizzle-orm";
import { foldDecisions } from "company-core";
import { events, workers } from "../db/schema.js";
import { rowToCompanyEvent } from "../db/event-row.js";
import type { buildServer as buildServerType } from "../server.js";
import type { db as dbType } from "../db/client.js";
import type { issueCredential as issueCredentialType } from "../auth/credentials.js";

const migrationPaths = [
  "../../drizzle/0000_init.sql",
  "../../drizzle/0001_append_only_trigger.sql",
  "../../drizzle/0002_workers_table.sql",
  "../../drizzle/0003_no_truncate_trigger.sql",
  "../../drizzle/0004_ceo_decision_once.sql",
  "../../drizzle/0005_ceo_request_once.sql",
].map((p) => fileURLToPath(new URL(p, import.meta.url)));

let buildServer: typeof buildServerType;
let db: typeof dbType;
let issueCredential: typeof issueCredentialType;
let wsBaseUrl: string;
let httpBaseUrl: string;
let server: Awaited<ReturnType<typeof buildServerType>>;
let workerToken: string;

async function applyIdempotently(client: Client, sql: string) {
  try {
    await client.query(sql);
  } catch (err) {
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
  }
}

function connectBrowser(token?: string) {
  const url = token === undefined ? `${wsBaseUrl}/ws/browser` : `${wsBaseUrl}/ws/browser?token=${encodeURIComponent(token)}`;
  return new WebSocket(url);
}

/** Resolves with { opened, ws } / { rejected }, never throws. */
function attempt(token?: string): Promise<
  { opened: true; ws: WebSocket } | { opened: false; statusCode: number; body: string }
> {
  return new Promise((resolve) => {
    const ws = connectBrowser(token);
    ws.once("open", () => resolve({ opened: true, ws }));
    ws.once("unexpected-response", (_req, res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ opened: false, statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
  });
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

/** Resolves once `count` messages have arrived, preserving their order. */
function collectMessages(ws: WebSocket, count: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const received: unknown[] = [];
    const onMessage = (data: Buffer) => {
      received.push(JSON.parse(data.toString()));
      if (received.length === count) {
        ws.off("message", onMessage);
        resolve(received);
      }
    };
    ws.on("message", onMessage);
  });
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

  const issued = issueCredential("ws-browser-test-worker");
  workerToken = issued.token;
  await db
    .insert(workers)
    .values({ id: "ws-browser-test-worker", secretHash: issued.secretHash })
    .onConflictDoUpdate({
      target: workers.id,
      set: { secretHash: issued.secretHash, revokedAt: null },
    });

  server = buildServer();
  await server.listen({ port: 0 });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  wsBaseUrl = `ws://127.0.0.1:${port}`;
  httpBaseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.close();
  await db.$client.end();
});

describe("GET /ws/browser auth", () => {
  it("rejects with 401 when no ?token= is present", async () => {
    const result = await attempt();
    expect(result.opened).toBe(false);
    if (!result.opened) expect(result.statusCode).toBe(401);
  });

  it("rejects with 401 for a wrong token, byte-identical to the no-token response", async () => {
    const noToken = await attempt();
    const wrongToken = await attempt("definitely-not-the-token");

    expect(noToken.opened).toBe(false);
    expect(wrongToken.opened).toBe(false);
    if (noToken.opened || wrongToken.opened) throw new Error("unreachable");

    expect(wrongToken.statusCode).toBe(401);
    expect(wrongToken.statusCode).toBe(noToken.statusCode);
    expect(wrongToken.body).toBe(noToken.body);
  });

  it("accepts the correct token: connection opens, first message is a snapshot", async () => {
    const result = await attempt("test-browser-access-token");
    expect(result.opened).toBe(true);
    if (!result.opened) throw new Error("unreachable");

    const first = (await nextMessage(result.ws)) as { type: string; state: { agents: unknown; tasks: unknown } };
    expect(first.type).toBe("snapshot");
    expect(first.state).toHaveProperty("agents");
    expect(first.state).toHaveProperty("tasks");

    result.ws.close();
  });
});

describe("POST /events relay", () => {
  it("relays a real posted event to an already-open, authenticated browser socket", async () => {
    const result = await attempt("test-browser-access-token");
    expect(result.opened).toBe(true);
    if (!result.opened) throw new Error("unreachable");

    // Drain the initial snapshot before asserting on the relayed event.
    await nextMessage(result.ws);

    const event = {
      id: randomUUID(),
      type: "worker.heartbeat",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: {},
    };

    const nextMsgPromise = nextMessage(result.ws);
    const res = await fetch(`${httpBaseUrl}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${workerToken}` },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(202);

    const relayed = (await nextMsgPromise) as { type: string; event: { id: string; type: string } };
    expect(relayed.type).toBe("event");
    expect(relayed.event.id).toBe(event.id);
    expect(relayed.event.type).toBe("worker.heartbeat");

    result.ws.close();
  });
});

function postEvent(event: object) {
  return fetch(`${httpBaseUrl}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${workerToken}` },
    body: JSON.stringify(event),
  });
}

const PRIVATE_STRINGS = ["SECRET-TITLE-123", "SECRET-CONTEXT-123", "SECRET-TOOL-INPUT-123", "SECRET-DIFF-123"];

function privateApprovalRequest() {
  return {
    id: randomUUID(),
    type: "ceo.approval_requested",
    version: 1,
    occurredAt: new Date().toISOString(),
    companyId: "company-1",
    visibility: "PRIVATE",
    taskId: "ws-browser-private-task",
    payload: {
      taskId: "ws-browser-private-task",
      reason: "gated",
      decisionId: randomUUID(),
      kind: "ceo_gated_tool",
      toolName: "Bash",
      title: PRIVATE_STRINGS[0],
      context: PRIVATE_STRINGS[1],
      toolInput: PRIVATE_STRINGS[2],
      diff: { files: [], unified: PRIVATE_STRINGS[3], truncated: false, totalAdded: 0, totalRemoved: 0 },
    },
  };
}

describe("office feed privacy (Pitfall 2, T-06-06-01)", () => {
  it("an office socket skips a PRIVATE ceo.approval_requested: the next message is the INTERNAL event", async () => {
    const result = await attempt("test-browser-access-token");
    if (!result.opened) throw new Error("office socket did not open");
    await nextMessage(result.ws);

    const internal = {
      id: randomUUID(),
      type: "task.status_changed",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: { taskId: "ws-browser-private-task", status: "running" },
    };
    const next = nextMessage(result.ws);
    expect((await postEvent(privateApprovalRequest())).status).toBe(202);
    expect((await postEvent(internal)).status).toBe(202);

    const relayed = (await next) as { type: string; event: { id: string; type: string } };
    expect({ type: relayed.type, id: relayed.event.id, eventType: relayed.event.type }).toEqual({
      type: "event",
      id: internal.id,
      eventType: "task.status_changed",
    });
    result.ws.close();
  });

  it("an office snapshot taken after a PRIVATE row exists contains none of its private strings", async () => {
    expect((await postEvent(privateApprovalRequest())).status).toBe(202);
    const result = await attempt("test-browser-access-token");
    if (!result.opened) throw new Error("office socket did not open");

    const json = JSON.stringify(await nextMessage(result.ws));
    expect(PRIVATE_STRINGS.filter((s) => json.includes(s))).toEqual([]);
    result.ws.close();
  });
});

const CEO_ORIGIN = "http://localhost:5173";

/** /ceo/ws upgrade from loopback (the dev bypass applies); resolves open or refused, never throws. */
function attemptCeo(origin = CEO_ORIGIN): Promise<
  { opened: true; ws: WebSocket; first: Promise<unknown> } | { opened: false; statusCode: number }
> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${wsBaseUrl}/ceo/ws`, { origin });
    // Listen before open: the snapshot can arrive in the same tick.
    const first = nextMessage(ws);
    ws.once("open", () => resolve({ opened: true, ws, first }));
    ws.once("unexpected-response", (_req, res) => {
      res.resume();
      resolve({ opened: false, statusCode: res.statusCode ?? 0 });
    });
  });
}

async function ceoRows() {
  const rows = await db.select().from(events).where(like(events.type, "ceo.%")).orderBy(asc(events.occurredAt), asc(events.id));
  return rows.map(rowToCompanyEvent);
}

function connectWorker(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws`, { headers: { authorization: `Bearer ${workerToken}` } });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`worker ws refused: ${res.statusCode}`)));
  });
}

describe("GET /ceo/ws (CEO-02, T-06-06-03)", () => {
  it("refuses a foreign Origin with 403", async () => {
    const result = await attemptCeo("http://evil.test");
    expect(result.opened ? 101 : result.statusCode).toBe(403);
  });

  it("first message is the decisions snapshot: foldDecisions of the stored ceo.* rows", async () => {
    expect((await postEvent(privateApprovalRequest())).status).toBe(202);
    // Other test files write ceo.* rows concurrently: compare only against a
    // read that brackets the snapshot with the same row count.
    for (let attemptNo = 0; ; attemptNo++) {
      const before = await ceoRows();
      const result = await attemptCeo();
      if (!result.opened) throw new Error(`ceo socket refused: ${result.statusCode}`);
      const snapshot = (await result.first) as { type: string; state: unknown };
      const after = await ceoRows();
      result.ws.close();
      if (before.length !== after.length) {
        if (attemptNo >= 30) throw new Error("ceo.* rows kept changing during the snapshot; could not bracket it");
        await new Promise((r) => setTimeout(r, 50 + attemptNo * 20));
        continue;
      }
      expect(snapshot).toEqual({ type: "snapshot", state: foldDecisions(after) });
      break;
    }
  }, 30_000);

  it("relays a new PRIVATE ceo.approval_requested to the CEO socket and not to an office socket", async () => {
    const ceo = await attemptCeo();
    if (!ceo.opened) throw new Error("ceo socket refused");
    await ceo.first;
    const office = await attempt("test-browser-access-token");
    if (!office.opened) throw new Error("office socket refused");
    await nextMessage(office.ws);

    const request = privateApprovalRequest();
    const ceoNext = nextMessage(ceo.ws);
    const officeNext = nextMessage(office.ws);
    expect((await postEvent(request)).status).toBe(202);
    const received = (await ceoNext) as { type: string; event: { id: string } };
    expect({ type: received.type, id: received.event.id }).toEqual({ type: "event", id: request.id });

    // The office's next message is the INTERNAL marker posted after, never the request.
    const marker = {
      id: randomUUID(),
      type: "worker.heartbeat",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: {},
    };
    expect((await postEvent(marker)).status).toBe(202);
    expect(((await officeNext) as { event: { id: string } }).event.id).toBe(marker.id);

    ceo.ws.close();
    office.ws.close();
  });

  it("a CEO decision on a pending request reaches the CEO socket as ceo.decision_made", async () => {
    const worker = await connectWorker();
    const request = privateApprovalRequest();
    expect((await postEvent(request)).status).toBe(202);
    const ceo = await attemptCeo();
    if (!ceo.opened) throw new Error("ceo socket refused");
    await ceo.first;

    const ceoNext = nextMessage(ceo.ws);
    const res = await server.inject({
      method: "POST",
      url: `/ceo/api/decisions/${request.payload.decisionId}`,
      headers: { "content-type": "application/json", origin: CEO_ORIGIN, "x-pixelfirm-csrf": "1" },
      payload: JSON.stringify({ action: "reject" }),
    });
    expect(res.statusCode).toBe(202);
    const received = (await ceoNext) as { type: string; event: { type: string; payload: { decisionId: string } } };
    expect({ type: received.type, eventType: received.event.type, decisionId: received.event.payload.decisionId }).toEqual({
      type: "event",
      eventType: "ceo.decision_made",
      decisionId: request.payload.decisionId,
    });

    ceo.ws.close();
    worker.close();
  });
});

describe("GET /ws/browser ordering (WR-01 regression)", () => {
  it("the first message received is always the snapshot, even when a POST /events broadcast fires immediately after the socket opens (no snapshot-drain delay)", async () => {
    const result = await attempt("test-browser-access-token");
    expect(result.opened).toBe(true);
    if (!result.opened) throw new Error("unreachable");

    // Deliberately no `await nextMessage(result.ws)` snapshot-drain here —
    // fire the POST immediately after the socket opens, racing the
    // connect handler's own snapshot send. Pre-fix, registerBrowserSocket
    // ran before the snapshot was built/sent, so this event could reach
    // the client first.
    const event = {
      id: randomUUID(),
      type: "worker.heartbeat",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: {},
    };

    const firstMsgPromise = nextMessage(result.ws);
    const res = await fetch(`${httpBaseUrl}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${workerToken}` },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(202);

    const first = (await firstMsgPromise) as { type: string };
    expect(first.type).toBe("snapshot");

    result.ws.close();
  });

  it("CR-03: an event posted while the connect handler is still building its snapshot is delivered AFTER the snapshot, never dropped", async () => {
    const result = await attempt("test-browser-access-token");
    expect(result.opened).toBe(true);
    if (!result.opened) throw new Error("unreachable");

    // Again no snapshot-drain: the POST races the handler's awaited SELECT.
    // Pre-fix the socket was registered only after the snapshot send, so an
    // event committed inside that window reached neither the snapshot nor
    // the relay and was lost for the life of the connection — this waits
    // for two messages and would time out rather than see the event.
    const event = {
      id: randomUUID(),
      type: "worker.heartbeat",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: {},
    };

    const bothPromise = collectMessages(result.ws, 2);
    const res = await fetch(`${httpBaseUrl}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${workerToken}` },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(202);

    const [first, second] = (await bothPromise) as [{ type: string }, { type: string; event: { id: string } }];
    expect(first.type).toBe("snapshot");
    expect(second.type).toBe("event");
    expect(second.event.id).toBe(event.id);

    result.ws.close();
  });
});

describe("GET /ws/browser rate limiting (T-05-04)", () => {
  it("the 21st upgrade attempt within a minute is rejected with 429", async () => {
    // Dedicated server so the quota isn't shared with the tests above.
    const limited = buildServer();
    await limited.listen({ port: 0 });
    const address = limited.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const url = `ws://127.0.0.1:${port}/ws/browser`;

    const statuses: number[] = [];
    try {
      for (let i = 0; i < 21; i++) {
        statuses.push(
          await new Promise<number>((resolve) => {
            const ws = new WebSocket(url);
            ws.once("open", () => {
              ws.close();
              resolve(101);
            });
            ws.once("unexpected-response", (_req, res) => {
              res.resume();
              resolve(res.statusCode ?? 0);
            });
          }),
        );
      }
    } finally {
      await limited.close();
    }

    // Unauthenticated attempts still count: limiter runs before auth.
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
