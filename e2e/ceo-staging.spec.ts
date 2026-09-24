import { test, expect, type APIResponse } from "@playwright/test";

// Staging-only (baseURL = PIXELFIRM_STAGING_URL, like control-plane.spec.ts): proves the
// Cloudflare Access app covers exactly /ceo (D-11) and leaves the worker paths to the API.
// Run by path: npx playwright test e2e/ceo-staging.spec.ts

function expectAccessRedirect(res: APIResponse) {
  expect(res.status()).toBe(302);
  const location = res.headers()["location"];
  expect(location, "Access redirect has a Location header").toBeTruthy();
  expect(new URL(location).hostname.endsWith(".cloudflareaccess.com")).toBe(true);
}

test.describe("Phase 6 CEO dashboard — staging Access boundary", () => {
  test("/ceo is redirected to the Access login", async ({ request }) => {
    expectAccessRedirect(await request.get("/ceo", { maxRedirects: 0 }));
  });

  test("/ceo/api/me is redirected to the Access login", async ({ request }) => {
    expectAccessRedirect(await request.get("/ceo/api/me", { maxRedirects: 0 }));
  });

  test("a forged Cf-Access-Jwt-Assertion header is still stopped by Access", async ({ request }) => {
    const res = await request.get("/ceo/api/me", {
      maxRedirects: 0,
      headers: { "Cf-Access-Jwt-Assertion": "forged.jwt.value" },
    });
    expect(res.status()).not.toBe(200);
    expectAccessRedirect(res);
  });

  test("/health is not behind Access", async ({ request }) => {
    const res = await request.get("/health", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("unauthenticated POST /events reaches the API's own 401, not Access", async ({ request }) => {
    const res = await request.post("/events", { maxRedirects: 0, data: {} });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
