import { spawn, type ChildProcess } from "node:child_process";
import { test, expect, type WebSocketRoute } from "@playwright/test";

// Local-only: boots apps/web's vite dev server and fakes /ws/browser via
// page.routeWebSocket, so no staging or API is needed.
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const BANNER_TEXT = "Disconnected from the office feed — what you see is the last known state, not live.";
let vite: ChildProcess;

test.beforeAll(async () => {
  test.setTimeout(90_000);
  vite = spawn("pnpm", ["--filter", "web", "exec", "vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    shell: true,
    env: { ...process.env, VITE_WS_BASE_URL: "ws://fake-office.test", VITE_BROWSER_ACCESS_TOKEN: "t" },
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite dev server did not start");
});

test.afterAll(() => {
  if (vite.pid) spawn("taskkill", ["/pid", String(vite.pid), "/T", "/F"], { shell: true });
  vite.kill();
});

test("office shows the disconnect banner only after the feed socket closes", async ({ page }) => {
  let route!: WebSocketRoute;
  let resolveConnected!: () => void;
  const connected = new Promise<void>((r) => (resolveConnected = r));
  await page.routeWebSocket(/\/ws\/browser/, (ws) => {
    route = ws;
    resolveConnected();
  });

  await page.goto(BASE);
  await connected;
  await page.waitForTimeout(300);
  await expect(page.getByRole("status")).toHaveCount(0);

  await route.close();

  const banner = page.getByRole("status");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(BANNER_TEXT);
});
