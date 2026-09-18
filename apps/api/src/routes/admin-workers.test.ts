process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { workers } from "../db/schema.js";
import type { buildServer as buildServerType } from "../server.js";
import type { db as dbType } from "../db/client.js";

const migrationPaths = [
  "../../drizzle/0000_init.sql",
  "../../drizzle/0001_append_only_trigger.sql",
  "../../drizzle/0002_workers_table.sql",
].map((p) => fileURLToPath(new URL(p, import.meta.url)));

let buildServer: typeof buildServerType;
let db: typeof dbType;
let fastify: ReturnType<typeof buildServerType>;

async function applyIdempotently(client: Client, sql: string) {
  try {
    await client.query(sql);
  } catch (err) {
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
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

  fastify = buildServer();
});

afterAll(async () => {
  await fastify.close();
  await db.$client.end();
});

describe("admin/workers auth gate", () => {
  it("(1) rejects all three routes with 401 when X-Bootstrap-Secret is missing", async () => {
    const issue = await fastify.inject({ method: "POST", url: "/admin/workers", payload: {} });
    expect(issue.statusCode).toBe(401);

    const list = await fastify.inject({ method: "GET", url: "/admin/workers" });
    expect(list.statusCode).toBe(401);

    const revoke = await fastify.inject({ method: "POST", url: "/admin/workers/any-id/revoke" });
    expect(revoke.statusCode).toBe(401);
  });

  it("(1b) rejects all three routes with 401 when X-Bootstrap-Secret is wrong", async () => {
    const headers = { "x-bootstrap-secret": "wrong-secret" };
    const issue = await fastify.inject({ method: "POST", url: "/admin/workers", payload: {}, headers });
    expect(issue.statusCode).toBe(401);

    const list = await fastify.inject({ method: "GET", url: "/admin/workers", headers });
    expect(list.statusCode).toBe(401);

    const revoke = await fastify.inject({ method: "POST", url: "/admin/workers/any-id/revoke", headers });
    expect(revoke.statusCode).toBe(401);
  });
});

describe("POST /admin/workers", () => {
  it("(2) issues a credential and returns 201 with a token field", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/admin/workers",
      headers: { "x-bootstrap-secret": "test-bootstrap" },
      payload: { label: "test-worker" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty("token");
    expect(body.token).toMatch(/^[0-9a-f-]+\.[0-9a-f]{64}$/);
    expect(body.label).toBe("test-worker");
  });
});

describe("GET /admin/workers", () => {
  it("(3) never leaks the secretHash or the raw secret in its response body", async () => {
    const issueResponse = await fastify.inject({
      method: "POST",
      url: "/admin/workers",
      headers: { "x-bootstrap-secret": "test-bootstrap" },
      payload: {},
    });
    const { workerId, token } = issueResponse.json();
    const rawSecret = token.split(".").slice(1).join(".");

    const [row] = await db.select({ secretHash: workers.secretHash }).from(workers).where(eq(workers.id, workerId));

    const listResponse = await fastify.inject({
      method: "GET",
      url: "/admin/workers",
      headers: { "x-bootstrap-secret": "test-bootstrap" },
    });
    const rawBody = listResponse.body;

    expect(rawBody).not.toContain(row!.secretHash);
    expect(rawBody).not.toContain(rawSecret);
    expect(rawBody).not.toContain("secretHash");
    expect(rawBody).not.toContain("token");
  });
});

describe("POST /admin/workers/:id/revoke", () => {
  it("(4) revoking a known worker sets revokedAt, visible in a subsequent GET list", async () => {
    const issueResponse = await fastify.inject({
      method: "POST",
      url: "/admin/workers",
      headers: { "x-bootstrap-secret": "test-bootstrap" },
      payload: {},
    });
    const { workerId } = issueResponse.json();

    const revokeResponse = await fastify.inject({
      method: "POST",
      url: `/admin/workers/${workerId}/revoke`,
      headers: { "x-bootstrap-secret": "test-bootstrap" },
    });
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().revokedAt).not.toBeNull();

    const listResponse = await fastify.inject({
      method: "GET",
      url: "/admin/workers",
      headers: { "x-bootstrap-secret": "test-bootstrap" },
    });
    const list = listResponse.json() as Array<{ id: string; revokedAt: string | null }>;
    const found = list.find((w) => w.id === workerId);
    expect(found?.revokedAt).not.toBeNull();
  });

  it("(5) revoking an unknown worker id returns 404", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: `/admin/workers/${randomUUID()}/revoke`,
      headers: { "x-bootstrap-secret": "test-bootstrap" },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("rate limiting", () => {
  it("(6) the 11th POST /admin/workers request in a tight loop returns 429", async () => {
    // Dedicated server instance so this test's quota isn't shared with the
    // POST /admin/workers calls issued by the describe blocks above.
    const rateLimitedServer = buildServer();

    let last: Awaited<ReturnType<typeof rateLimitedServer.inject>> | undefined;
    for (let i = 0; i < 11; i++) {
      last = await rateLimitedServer.inject({
        method: "POST",
        url: "/admin/workers",
        headers: { "x-bootstrap-secret": "test-bootstrap" },
        payload: {},
      });
    }

    expect(last?.statusCode).toBe(429);
    await rateLimitedServer.close();
  });
});
