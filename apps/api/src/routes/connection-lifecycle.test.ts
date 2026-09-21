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
let baseUrl: string;
let httpBaseUrl: string;
let server: Awaited<ReturnType<typeof buildServerType>>;
let token: string;

async function applyIdempotently(client: Client, sql: string) {
  try {
    await client.query(sql);
  } catch (err) {
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWorkerStatus(): Promise<string> {
  const res = await fetch(`${httpBaseUrl}/admin/workers`, {
    headers: { "x-bootstrap-secret": "test-bootstrap" },
  });
  const rows = (await res.json()) as Array<{ id: string; status: string }>;
  const row = rows.find((r) => r.id === "worker-lifecycle-1");
  if (!row) throw new Error("worker-lifecycle-1 not found in GET /admin/workers response");
  return row.status;
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

  const issued = issueCredential("worker-lifecycle-1");
  token = issued.token;
  await db
    .insert(workers)
    .values({ id: "worker-lifecycle-1", secretHash: issued.secretHash })
    .onConflictDoUpdate({
      target: workers.id,
      set: { secretHash: issued.secretHash, revokedAt: null },
    });

  server = buildServer();
  await server.listen({ port: 0 });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `ws://127.0.0.1:${port}`;
  httpBaseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.close();
  await db.$client.end();
});

describe("worker connection lifecycle (RUNTIME-04)", () => {
  it("reports 'online' after WS open + a worker.heartbeat via POST /events, then 'offline' after the socket closes", async () => {
    const ws = new WebSocket(`${baseUrl}/ws`, { headers: { Authorization: `Bearer ${token}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("unexpected-response", (_req, res) => reject(new Error(`WS rejected: ${res.statusCode}`)));
    });

    const heartbeatEvent = {
      id: randomUUID(),
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      type: "worker.heartbeat",
      payload: {},
    };

    const postRes = await fetch(`${httpBaseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(heartbeatEvent),
    });
    expect(postRes.status).toBe(202);

    expect(await getWorkerStatus()).toBe("online");

    const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.close();
    await closed;
    // Give the server-side socket "close" handler a tick to run before reading state.
    await wait(50);

    expect(await getWorkerStatus()).toBe("offline");
  });
});
