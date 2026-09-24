// env.ts parses eagerly at import time, so process.env is set first and every
// env-dependent module is loaded with a dynamic import() in beforeAll.
// Bypass off and no CF_ACCESS_* settings: the verifier is injected per test.
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5434/pixelfirm_test";
process.env.CREDENTIAL_PEPPER = "test-pepper";
process.env.BOOTSTRAP_SECRET = "test-bootstrap";
process.env.BROWSER_ACCESS_TOKEN = "test-browser-access-token";
process.env.CEO_ALLOWED_ORIGINS = "http://localhost:5173";
process.env.CEO_EMAIL = "ceo@example.com";
delete process.env.CEO_DEV_AUTH_BYPASS;
delete process.env.CF_ACCESS_TEAM_DOMAIN;
delete process.env.CF_ACCESS_AUD;

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { WebSocket } from "ws";
import { and, eq, sql } from "drizzle-orm";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { events, workers } from "../db/schema.js";
import type { buildServer as buildServerType } from "../server.js";
import type { db as dbType } from "../db/client.js";

const TEAM = "https://pixelfirm-test.cloudflareaccess.com";
const AUD = "test-access-aud-tag";
const WORKER_ID = "ceo-auth-test-worker";

type Verifier = (token: string) => Promise<string>;
type MakeVerifier = (opts: { teamDomain: string; audience: string; jwks?: unknown }) => Verifier;

// Namespace import so a missing export fails on an assertion, not on ESM linking.
let auth: Record<string, unknown>;
let buildServer: typeof buildServerType;
let db: typeof dbType;
let server: Awaited<ReturnType<typeof buildServerType>>;
let workerToken: string;
let worker: WebSocket | undefined;
let wsBaseUrl: string;

let signingKey: CryptoKey;
let foreignKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

function makeVerifier(): Verifier {
  expect(typeof auth.makeAccessVerifier).toBe("function");
  return (auth.makeAccessVerifier as MakeVerifier)({ teamDomain: TEAM, audience: AUD, jwks });
}

function setVerifier(v: Verifier | null) {
  expect(typeof auth._setAccessVerifierForTests).toBe("function");
  (auth._setAccessVerifierForTests as (v: Verifier | null) => void)(v);
}

function sign(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; iss?: string; aud?: string; exp?: string | number } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? TEAM)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.key ?? signingKey);
}

async function applyIdempotently(client: Client, text: string) {
  try {
    await client.query(text);
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

/** A PRIVATE ceo.approval_requested posted by the connected fake worker. */
async function openRequest() {
  if (worker?.readyState !== WebSocket.OPEN) worker = await connectWorker();
  const taskId = `task-${randomUUID()}`;
  const decisionId = randomUUID();
  const res = await server.inject({
    method: "POST",
    url: "/events",
    headers: { authorization: `Bearer ${workerToken}` },
    payload: {
      id: randomUUID(),
      type: "ceo.approval_requested",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "company-1",
      taskId,
      visibility: "PRIVATE",
      payload: { taskId, reason: "needs CEO approval", decisionId, kind: "ceo_gated_tool", toolName: "Bash" },
    },
  });
  expect(res.statusCode).toBe(202);
  return decisionId;
}

function postDecision(decisionId: string, headers: Record<string, string> = {}, query = "") {
  return server.inject({
    method: "POST",
    url: `/ceo/api/decisions/${decisionId}${query}`,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:5173",
      "x-pixelfirm-csrf": "1",
      ...headers,
    },
    payload: JSON.stringify({ action: "approve" }),
  });
}

async function decisionRows(decisionId: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.type, "ceo.decision_made"), sql`${events.payload}->>'decisionId' = ${decisionId}`));
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (const p of [
    "../../drizzle/0000_init.sql",
    "../../drizzle/0001_append_only_trigger.sql",
    "../../drizzle/0002_workers_table.sql",
    "../../drizzle/0003_no_truncate_trigger.sql",
    "../../drizzle/0004_ceo_decision_once.sql",
    "../../drizzle/0005_ceo_request_once.sql",
  ]) {
    await applyIdempotently(client, readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8"));
  }
  await client.end();

  auth = (await import("./ceo-auth.js")) as Record<string, unknown>;
  ({ buildServer } = await import("../server.js"));
  ({ db } = await import("../db/client.js"));
  const { issueCredential } = await import("./credentials.js");

  const issued = issueCredential(WORKER_ID);
  workerToken = issued.token;
  await db
    .insert(workers)
    .values({ id: WORKER_ID, secretHash: issued.secretHash })
    .onConflictDoUpdate({ target: workers.id, set: { secretHash: issued.secretHash, revokedAt: null } });

  server = buildServer();
  await server.listen({ port: 0, host: "127.0.0.1" });
  const address = server.server.address();
  wsBaseUrl = `ws://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  worker?.close();
  await server.close();
  await db.$client.end();
});

describe("makeAccessVerifier (local RS256 JWKS, no network)", () => {
  it("resolves a token with the right iss/aud/email to the lowercased email", async () => {
    const verify = makeVerifier();
    await expect(verify(await sign({ email: "CEO@Example.com" }))).resolves.toBe("ceo@example.com");
  });

  it("rejects a wrong audience", async () => {
    await expect(makeVerifier()(await sign({ email: "ceo@example.com" }, { aud: "other-app" }))).rejects.toThrow();
  });

  it("rejects a wrong issuer", async () => {
    const token = await sign({ email: "ceo@example.com" }, { iss: "https://evil.cloudflareaccess.com" });
    await expect(makeVerifier()(token)).rejects.toThrow();
  });

  it("rejects a token signed by another key", async () => {
    await expect(makeVerifier()(await sign({ email: "ceo@example.com" }, { key: foreignKey }))).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await sign({ email: "ceo@example.com" }, { exp: Math.floor(Date.now() / 1000) - 600 });
    await expect(makeVerifier()(token)).rejects.toThrow();
  });

  it("rejects a token with no email claim (a service token)", async () => {
    await expect(makeVerifier()(await sign({ common_name: "svc.access" }))).rejects.toThrow();
  });

  it("rejects an HS256 token", async () => {
    const token = await new SignJWT({ email: "ceo@example.com" })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("a-shared-secret-at-least-32-bytes-long!!"));
    await expect(makeVerifier()(token)).rejects.toThrow();
  });
});

describe("requireCeo with the Access verifier (bypass off)", () => {
  afterEach(() => setVerifier(null));

  it("accepts a valid Cf-Access-Jwt-Assertion for CEO_EMAIL: 202 and decidedBy is the verified email", async () => {
    setVerifier(makeVerifier());
    const decisionId = await openRequest();
    const res = await postDecision(decisionId, { "cf-access-jwt-assertion": await sign({ email: "ceo@example.com" }) });
    expect(res.statusCode).toBe(202);
    const [row] = await decisionRows(decisionId);
    expect((row.payload as { decidedBy: string }).decidedBy).toBe("ceo@example.com");
  });

  it("accepts the same token in a CF_Authorization cookie", async () => {
    setVerifier(makeVerifier());
    const decisionId = await openRequest();
    const token = await sign({ email: "ceo@example.com" });
    const res = await postDecision(decisionId, { cookie: `theme=dark; CF_Authorization=${token}; other=1` });
    expect(res.statusCode).toBe(202);
    expect(await decisionRows(decisionId)).toHaveLength(1);
  });

  it("refuses a valid token for another email with 401", async () => {
    setVerifier(makeVerifier());
    const decisionId = await openRequest();
    const res = await postDecision(decisionId, {
      "cf-access-jwt-assertion": await sign({ email: "other@example.com" }),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });

  it("refuses a request with no token with 401", async () => {
    setVerifier(makeVerifier());
    const decisionId = await openRequest();
    const res = await postDecision(decisionId);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("refuses BROWSER_ACCESS_TOKEN as a Bearer header and as ?token= with 401", async () => {
    setVerifier(makeVerifier());
    const decisionId = await openRequest();
    const bearer = await postDecision(decisionId, { authorization: "Bearer test-browser-access-token" });
    expect(bearer.statusCode).toBe(401);
    expect(bearer.json()).toEqual({ error: "unauthorized" });
    const query = await postDecision(decisionId, {}, "?token=test-browser-access-token");
    expect(query.statusCode).toBe(401);
    expect(query.json()).toEqual({ error: "unauthorized" });
    expect(await decisionRows(decisionId)).toHaveLength(0);
  });

  it("GET /ceo/api/me returns the verified email and devBypass false", async () => {
    setVerifier(makeVerifier());
    const res = await server.inject({
      method: "GET",
      url: "/ceo/api/me",
      headers: { "cf-access-jwt-assertion": await sign({ email: "ceo@example.com" }) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: "ceo@example.com", devBypass: false });
  });

  it("GET /ceo/api/me without a token is 401", async () => {
    setVerifier(makeVerifier());
    const res = await server.inject({ method: "GET", url: "/ceo/api/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("fails closed with 401 on every /ceo/api request when no Access settings are configured", async () => {
    setVerifier(null);
    const decisionId = await openRequest();
    const res = await postDecision(decisionId, { "cf-access-jwt-assertion": await sign({ email: "ceo@example.com" }) });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    expect(await decisionRows(decisionId)).toHaveLength(0);
    const me = await server.inject({
      method: "GET",
      url: "/ceo/api/me",
      headers: { "cf-access-jwt-assertion": await sign({ email: "ceo@example.com" }) },
    });
    expect(me.statusCode).toBe(401);
  });
});
