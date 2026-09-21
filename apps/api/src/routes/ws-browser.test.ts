process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";
process.env.BROWSER_ACCESS_TOKEN = "test-browser-access-token";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { WebSocket } from "ws";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { workers } from "../db/schema.js";
import type { buildServer as buildServerType } from "../server.js";
import type { db as dbType } from "../db/client.js";
import type { issueCredential as issueCredentialType } from "../auth/credentials.js";

const migrationPaths = [
  "../../drizzle/0000_init.sql",
  "../../drizzle/0001_append_only_trigger.sql",
  "../../drizzle/0002_workers_table.sql",
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
});
