import { spawn, type ChildProcess } from "node:child_process";
import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import type { CompanyEvent } from "../packages/event-schema/src/index";
import { foldDecisions, emptyDecisions } from "../packages/company-core/src/decisions";

// Local-only: boots apps/web's vite dev server and fakes GET /ceo/api/me (page.route) and
// /ceo/ws (page.routeWebSocket), so no API, Postgres or Cloudflare Access is needed.
const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = "ceo@pixelfirm.dev";
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

// ---- fixtures -------------------------------------------------------------------------------

let seq = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function envelope(occurredAt: string, sourceAgentId?: string) {
  return {
    id: uuid(900_000 + ++seq),
    version: 1,
    occurredAt,
    companyId: "company-1",
    visibility: "PRIVATE" as const,
    ...(sourceAgentId ? { sourceAgentId } : {}),
  };
}

function requested(
  n: number,
  opts: { agent: string; title: string; reason: string; kind: "clarifying_question" | "ceo_gated_tool"; at: string; thread?: number; worktreePath?: string },
): CompanyEvent {
  return {
    ...envelope(opts.at, opts.agent),
    type: "ceo.approval_requested",
    payload: {
      taskId: `task-${n}`,
      reason: opts.reason,
      decisionId: uuid(n),
      ...(opts.thread ? { threadId: uuid(opts.thread) } : {}),
      kind: opts.kind,
      title: opts.title,
      taskTitle: `Task ${n}`,
      worktreePath: opts.worktreePath ?? `/srv/worktrees/project-${n}`,
    },
  };
}

function decided(n: number, action: "approve" | "discuss", at: string): CompanyEvent {
  return {
    ...envelope(at),
    type: "ceo.decision_made",
    payload: { decisionId: uuid(n), taskId: `task-${n}`, action, decidedBy: EMAIL },
  };
}

// Three pending threads, oldest first: a gated force-push (30 min), a question (20 min)
// and round 2 of a Discuss thread (5 min) whose round 1 was requested 40 min ago.
function threeEvents(): CompanyEvent[] {
  return [
    requested(1, {
      agent: "ada",
      title: "Force-push the rebased branch?",
      reason: "Bash command matched a CEO-gated pattern: force-push",
      kind: "ceo_gated_tool",
      at: minutesAgo(30),
      worktreePath: "/srv/worktrees/landing-page",
    }),
    requested(10, { agent: "bob", title: "Pick a pricing tier", reason: "q", kind: "clarifying_question", at: minutesAgo(40), thread: 10 }),
    decided(10, "discuss", minutesAgo(35)),
    requested(2, { agent: "cy", title: "Which colour for the CTA?", reason: "question", kind: "clarifying_question", at: minutesAgo(20) }),
    requested(11, { agent: "bob", title: "Pick a pricing tier, round two", reason: "q", kind: "clarifying_question", at: minutesAgo(5), thread: 10 }),
  ];
}

// ---- harness --------------------------------------------------------------------------------

async function fakeMe(page: Page, body: object, status = 200) {
  await page.route("**/ceo/api/me", (route) => route.fulfill({ status, json: body }));
}

/** Fakes /ceo/ws. `onConnect` runs for every (re)connect; the latest route is returned via the getter. */
async function fakeFeed(page: Page, onConnect: (ws: WebSocketRoute) => void = () => {}) {
  let latest: WebSocketRoute | undefined;
  let resolveFirst!: () => void;
  const first = new Promise<void>((r) => (resolveFirst = r));
  await page.routeWebSocket(/\/ceo\/ws$/, (ws) => {
    latest = ws;
    onConnect(ws);
    resolveFirst();
  });
  return { connected: first, ws: () => latest! };
}

const snapshot = (events: CompanyEvent[]) => JSON.stringify({ type: "snapshot", state: foldDecisions(events) });
const eventFrame = (event: CompanyEvent) => JSON.stringify({ type: "event", event });

const queue = (page: Page) => page.getByRole("region", { name: "Pending queue" });

// ---- Task 1: shell, auth, loading, empty, error ----------------------------------------------

test("a 401 from /ceo/api/me shows the auth-failure copy and never the queue", async ({ page }) => {
  await fakeMe(page, { error: "unauthorized" }, 401);
  await fakeFeed(page);
  await page.goto(`${BASE}/ceo`);
  await expect(
    page.getByText("You're not signed in as the CEO. This page is behind Cloudflare Access. Reload to sign in again.", { exact: true }),
  ).toBeVisible();
  await expect(queue(page)).toHaveCount(0);
});

test("the dev bypass shows its banner with the recorded identity", async ({ page }) => {
  await fakeMe(page, { email: "dev-bypass@pixelfirm.invalid", devBypass: true });
  await fakeFeed(page, (ws) => ws.send(snapshot([])));
  await page.goto(`${BASE}/ceo`);
  await expect(
    page.getByText("Dev auth bypass is on. Decisions are recorded as dev-bypass@pixelfirm.invalid.", { exact: true }),
  ).toBeVisible();
});

test("before the first snapshot the queue shows 3 skeleton rows and no empty-state copy", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page); // open, but never sends a snapshot
  await page.goto(`${BASE}/ceo`);
  await feed.connected;
  await expect(queue(page).locator("[data-slot=skeleton]")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Decision detail" }).locator("[data-slot=skeleton]")).toHaveCount(4);
  await expect(page.getByText("No decisions waiting")).toHaveCount(0);
});

test("an empty snapshot shows the empty state and no pending badge", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(JSON.stringify({ type: "snapshot", state: emptyDecisions() })));
  await page.goto(`${BASE}/ceo`);
  await expect(page.getByText("No decisions waiting", { exact: true })).toBeVisible();
  await expect(
    page.getByText("When an agent needs your call, it walks to your office and the request appears here.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pending-badge")).toHaveCount(0);
  await expect(page).toHaveTitle("CEO desk · PixelFirm");
});

test("a feed that fails before any snapshot shows the loading error with Retry", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => void ws.close());
  await page.goto(`${BASE}/ceo`);
  await expect(
    page.getByText("Couldn't load decisions: the live feed disconnected. Check the API is running, then retry.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("the header shows the title, the feed status word and the decider email", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(snapshot([])));
  await page.goto(`${BASE}/ceo`);
  const header = page.getByRole("banner");
  await expect(header.getByRole("heading", { level: 1, name: "CEO desk" })).toBeVisible();
  await expect(header.getByText("Live", { exact: true })).toBeVisible();
  await expect(header.getByText(EMAIL, { exact: true })).toBeVisible();
});

test("loading the office route requests nothing under /src/ceo/ (D-08)", async ({ page }) => {
  const paths: string[] = [];
  page.on("request", (r) => paths.push(new URL(r.url()).pathname));
  await page.goto(BASE);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((p) => p.startsWith("/src/ceo/"))).toEqual([]);

  // Positive control: the same recorder does see the dashboard chunk on /ceo.
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page);
  await page.goto(`${BASE}/ceo`);
  await expect(page.getByRole("heading", { name: "CEO desk" })).toBeVisible();
  expect(paths.some((p) => p.startsWith("/src/ceo/"))).toBe(true);
});

// ---- Task 2: the live pending queue (CEO-02) --------------------------------------------------

const ACCENT = "rgb(255, 183, 3)";

test("three pending decisions list oldest first with kind labels, Round 2 chip, selection and title count", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(snapshot(threeEvents())));
  await page.goto(`${BASE}/ceo`);

  const items = queue(page).getByRole("button");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Force-push the rebased branch?");
  await expect(items.nth(1)).toContainText("Which colour for the CTA?");
  await expect(items.nth(2)).toContainText("Pick a pricing tier, round two");

  await expect(items.nth(0).getByText("Gated action · force-push", { exact: true })).toBeVisible();
  await expect(items.nth(1).getByText("Question", { exact: true })).toBeVisible();
  await expect(items.nth(2).getByText("Round 2", { exact: true })).toBeVisible();
  await expect(items.nth(0).getByText("Round", { exact: false })).toHaveCount(0);

  // Waited time turns accent only after 10 minutes.
  await expect(items.nth(0).getByText("30 min", { exact: true })).toHaveCSS("color", ACCENT);
  await expect(items.nth(2).getByText("5 min", { exact: true })).not.toHaveCSS("color", ACCENT);

  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(queue(page).locator('[aria-current="true"]')).toHaveCount(1);
  await expect(page.getByTestId("pending-badge")).toHaveText("3");
  await expect(page.getByRole("tab", { name: "Pending (3)" })).toBeVisible();
  expect(await page.evaluate(() => document.title)).toBe("(3) CEO desk · PixelFirm");

  const detail = page.getByRole("region", { name: "Decision detail" });
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText("Force-push the rebased branch?");
  await expect(detail.getByText("ada · Task 1 · landing-page · waiting 30 min · #00000000", { exact: true })).toBeVisible();
});

test("a live arrival appends, is announced, and never steals the selection", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot(threeEvents())));
  await page.goto(`${BASE}/ceo`);
  const items = queue(page).getByRole("button");
  await expect(items).toHaveCount(3);

  feed.ws().send(
    eventFrame(
      requested(3, { agent: "dee", title: "Rotate the API key?", reason: "MCP tool: mcp__coolify__deploy", kind: "ceo_gated_tool", at: minutesAgo(0) }),
    ),
  );

  await expect(items).toHaveCount(4);
  await expect(items.nth(3)).toContainText("Rotate the API key?");
  await expect(items.nth(3).getByText("Gated action · mcp__coolify__deploy", { exact: true })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toHaveText("New decision from dee: Rotate the API key?");
  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(items.nth(3)).not.toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("pending-badge")).toHaveText("4");
});

test("when the selected decision is decided elsewhere, the next item is selected", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot(threeEvents())));
  await page.goto(`${BASE}/ceo`);
  const items = queue(page).getByRole("button");
  await expect(items).toHaveCount(3);

  // Select the middle one, then decide it elsewhere: the next (third) item takes over.
  await items.nth(1).click();
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  feed.ws().send(eventFrame(decided(2, "approve", minutesAgo(0))));

  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("Pick a pricing tier, round two");
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("region", { name: "Decision detail" }).getByRole("heading", { level: 2 })).toHaveText(
    "Pick a pricing tier, round two",
  );
});

test("the queue column scrolls on its own while the header and tabs stay put", async ({ page }) => {
  const many = Array.from({ length: 30 }, (_, i) =>
    requested(100 + i, { agent: `agent-${i}`, title: `Decision ${i}`, reason: "q", kind: "clarifying_question", at: minutesAgo(60 - i) }),
  );
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(snapshot(many)));
  await page.goto(`${BASE}/ceo`);
  await expect(queue(page).getByRole("button")).toHaveCount(30);

  const metrics = await queue(page).evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    scrollable: el.scrollHeight > el.clientHeight,
  }));
  expect(metrics).toEqual({ overflowY: "auto", scrollable: true });

  await queue(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(queue(page).getByRole("button").last()).toBeInViewport();
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await expect(page.getByRole("banner")).toBeInViewport();
  await expect(page.getByTestId("pending-badge")).toBeInViewport();
  await expect(page.getByRole("tab", { name: "Pending (30)" })).toBeInViewport();
});
