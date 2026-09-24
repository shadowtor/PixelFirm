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
// Mid-minute, so a few ms of browser/Node clock skew never floors "30 min" to "29 min".
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000 - 30_000).toISOString();

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
  extra: Partial<Extract<CompanyEvent, { type: "ceo.approval_requested" }>["payload"]> = {},
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
      ...extra,
    },
  };
}

function decided(n: number, action: "approve" | "discuss", at: string, note?: string): CompanyEvent {
  return {
    ...envelope(at),
    type: "ceo.decision_made",
    payload: { decisionId: uuid(n), taskId: `task-${n}`, action, decidedBy: EMAIL, ...(note ? { note } : {}) },
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
  await expect(page.locator('div[aria-live="polite"]')).toHaveText("New decision from dee: Rotate the API key?");
  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(items.nth(3)).not.toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("pending-badge")).toHaveText("4");
});

test("when the selected decision is decided elsewhere, the detail says who decided it until the CEO moves on", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot(threeEvents())));
  await page.goto(`${BASE}/ceo`);
  const items = queue(page).getByRole("button");
  await expect(items).toHaveCount(3);

  // Select the middle one and type a note, then decide it elsewhere (06-10, UI-SPEC "Live updates").
  await items.nth(1).click();
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  await page.getByLabel("Note to agent").fill("Blue, please");
  feed.ws().send(eventFrame(decided(2, "approve", minutesAgo(0))));

  await expect(items).toHaveCount(2);
  const detail = page.getByRole("region", { name: "Decision detail" });
  await expect(detail.getByText("This decision was already made by ceo@pixelfirm.dev just now.", { exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Reject" })).toHaveCount(0);
  await expect(page.getByLabel("Note to agent")).toHaveValue("Blue, please");

  // Moving on is the CEO's click.
  await items.nth(1).click();
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText("Pick a pricing tier, round two");
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

// ---- 06-09 Task 1: detail sections (CEO-02) ---------------------------------------------------

const detailOf = (page: Page) => page.getByRole("region", { name: "Decision detail" });
const sectionOf = (page: Page, heading: string) =>
  detailOf(page).locator("section").filter({ has: page.getByRole("heading", { level: 3, name: heading, exact: true }) });

/** Loads /ceo with a snapshot of `events`; the first pending item is auto-selected. */
async function showSnapshot(page: Page, events: CompanyEvent[]) {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(snapshot(events)));
  await page.goto(`${BASE}/ceo`);
  await expect(detailOf(page).getByRole("heading", { level: 2 })).toBeVisible();
}

const gated = (n: number, extra: Parameters<typeof requested>[2] = {}) =>
  requested(
    n,
    { agent: "ada", title: `Gated ${n}`, reason: "Bash command matched a CEO-gated pattern: force-push", kind: "ceo_gated_tool", at: minutesAgo(3) },
    { toolName: "Bash", toolInput: JSON.stringify({ command: "git push --force origin main" }), ...extra },
  );

function diffOf(paths: string[], truncated = false) {
  return {
    files: paths.map((path) => ({ path, added: 2, removed: 1 })),
    unified: paths
      .flatMap((p) => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, "@@ -1,2 +1,3 @@", " keep", `-old ${p}`, `+new ${p}`, "+more"])
      .join("\n"),
    truncated,
    totalAdded: 900,
    totalRemoved: 12,
  };
}

test("a gated call shows Runs on approve with the tool badge and the exact parked input", async ({ page }) => {
  const input = JSON.stringify({ command: "git push --force origin main", description: "push <b>rebased</b>" });
  await showSnapshot(page, [gated(1, { toolInput: input })]);
  const runs = sectionOf(page, "Runs on approve");
  await expect(runs).toHaveCount(1);
  await expect(runs.getByText("Bash", { exact: true })).toBeVisible();
  expect(await runs.locator("pre").textContent()).toBe(input);
});

test("a question has no Runs on approve section", async ({ page }) => {
  await showSnapshot(page, [
    requested(2, { agent: "cy", title: "Which colour?", reason: "question", kind: "clarifying_question", at: minutesAgo(3) }),
  ]);
  await expect(detailOf(page).getByRole("heading", { level: 3, name: "Runs on approve" })).toHaveCount(0);
});

test("context renders literal markup as text, and a missing recommendation shows its copy", async ({ page }) => {
  await showSnapshot(page, [gated(1, { context: "Line one\n<b>x</b> stays text" })]);
  const context = sectionOf(page, "Context");
  await expect(context).toContainText("<b>x</b> stays text");
  await expect(context.locator("b")).toHaveCount(0);
  await expect(sectionOf(page, "Recommendation").getByText("The agent did not give a recommendation.", { exact: true })).toBeVisible();
  await expect(detailOf(page).getByRole("heading", { level: 3, name: "Links" })).toHaveCount(0);
});

test("a given recommendation renders as plain text", async ({ page }) => {
  await showSnapshot(page, [gated(1, { recommendation: "Approve it. <i>Safe</i>." })]);
  const rec = sectionOf(page, "Recommendation");
  await expect(rec).toContainText("Approve it. <i>Safe</i>.");
  await expect(rec.locator("i")).toHaveCount(0);
});

test("only http and https links become anchors, opening safely in a new tab", async ({ page }) => {
  await showSnapshot(page, [gated(1, { links: ["https://a.test/pr/1", "http://b.test", "javascript:alert(1)"] })]);
  const links = sectionOf(page, "Links");
  const anchors = links.locator("a");
  await expect(anchors).toHaveCount(2);
  for (const i of [0, 1]) {
    await expect(anchors.nth(i)).toHaveAttribute("target", "_blank");
    await expect(anchors.nth(i)).toHaveAttribute("rel", "noopener noreferrer");
  }
  await expect(anchors.nth(0)).toHaveAttribute("href", "https://a.test/pr/1");
  await expect(links.getByText("javascript:alert(1)", { exact: true })).toBeVisible();
});

test("a 5-file diff lists 5 rows with only the first expanded", async ({ page }) => {
  const paths = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/deeply/nested/folder/e.ts"];
  await showSnapshot(page, [gated(1, { diff: diffOf(paths) })]);
  const rows = sectionOf(page, "Changes").locator("[data-slot=collapsible-trigger]");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toHaveAttribute("aria-expanded", "true");
  for (const i of [1, 2, 3, 4]) await expect(rows.nth(i)).toHaveAttribute("aria-expanded", "false");
  await expect(rows.nth(0)).toContainText("+2");
  await expect(rows.nth(0)).toContainText("-1");
  await expect(rows.nth(4).locator('[title="src/deeply/nested/folder/e.ts"]')).toHaveCount(1);
  const body = sectionOf(page, "Changes").locator("pre").first();
  await expect(body).toContainText("+new src/a.ts");
  await expect(body).toContainText("-old src/a.ts");
});

test("a 2-file diff starts with both rows collapsed", async ({ page }) => {
  await showSnapshot(page, [gated(1, { diff: diffOf(["x.ts", "y.ts"]) })]);
  const rows = sectionOf(page, "Changes").locator("[data-slot=collapsible-trigger]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "false");
});

test("a truncated diff shows the truncation copy", async ({ page }) => {
  await showSnapshot(page, [gated(1, { diff: diffOf(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"], true) })]);
  await expect(
    sectionOf(page, "Changes").getByText(
      "Diff cut at 400 lines. 7 files changed, 900 additions, 12 deletions in total. Open the branch for the rest.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("a request without a diff shows the no-changes copy", async ({ page }) => {
  await showSnapshot(page, [gated(2)]);
  await expect(sectionOf(page, "Changes").getByText("No file changes attached to this request.", { exact: true })).toBeVisible();
});

test("a Discuss round 2 shows a collapsed Earlier in this thread with round 1", async ({ page }) => {
  await showSnapshot(page, [
    requested(20, { agent: "bob", title: "Draft the launch post", reason: "q", kind: "clarifying_question", at: minutesAgo(40), thread: 20 }),
    decided(20, "discuss", minutesAgo(35), "Shorter, and name the price."),
    requested(21, { agent: "bob", title: "Draft the launch post, round two", reason: "q", kind: "clarifying_question", at: minutesAgo(5), thread: 20 }),
  ]);
  const earlier = sectionOf(page, "Earlier in this thread");
  const trigger = earlier.locator("[data-slot=collapsible-trigger]");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(earlier.getByText("Shorter, and name the price.")).toBeHidden();
  await trigger.click();
  await expect(earlier.getByText("Discuss", { exact: true })).toBeVisible();
  await expect(earlier.getByText("Shorter, and name the price.", { exact: true })).toBeVisible();
  await expect(earlier.getByText("Draft the launch post", { exact: true })).toBeVisible();
});

test("a 600-character single-line tool input never scrolls the page sideways", async ({ page }) => {
  const input = JSON.stringify({ command: `echo ${"x".repeat(600)}` });
  await page.setViewportSize({ width: 1024, height: 768 });
  await showSnapshot(page, [gated(1, { toolInput: input })]);
  const pre = sectionOf(page, "Runs on approve").locator("pre");
  await expect(pre).toBeVisible();
  const widths = await pre.evaluate((el) => {
    const detail = el.closest("section[aria-label='Decision detail']")!;
    const doc = document.scrollingElement!;
    return {
      pre: el.scrollWidth <= el.clientWidth,
      detail: detail.scrollWidth <= detail.clientWidth,
      page: doc.scrollWidth === doc.clientWidth,
      maxHeight: getComputedStyle(el).maxHeight,
    };
  });
  expect(widths).toEqual({ pre: true, detail: true, page: true, maxHeight: "240px" });
});

test("at 375px a long file path and tool input stay inside the viewport", async ({ page }) => {
  const path = `src/${"deeply/nested/".repeat(12)}file.ts`;
  await showSnapshot(page, [gated(1, { toolInput: JSON.stringify({ command: `echo ${"x".repeat(600)}` }), diff: diffOf([path]) })]);
  await page.setViewportSize({ width: 375, height: 800 });
  await queue(page).getByRole("button").first().click(); // < 768px the detail opens on selection
  await expect(detailOf(page).getByRole("heading", { level: 2 })).toBeVisible();
  const rights = await detailOf(page).evaluate((el) => {
    const pre = el.querySelector("pre")!;
    const file = el.querySelector("[data-slot=collapsible-trigger]")!;
    return [el, pre, file].map((node) => node.getBoundingClientRect().right <= window.innerWidth);
  });
  expect(rights).toEqual([true, true, true]);
});

// ---- 06-09 Task 2: answering an AskUserQuestion (CEO-02) --------------------------------------

// Longer than the schema's 2000 cap on purpose: snapshots are not re-validated, and the UI must
// still show every character (no clamp) whatever length reaches it.
const LONG_DESCRIPTION = "Keeps everything in one file on disk, which is simple to back up. ".repeat(60).slice(0, 3000);
const PREVIEW = "CREATE TABLE decisions (\n  id uuid PRIMARY KEY\n);";

const question = (n: number, at = minutesAgo(8)) =>
  requested(
    n,
    { agent: "cy", title: `Pick the stack ${n}`, reason: "question", kind: "clarifying_question", at },
    {
      toolName: "AskUserQuestion",
      questions: [
        {
          question: "Which DB?",
          header: "Database",
          multiSelect: false,
          options: [
            { label: "Postgres", description: "Relational, already in the stack", preview: PREVIEW },
            { label: "SQLite", description: LONG_DESCRIPTION },
          ],
        },
        {
          question: "Which features?",
          header: "Scope",
          multiSelect: true,
          options: [
            { label: "Auth", description: "Sign in with Access" },
            { label: "Billing", description: "Stripe checkout" },
          ],
        },
      ],
    },
  );

const OTHER = "Other (write your own answer)";

test("a question renders a Choicebox and a checkbox-card group with labels and descriptions", async ({ page }) => {
  await showSnapshot(page, [question(1)]);
  const qs = sectionOf(page, "Questions");
  await expect(qs.getByText("Database", { exact: true })).toBeVisible();
  await expect(qs.getByText("Which DB?", { exact: true })).toBeVisible();
  const single = qs.getByRole("radiogroup");
  await expect(single).toHaveCount(1);
  await expect(single.getByRole("radio")).toHaveCount(3);
  await expect(single.getByText("Postgres", { exact: true })).toBeVisible();
  await expect(single.getByText("Relational, already in the stack", { exact: true })).toBeVisible();
  await expect(single.getByText(OTHER, { exact: true })).toBeVisible();

  await expect(qs.getByText("Scope", { exact: true })).toBeVisible();
  const boxes = qs.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  await qs.getByText("Billing", { exact: true }).click();
  await qs.getByText("Auth", { exact: true }).click();
  await expect(qs.getByRole("checkbox", { name: /Auth/ })).toBeChecked();
  await expect(qs.getByRole("checkbox", { name: /Billing/ })).toBeChecked();
});

test("choosing Other reveals a textarea", async ({ page }) => {
  await showSnapshot(page, [question(1)]);
  const qs = sectionOf(page, "Questions");
  const single = qs.getByRole("radiogroup");
  await expect(qs.locator("textarea")).toHaveCount(0);
  await single.getByText(OTHER, { exact: true }).click();
  await expect(qs.locator("textarea")).toHaveCount(1);
  await expect(qs.locator("textarea")).toBeVisible();
  await single.getByText("Postgres", { exact: true }).click();
  await expect(qs.locator("textarea")).toHaveCount(0);
});

test("an option preview shows in a pre only while that option is selected", async ({ page }) => {
  await showSnapshot(page, [question(1)]);
  const qs = sectionOf(page, "Questions");
  const preview = qs.locator("pre").filter({ hasText: "CREATE TABLE decisions" });
  await expect(preview).toHaveCount(0);
  await qs.getByText("Postgres", { exact: true }).click();
  await expect(preview).toBeVisible();
  expect(await preview.textContent()).toBe(PREVIEW);
  await qs.getByText("SQLite", { exact: true }).click();
  await expect(preview).toHaveCount(0);
});

test("a 3000-character option description is shown in full, never clamped", async ({ page }) => {
  await showSnapshot(page, [question(1)]);
  const desc = sectionOf(page, "Questions").getByText(LONG_DESCRIPTION.slice(0, 40));
  await expect(desc).toBeVisible();
  const shown = await desc.evaluate((el) => ({
    text: el.textContent,
    clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
  }));
  expect(shown).toEqual({ text: LONG_DESCRIPTION, clipped: false });
});

test("selections are kept per decision when switching queue items", async ({ page }) => {
  await showSnapshot(page, [question(1, minutesAgo(9)), question(2, minutesAgo(4))]);
  const items = queue(page).getByRole("button");
  const qs = sectionOf(page, "Questions");
  await qs.getByText("SQLite", { exact: true }).click();
  await qs.getByText("Billing", { exact: true }).click();

  await items.nth(1).click();
  await expect(detailOf(page).getByRole("heading", { level: 2 })).toHaveText("Pick the stack 2");
  await expect(qs.getByRole("radio", { name: /SQLite/ })).not.toBeChecked();

  await items.nth(0).click();
  await expect(detailOf(page).getByRole("heading", { level: 2 })).toHaveText("Pick the stack 1");
  await expect(qs.getByRole("radio", { name: /SQLite/ })).toBeChecked();
  await expect(qs.getByRole("checkbox", { name: /Billing/ })).toBeChecked();
});

// ---- 06-10 Task 1: the action bar (CEO-03) ----------------------------------------------------

type Posted = { url: string; body: unknown; headers: Record<string, string> };
type Reply = { status: number; json: object };

/** Intercepts decision POSTs. `respond` may return a promise to hold the submit open. */
async function fakeDecisions(page: Page, respond: () => Reply | Promise<Reply> = () => ({ status: 202, json: { accepted: true } })) {
  const posts: Posted[] = [];
  await page.route("**/ceo/api/decisions/*", async (route) => {
    const req = route.request();
    posts.push({ url: req.url(), body: req.postDataJSON(), headers: req.headers() });
    await route.fulfill(await respond());
  });
  return posts;
}

const bar = (page: Page) => page.getByRole("region", { name: "Decision actions" });
const note = (page: Page) => page.getByLabel("Note to agent");
const FIVE = ["Approve", "Request changes", "More research", "Discuss", "Reject"];

test("Request changes with an empty or whitespace note sends nothing and asks for a note", async ({ page }) => {
  const posts = await fakeDecisions(page);
  await showSnapshot(page, [gated(1)]);
  const button = bar(page).getByRole("button", { name: "Request changes" });

  await button.click();
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toHaveAttribute("aria-invalid", "true");
  await expect(bar(page).getByText("Add a note. The agent needs to know what you want.", { exact: true })).toBeVisible();
  await note(page).fill("   ");
  await button.click();
  await expect(note(page)).toBeFocused();
  expect(posts).toHaveLength(0);

  await note(page).fill("Push to a new branch instead");
  await expect(note(page)).not.toHaveAttribute("aria-invalid", "true");
  await button.click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]!.url).toMatch(new RegExp(`/ceo/api/decisions/${uuid(1)}$`));
  expect(posts[0]!.body).toEqual({ action: "request_changes", note: "Push to a new branch instead" });
  expect(posts[0]!.headers["content-type"]).toBe("application/json");
  expect(posts[0]!.headers["x-pixelfirm-csrf"]).toBe("1");
});

test("Approve on a gated call confirms against the exact call, with focus starting on Keep waiting", async ({ page }) => {
  const posts = await fakeDecisions(page);
  const input = JSON.stringify({ command: "git push --force origin main" });
  await showSnapshot(page, [gated(1, { toolInput: input })]);
  const approve = bar(page).getByRole("button", { name: "Approve" });

  await approve.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Approve this action?" })).toBeVisible();
  await expect(dialog.getByText("ada will run exactly this call. Nothing else is approved.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Bash", { exact: true })).toBeVisible();
  expect(await dialog.locator("pre").textContent()).toBe(input);
  await expect(page.locator(":focus")).toHaveAccessibleName("Keep waiting");

  await dialog.getByRole("button", { name: "Keep waiting" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(approve).toBeFocused();
  expect(posts).toHaveLength(0);

  await approve.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Approve and run" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]!.body).toEqual({ action: "approve" });
  expect(posts[0]!.headers["x-pixelfirm-csrf"]).toBe("1");
});

test("Send answers stays disabled until every question is answered, then posts the answers with no dialog", async ({ page }) => {
  const posts = await fakeDecisions(page);
  await showSnapshot(page, [question(1)]);
  const send = bar(page).getByRole("button", { name: "Send answers" });
  const qs = sectionOf(page, "Questions");
  await expect(bar(page).getByRole("button", { name: "Approve" })).toHaveCount(0);

  await expect(send).toBeDisabled();
  await qs.getByText("SQLite", { exact: true }).click();
  await expect(send).toBeDisabled();
  await qs.getByText("Billing", { exact: true }).click();
  await qs.getByText("Auth", { exact: true }).click();
  await expect(send).toBeEnabled();

  await send.click();
  await expect.poll(() => posts.length).toBe(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(posts[0]!.body).toEqual({ action: "approve", answers: { "Which DB?": "SQLite", "Which features?": "Auth, Billing" } });
  expect(posts[0]!.headers["x-pixelfirm-csrf"]).toBe("1");
  await expect(page.getByText("Answers sent to cy.", { exact: true })).toBeVisible();
});

test("Reject posts at once with no dialog, carrying a typed note", async ({ page }) => {
  const posts = await fakeDecisions(page);
  await showSnapshot(page, [gated(1)]);
  await note(page).fill("Never force-push main");
  await bar(page).getByRole("button", { name: "Reject" }).click();
  await expect.poll(() => posts.length).toBe(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(posts[0]!.body).toEqual({ action: "reject", note: "Never force-push main" });
});

test("while submitting everything is disabled; success removes the item, selects the next and toasts", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const posts = await fakeDecisions(page, async () => {
    await held;
    return { status: 202, json: { accepted: true } };
  });
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot(threeEvents())));
  await page.goto(`${BASE}/ceo`);
  const items = queue(page).getByRole("button");
  await expect(items).toHaveCount(3);

  await bar(page).getByRole("button", { name: "Reject" }).click();
  await expect(bar(page).getByRole("button", { name: "Rejecting…" })).toBeDisabled();
  for (const name of FIVE.filter((n) => n !== "Reject")) await expect(bar(page).getByRole("button", { name })).toBeDisabled();
  await expect(note(page)).toBeDisabled();
  await expect(items).toHaveCount(3);

  release();
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Which colour for the CTA?");
  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("Rejected. ada has been told not to proceed.", { exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);

  // The live decision_made for our own decision changes nothing further.
  feed.ws().send(eventFrame(decided(1, "approve", minutesAgo(0))));
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("This decision was already made", { exact: false })).toHaveCount(0);
});

test("a 503 keeps the item and the note, re-enables the buttons and shows the submit error", async ({ page }) => {
  await fakeDecisions(page, () => ({ status: 503, json: { error: "worker offline" } }));
  await showSnapshot(page, [gated(1), gated(2)]);
  await note(page).fill("Try the staging remote");
  await bar(page).getByRole("button", { name: "More research" }).click();

  await expect(
    bar(page).getByText("Decision not sent: worker offline. The agent is still waiting. Try again.", { exact: true }),
  ).toBeVisible();
  await expect(note(page)).toHaveValue("Try the staging remote");
  await expect(note(page)).toBeEnabled();
  for (const name of FIVE) await expect(bar(page).getByRole("button", { name })).toBeEnabled();
  await expect(queue(page).getByRole("button")).toHaveCount(2);
});

test("a 409 shows the no-longer-pending alert and removes the action buttons for that item", async ({ page }) => {
  await fakeDecisions(page, () => ({ status: 409, json: { error: "already decided" } }));
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot([gated(1), gated(2)])));
  await page.goto(`${BASE}/ceo`);
  await bar(page).getByRole("button", { name: "Reject" }).click();

  const detail = detailOf(page);
  await expect(detail.getByText(/^This decision was already made by /)).toBeVisible();
  for (const name of FIVE) await expect(detail.getByRole("button", { name })).toHaveCount(0);

  // The live event behind the 409 fills in who decided it; the item stays open until the CEO moves on.
  feed.ws().send(eventFrame(decided(1, "approve", minutesAgo(0))));
  await expect(detail.getByText("This decision was already made by ceo@pixelfirm.dev just now.", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { level: 2 })).toHaveText("Gated 1");
});

test("a live ceo.approval_expired for the open item shows the expired copy and removes the buttons", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot([gated(1)])));
  await page.goto(`${BASE}/ceo`);
  await expect(bar(page).getByRole("button", { name: "Reject" })).toBeVisible();
  await note(page).fill("Hold on");

  feed.ws().send(
    eventFrame({
      ...envelope(minutesAgo(0)),
      type: "ceo.approval_expired",
      payload: { decisionId: uuid(1), taskId: "task-1", reason: "worker_restarted" },
    }),
  );
  const detail = detailOf(page);
  await expect(
    detail.getByText(
      "This request expired: the worker restarted before you decided. The task is blocked; resume it from History to ask again.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const name of FIVE) await expect(detail.getByRole("button", { name })).toHaveCount(0);
  await expect(note(page)).toHaveValue("Hold on");
});

test("Enter in the note inserts a newline, and no key on the note or the page sends a decision", async ({ page }) => {
  const posts = await fakeDecisions(page);
  await showSnapshot(page, [gated(1)]);
  await note(page).click();
  await page.keyboard.type("first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await page.keyboard.press("Space");
  await page.keyboard.press("Control+Enter");
  await expect(note(page)).toHaveValue("first\nsecond ");

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const key of ["Enter", "Space", "a", "r", "Control+Enter"]) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  expect(posts).toHaveLength(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("after the live feed drops, the status reads Reconnecting and the action buttons stay enabled", async ({ page }) => {
  let connects = 0;
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => (connects++ === 0 ? ws.send(snapshot([gated(1)])) : void ws.close()));
  await page.goto(`${BASE}/ceo`);
  await expect(bar(page).getByRole("button", { name: "Approve" })).toBeEnabled();
  await feed.ws().close();
  await expect(page.getByRole("banner").getByText("Reconnecting", { exact: true })).toBeVisible();
  for (const name of FIVE) await expect(bar(page).getByRole("button", { name })).toBeEnabled();
  await expect(note(page)).toBeEnabled();
});

// ---- 06-10 Task 2: History and Resume task (CEO-05, D-02) --------------------------------------

const historyTab = (page: Page) => page.getByRole("tab", { name: "History" });
const historyPanel = (page: Page) => page.getByRole("tabpanel", { name: "History" });
const historyRows = (page: Page) => historyPanel(page).locator("tbody tr");

function expiredEvent(n: number, at: string, taskId = `task-${n}`): CompanyEvent {
  return {
    ...envelope(at),
    type: "ceo.approval_expired",
    payload: { decisionId: uuid(n), taskId, reason: "worker_restarted" },
  };
}

/** 60 closed decisions: request i at 200+i minutes ago, decided i minutes ago (i = 1 newest). */
function sixtyClosed(): CompanyEvent[] {
  return Array.from({ length: 60 }, (_, k) => k + 1).flatMap((i) => [
    requested(300 + i, { agent: `agent-${i}`, title: `Closed decision ${i}`, reason: "q", kind: "clarifying_question", at: minutesAgo(200 + i) }),
    decided(300 + i, "discuss", minutesAgo(i), `Note ${i}: ${"say more ".repeat(20)}`),
  ]);
}

test("History lists the latest 50 closed decisions newest first with every column", async ({ page }) => {
  const events = sixtyClosed();
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(snapshot(events)));
  await page.goto(`${BASE}/ceo`);
  await historyTab(page).click();

  await expect(historyRows(page)).toHaveCount(50);
  const first = historyRows(page).first();
  const cells = first.locator("td");
  const decidedAt = (events[1] as Extract<CompanyEvent, { type: "ceo.decision_made" }>).occurredAt;
  const absolute = await page.evaluate((iso) => new Date(iso).toLocaleString(), decidedAt);
  await expect(cells.nth(0)).toHaveText(absolute);
  await expect(cells.nth(0)).toHaveAttribute("title", "1 minute ago");
  await expect(cells.nth(1)).toHaveText("agent-1");
  await expect(cells.nth(2)).toHaveText("Closed decision 1");
  await expect(cells.nth(2).locator("[title='Closed decision 1']")).toHaveCount(1);
  await expect(cells.nth(3).getByText("Discuss", { exact: true })).toBeVisible();
  await expect(cells.nth(4)).toHaveText(EMAIL);
  const fullNote = `Note 1: ${"say more ".repeat(20)}`;
  await expect(cells.nth(5).locator(`[title="${fullNote}"]`)).toHaveCount(1);
  const clipped = await cells.nth(5).locator(`[title="${fullNote}"]`).evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(true);
  await expect(historyRows(page).last().locator("td").nth(2)).toHaveText("Closed decision 50");
});

test("a resumable expired row resumes the task and loses its button; a superseded one has none", async ({ page }) => {
  const events: CompanyEvent[] = [
    requested(70, { agent: "dee", title: "Deploy to production?", reason: "MCP tool: deploy", kind: "ceo_gated_tool", at: minutesAgo(30) }),
    expiredEvent(70, minutesAgo(10)),
    requested(80, { agent: "eve", title: "Old question", reason: "q", kind: "clarifying_question", at: minutesAgo(40) }),
    expiredEvent(80, minutesAgo(20)),
    // A newer request for the same task: task-80 already asked again, so it is not resumable.
    requested(81, { agent: "eve", title: "Old question, asked again", reason: "q", kind: "clarifying_question", at: minutesAgo(15) }, { taskId: "task-80" }),
  ];
  const posts: Posted[] = [];
  await page.route("**/ceo/api/tasks/*/resume", async (route) => {
    const req = route.request();
    posts.push({ url: req.url(), body: req.postDataJSON(), headers: req.headers() });
    await route.fulfill({ status: 202, json: { accepted: true, taskId: "task-70" } });
  });
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) => ws.send(snapshot(events)));
  await page.goto(`${BASE}/ceo`);
  await historyTab(page).click();

  const resumable = historyRows(page).filter({ hasText: "Deploy to production?" });
  const superseded = historyRows(page).filter({ hasText: "Old question" }); // 81 is still pending, so not in History
  await expect(resumable.getByText("Expired", { exact: true })).toBeVisible();
  await expect(superseded.getByText("Expired", { exact: true })).toBeVisible();
  await expect(superseded.getByRole("button", { name: "Resume task" })).toHaveCount(0);

  await resumable.getByRole("button", { name: "Resume task" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]!.url).toMatch(/\/ceo\/api\/tasks\/task-70\/resume$/);
  expect(posts[0]!.body).toEqual({});
  expect(posts[0]!.headers["x-pixelfirm-csrf"]).toBe("1");
  expect(posts[0]!.headers["content-type"]).toBe("application/json");
  await expect(page.getByText("Task resumed. dee will ask again.", { exact: true })).toBeVisible();

  feed.ws().send(
    eventFrame({ ...envelope(minutesAgo(0)), type: "ceo.task_resume_requested", payload: { taskId: "task-70", decidedBy: EMAIL } }),
  );
  await expect(resumable.getByRole("button", { name: "Resume task" })).toHaveCount(0);
  await expect(historyPanel(page).getByRole("button", { name: "Resume task" })).toHaveCount(0);
});

test("a live resume from elsewhere removes the Resume task button", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page, (ws) =>
    ws.send(
      snapshot([
        requested(70, { agent: "dee", title: "Deploy to production?", reason: "MCP tool: deploy", kind: "ceo_gated_tool", at: minutesAgo(30) }),
        expiredEvent(70, minutesAgo(10)),
      ]),
    ),
  );
  await page.goto(`${BASE}/ceo`);
  await historyTab(page).click();
  await expect(historyPanel(page).getByRole("button", { name: "Resume task" })).toBeVisible();
  feed.ws().send(
    eventFrame({ ...envelope(minutesAgo(0)), type: "ceo.task_resume_requested", payload: { taskId: "task-70", decidedBy: EMAIL } }),
  );
  await expect(historyPanel(page).getByRole("button", { name: "Resume task" })).toHaveCount(0);
});

test("History shows 5 skeleton rows before the first snapshot", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  const feed = await fakeFeed(page);
  await page.goto(`${BASE}/ceo`);
  await feed.connected;
  await historyTab(page).click();
  await expect(historyPanel(page).locator("[data-slot=skeleton]")).toHaveCount(5);
  await expect(historyPanel(page).getByText("No decisions yet")).toHaveCount(0);
});

test("History with no closed decisions shows the empty copy", async ({ page }) => {
  await showSnapshot(page, [gated(1)]);
  await historyTab(page).click();
  await expect(historyPanel(page).getByText("No decisions yet", { exact: true })).toBeVisible();
  await expect(
    historyPanel(page).getByText("Every approval, rejection and expired request will be listed here.", { exact: true }),
  ).toBeVisible();
});

test("History shows the loading error with Retry when the feed fails before any snapshot", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => void ws.close());
  await page.goto(`${BASE}/ceo`);
  await historyTab(page).click();
  await expect(
    historyPanel(page).getByText("Couldn't load decisions: the live feed disconnected. Check the API is running, then retry.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(historyPanel(page).getByRole("button", { name: "Retry" })).toBeVisible();
});

test("switching tabs keeps the selection and the draft note", async ({ page }) => {
  await fakeMe(page, { email: EMAIL, devBypass: false });
  await fakeFeed(page, (ws) => ws.send(snapshot(threeEvents())));
  await page.goto(`${BASE}/ceo`);
  const items = queue(page).getByRole("button");
  await expect(page.getByRole("tab", { name: "Pending (3)" })).toBeVisible();
  await items.nth(1).click();
  await note(page).fill("Keep this draft");

  await historyTab(page).click();
  await expect(historyRows(page)).toHaveCount(1);
  await page.getByRole("tab", { name: "Pending (3)" }).click();
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(note(page)).toHaveValue("Keep this draft");
});
