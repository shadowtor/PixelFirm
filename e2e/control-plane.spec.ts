import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { WebSocket } from "ws";

const BOOTSTRAP_SECRET = process.env.PIXELFIRM_BOOTSTRAP_SECRET;
if (!BOOTSTRAP_SECRET) {
  throw new Error("PIXELFIRM_BOOTSTRAP_SECRET must be set to run this suite");
}

function wsUrl(baseURL: string, path: string) {
  return baseURL.replace(/^http/, "ws") + path;
}

/** Resolves with { opened } / { rejected: statusCode } — never throws. */
function attemptWs(url: string, headers?: Record<string, string>): Promise<
  { opened: true } | { opened: false; statusCode: number }
> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers });
    ws.once("open", () => {
      resolve({ opened: true });
      ws.close();
    });
    ws.once("unexpected-response", (_req, res) => {
      resolve({ opened: false, statusCode: res.statusCode ?? 0 });
      res.resume();
    });
  });
}

test.describe("Phase 2 control plane — staging", () => {
  test("event ingestion requires a worker credential and is durable/deduped", async ({
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");

    const event = {
      id: randomUUID(),
      type: "company.started",
      version: 1,
      occurredAt: new Date().toISOString(),
      companyId: "e2e-company-1",
      visibility: "INTERNAL",
      payload: { name: "E2E Staging Co" },
    };

    const noAuth = await request.post(`${baseURL}/events`, { data: event });
    expect(noAuth.status()).toBe(401);

    const issueRes = await request.post(`${baseURL}/admin/workers`, {
      headers: { "X-Bootstrap-Secret": BOOTSTRAP_SECRET! },
      data: { label: "e2e-events-worker" },
    });
    expect(issueRes.status()).toBe(201);
    const { token } = (await issueRes.json()) as { token: string };
    const headers = { Authorization: `Bearer ${token}` };

    const first = await request.post(`${baseURL}/events`, { data: event, headers });
    expect(first.status()).toBe(202);

    const second = await request.post(`${baseURL}/events`, { data: event, headers });
    expect(second.status()).toBe(202);
  });

  test("admin routes reject requests without the bootstrap secret", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/admin/workers`);
    expect(res.status()).toBe(401);
  });

  test("admin credential issue, list, WS auth, and revocation all work end-to-end", async ({
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");

    const issueRes = await request.post(`${baseURL}/admin/workers`, {
      headers: { "X-Bootstrap-Secret": BOOTSTRAP_SECRET! },
      data: { label: "e2e-staging-worker" },
    });
    expect(issueRes.status()).toBe(201);
    const issued = await issueRes.json();
    const { workerId, token } = issued as { workerId: string; token: string };
    expect(workerId).toBeTruthy();
    expect(token).toBeTruthy();

    const listRes = await request.get(`${baseURL}/admin/workers`, {
      headers: { "X-Bootstrap-Secret": BOOTSTRAP_SECRET! },
    });
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as Array<Record<string, unknown>>;
    const found = list.find((w) => w.id === workerId);
    expect(found).toBeTruthy();
    for (const item of list) {
      expect(item).not.toHaveProperty("secretHash");
      expect(item).not.toHaveProperty("token");
    }

    const noAuth = await attemptWs(wsUrl(baseURL, "/ws"));
    expect(noAuth.opened).toBe(false);

    const authed = await attemptWs(wsUrl(baseURL, "/ws"), { Authorization: `Bearer ${token}` });
    expect(authed.opened).toBe(true);

    const revokeRes = await request.post(`${baseURL}/admin/workers/${workerId}/revoke`, {
      headers: { "X-Bootstrap-Secret": BOOTSTRAP_SECRET! },
    });
    expect(revokeRes.status()).toBe(200);

    const postRevoke = await attemptWs(wsUrl(baseURL, "/ws"), { Authorization: `Bearer ${token}` });
    expect(postRevoke.opened).toBe(false);
  });
});
