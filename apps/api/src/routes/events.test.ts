// env.ts parses eagerly at import time. Static ES module imports are hoisted
// above any other top-level statement regardless of textual order, so setting
// process.env here is not enough on its own — anything that transitively
// imports env.ts (../server, ../db/client) must be loaded via a dynamic
// import() *after* these assignments run, not a static import.
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { events } from "../db/schema.js";
import type { buildServer as buildServerType } from "../server.js";
import type { db as dbType } from "../db/client.js";

const migrationPath = fileURLToPath(new URL("../../drizzle/0000_init.sql", import.meta.url));

let buildServer: typeof buildServerType;
let db: typeof dbType;

beforeAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = readFileSync(migrationPath, "utf8");
  await client.query(sql);
  await client.end();

  ({ buildServer } = await import("../server.js"));
  ({ db } = await import("../db/client.js"));
});

afterAll(async () => {
  await db.$client.end();
});

describe("POST /events", () => {
  it("durably persists a valid synthetic event and dedupes a repeated event.id", async () => {
    const fastify = buildServer();
    const event = {
      id: randomUUID(),
      type: "company.started",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      visibility: "INTERNAL",
      payload: { name: "Acme Co" },
    };

    const first = await fastify.inject({ method: "POST", url: "/events", payload: event });
    expect(first.statusCode).toBe(202);

    const rowsAfterFirst = await db.select().from(events).where(eq(events.id, event.id));
    expect(rowsAfterFirst).toHaveLength(1);

    const second = await fastify.inject({ method: "POST", url: "/events", payload: event });
    expect(second.statusCode).toBe(202);

    const rowsAfterSecond = await db.select().from(events).where(eq(events.id, event.id));
    expect(rowsAfterSecond).toHaveLength(1);

    await fastify.close();
  });
});
