process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const initMigrationPath = fileURLToPath(new URL("../../drizzle/0000_init.sql", import.meta.url));
const triggerMigrationPath = fileURLToPath(
  new URL("../../drizzle/0001_append_only_trigger.sql", import.meta.url),
);

let rawClient: Client;
let eventId: string;

async function applyIdempotently(client: Client, sql: string) {
  try {
    await client.query(sql);
  } catch (err) {
    // Tolerate re-running against a DB already migrated by `drizzle-kit
    // migrate` (Task 2's verify chain runs that before this test file).
    if (!(err instanceof Error) || !/already exists/.test(err.message)) throw err;
  }
}

beforeAll(async () => {
  const migrateClient = new Client({ connectionString: process.env.DATABASE_URL });
  await migrateClient.connect();
  await applyIdempotently(migrateClient, readFileSync(initMigrationPath, "utf8"));
  await applyIdempotently(migrateClient, readFileSync(triggerMigrationPath, "utf8"));
  await migrateClient.end();

  eventId = randomUUID();
  rawClient = new Client({ connectionString: process.env.DATABASE_URL });
  await rawClient.connect();
  await rawClient.query(
    `INSERT INTO events (id, type, version, occurred_at, company_id, visibility, payload)
     VALUES ($1, 'company.started', 1, now(), 'company-1', 'INTERNAL', '{}'::jsonb)`,
    [eventId],
  );
});

afterAll(async () => {
  await rawClient.end();
});

describe("events table append-only enforcement", () => {
  it("rejects a direct UPDATE with an append-only exception", async () => {
    await expect(
      rawClient.query("UPDATE events SET payload = $1 WHERE id = $2", ["{}", eventId]),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects a direct DELETE with an append-only exception", async () => {
    await expect(rawClient.query("DELETE FROM events WHERE id = $1", [eventId])).rejects.toThrow(
      /append-only/,
    );
  });
});
