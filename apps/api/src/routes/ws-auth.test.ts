process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { WebSocket } from "ws";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
let server: Awaited<ReturnType<typeof buildServerType>>;
let token: string;

async function applyIdempotently(client: Client, sql: string) {
  try {
    await client.query(sql);
  } catch (err) {
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
  }
}

function connect(headers?: Record<string, string>) {
  return new WebSocket(`${baseUrl}/ws`, { headers });
}

/** Resolves with { opened } / { rejected: statusCode, body } — never throws. */
function attempt(headers?: Record<string, string>): Promise<
  { opened: true } | { opened: false; statusCode: number; body: string }
> {
  return new Promise((resolve) => {
    const ws = connect(headers);
    ws.once("open", () => {
      resolve({ opened: true });
      ws.close();
    });
    ws.once("unexpected-response", (_req, res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ opened: false, statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
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

  const issued = issueCredential("worker-1");
  token = issued.token;
  // Upsert: re-running this suite against an already-migrated DB (e.g. the
  // plan's own verify chain running credentials.test.ts's DB then this
  // file) must not fail on a leftover row from a prior run.
  await db
    .insert(workers)
    .values({ id: "worker-1", secretHash: issued.secretHash })
    .onConflictDoUpdate({
      target: workers.id,
      set: { secretHash: issued.secretHash, revokedAt: null },
    });

  server = buildServer();
  await server.listen({ port: 0 });
  const address = server.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.close();
  await db.$client.end();
});

describe("GET /ws auth", () => {
  it("(a) rejects with 401 when no Authorization header is present", async () => {
    const result = await attempt();
    expect(result.opened).toBe(false);
    if (!result.opened) expect(result.statusCode).toBe(401);
  });

  it("(b) rejects with 401 for a malformed token (no dot separator)", async () => {
    const result = await attempt({ Authorization: "Bearer not-a-valid-token" });
    expect(result.opened).toBe(false);
    if (!result.opened) expect(result.statusCode).toBe(401);
  });

  it("(c)/(d) unknown workerId and wrong-secret produce byte-identical 401 responses (enumeration resistance)", async () => {
    const unknownWorker = await attempt({ Authorization: "Bearer no-such-worker.deadbeef" });
    const wrongSecret = await attempt({ Authorization: "Bearer worker-1.wrongsecretwrongsecret" });

    expect(unknownWorker.opened).toBe(false);
    expect(wrongSecret.opened).toBe(false);
    if (unknownWorker.opened || wrongSecret.opened) throw new Error("unreachable");

    expect(unknownWorker.statusCode).toBe(401);
    expect(wrongSecret.statusCode).toBe(401);
    expect(unknownWorker.statusCode).toBe(wrongSecret.statusCode);
    expect(unknownWorker.body).toBe(wrongSecret.body);
  });

  it("(e) accepts a valid, unrevoked credential (open event fires)", async () => {
    const result = await attempt({ Authorization: `Bearer ${token}` });
    expect(result.opened).toBe(true);
  });

  it("rejects a new connection attempt with the same credential after revocation", async () => {
    await db.update(workers).set({ revokedAt: new Date() }).where(eq(workers.id, "worker-1"));

    const result = await attempt({ Authorization: `Bearer ${token}` });
    expect(result.opened).toBe(false);
    if (!result.opened) expect(result.statusCode).toBe(401);
  });
});
