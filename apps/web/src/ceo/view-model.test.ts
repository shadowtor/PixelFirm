import { describe, it, expect } from "vitest";
import {
  actionLabel,
  allAnswered,
  buildAnswers,
  diffLineKind,
  documentTitle,
  historyBadge,
  isLongWait,
  inProgressLabel,
  kindLabel,
  nextSelection,
  noLongerPendingCopy,
  noteRequired,
  relativeTime,
  successToast,
  validateNote,
  safeLink,
  visibleText,
  splitDiffByFile,
  truncationCopy,
  waitedLabel,
} from "./view-model";

const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("waitedLabel", () => {
  it("formats minutes with Intl unit formatting", () => {
    expect(waitedLabel(ago(12), NOW)).toBe("12 min");
    expect(waitedLabel(ago(0.5), NOW)).toBe("0 min");
  });

  it("switches to hours and days for long waits", () => {
    expect(waitedLabel(ago(90), NOW)).toBe("1 hr");
    expect(waitedLabel(ago(60 * 50), NOW)).toBe("2 days");
  });
});

describe("isLongWait", () => {
  it("is true only above 10 minutes", () => {
    expect(isLongWait(ago(9), NOW)).toBe(false);
    expect(isLongWait(ago(10), NOW)).toBe(false);
    expect(isLongWait(ago(10.5), NOW)).toBe(true);
  });
});

describe("kindLabel", () => {
  it("labels a clarifying question", () => {
    expect(kindLabel("clarifying_question", "anything")).toBe("Question");
  });

  it("names the gated pattern after the first ': ' for every gate format", () => {
    expect(kindLabel("ceo_gated_tool", "Bash command matched a CEO-gated pattern: force-push")).toBe("Gated action · force-push");
    expect(kindLabel("ceo_gated_tool", "MCP tool: mcp__coolify__deploy")).toBe("Gated action · mcp__coolify__deploy");
    expect(kindLabel("ceo_gated_tool", "File change matched a CEO-gated pattern: production config")).toBe(
      "Gated action · production config",
    );
  });

  it("falls back to 'Gated action' when the reason has no ': '", () => {
    expect(kindLabel("ceo_gated_tool", "gated")).toBe("Gated action");
  });
});

describe("documentTitle", () => {
  it("prefixes the pending count only while there is one", () => {
    expect(documentTitle(3)).toBe("(3) CEO desk · PixelFirm");
    expect(documentTitle(0)).toBe("CEO desk · PixelFirm");
  });
});

describe("nextSelection", () => {
  it("picks the next item after the removed one", () => {
    expect(nextSelection(["a", "b", "c"], "b", ["a", "c"])).toBe("c");
  });

  it("skips next items that left too", () => {
    expect(nextSelection(["a", "b", "c", "d"], "b", ["a", "d"])).toBe("d");
  });

  it("falls back to the previous item when nothing after it remains", () => {
    expect(nextSelection(["a", "b", "c"], "c", ["a", "b"])).toBe("b");
  });

  it("returns null when nothing remains", () => {
    expect(nextSelection(["a"], "a", [])).toBeNull();
  });
});

describe("safeLink", () => {
  it("turns http and https URLs into hrefs", () => {
    expect(safeLink("https://a.test/x")).toEqual({ href: "https://a.test/x" });
    expect(safeLink("http://b.test")).toEqual({ href: "http://b.test" });
  });

  it("keeps every other scheme, and non-URLs, as text only", () => {
    expect(safeLink("javascript:alert(1)")).toEqual({ text: "javascript:alert(1)" });
    expect(safeLink("file:///etc/passwd")).toEqual({ text: "file:///etc/passwd" });
    expect(safeLink("not a url")).toEqual({ text: "not a url" });
    expect(safeLink(" JavaScript:alert(1)")).toEqual({ text: " JavaScript:alert(1)" });
  });
});

const TWO_FILE_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,2 @@",
  " keep",
  "-old",
  "+new",
  "diff --git a/docs/old name.md b/docs/new name.md",
  "--- a/docs/old name.md",
  "+++ b/docs/new name.md",
  "@@ -3 +3 @@",
  "+added",
].join("\n");

describe("splitDiffByFile", () => {
  it("returns one chunk per diff --git header, keyed by the b/ path, lines in order", () => {
    const chunks = splitDiffByFile(TWO_FILE_DIFF);
    expect(chunks.map((c) => c.path)).toEqual(["src/a.ts", "docs/new name.md"]);
    expect(chunks[0]!.lines).toEqual([
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1111111..2222222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,2 @@",
      " keep",
      "-old",
      "+new",
    ]);
    expect(chunks[1]!.lines.at(-1)).toBe("+added");
  });

  it("returns nothing for an empty diff", () => {
    expect(splitDiffByFile("")).toEqual([]);
  });
});

describe("diffLineKind", () => {
  it("classifies add, del, hunk, file header and context lines", () => {
    expect(diffLineKind("+x")).toBe("add");
    expect(diffLineKind("-x")).toBe("del");
    expect(diffLineKind("@@ -1 +1 @@")).toBe("hunk");
    expect(diffLineKind("+++ b/src/a.ts")).toBe("file");
    expect(diffLineKind("--- a/src/a.ts")).toBe("file");
    expect(diffLineKind(" keep")).toBe("context");
    expect(diffLineKind("diff --git a/x b/x")).toBe("context");
  });
});

describe("truncationCopy", () => {
  it("states the cap and the full totals", () => {
    expect(truncationCopy({ lineCap: 400, files: 7, added: 900, removed: 12 })).toBe(
      "Diff cut at 400 lines. 7 files changed, 900 additions, 12 deletions in total. Open the branch for the rest.",
    );
  });
});

describe("actionLabel", () => {
  it("names every CEO action the way the History badges do", () => {
    expect(actionLabel("approve")).toBe("Approved");
    expect(actionLabel("reject")).toBe("Rejected");
    expect(actionLabel("request_changes")).toBe("Changes requested");
    expect(actionLabel("more_research")).toBe("More research");
    expect(actionLabel("discuss")).toBe("Discuss");
  });
});

const QUESTIONS = [
  {
    question: "Which DB?",
    header: "Database",
    multiSelect: false,
    options: [
      { label: "Postgres", description: "Relational" },
      { label: "SQLite", description: "A file" },
    ],
  },
  {
    question: "Which features?",
    header: "Scope",
    multiSelect: true,
    options: [
      { label: "Auth", description: "Sign in" },
      { label: "Billing", description: "Stripe" },
      { label: "Search", description: "Full text" },
    ],
  },
];

describe("buildAnswers", () => {
  it("keys answers by exact question text, joining multi-select labels in option order", () => {
    const selections = { "Which DB?": { labels: ["Postgres"] }, "Which features?": { labels: ["Billing", "Auth"] } };
    expect(buildAnswers(QUESTIONS, selections)).toEqual({ "Which DB?": "Postgres", "Which features?": "Auth, Billing" });
    expect(allAnswered(QUESTIONS, selections)).toBe(true);
  });

  it("uses the trimmed Other text as the answer", () => {
    const selections = { "Which DB?": { labels: [], other: "  DuckDB  " }, "Which features?": { labels: ["Search"] } };
    expect(buildAnswers(QUESTIONS, selections)).toEqual({ "Which DB?": "DuckDB", "Which features?": "Search" });
  });

  it("is not all answered while a question has no answer or only a whitespace Other", () => {
    expect(allAnswered(QUESTIONS, { "Which DB?": { labels: ["SQLite"] } })).toBe(false);
    expect(allAnswered(QUESTIONS, { "Which DB?": { labels: [], other: "   " }, "Which features?": { labels: ["Auth"] } })).toBe(false);
    expect(buildAnswers(QUESTIONS, { "Which DB?": { labels: [], other: "   " } })).toEqual({});
    expect(allAnswered(QUESTIONS, {})).toBe(false);
  });
});

describe("noteRequired / validateNote", () => {
  it("requires a note for request changes, more research and discuss only", () => {
    expect(noteRequired("request_changes")).toBe(true);
    expect(noteRequired("more_research")).toBe(true);
    expect(noteRequired("discuss")).toBe(true);
    expect(noteRequired("approve")).toBe(false);
    expect(noteRequired("reject")).toBe(false);
  });

  it("returns the required-note copy for an empty or whitespace note on a note action", () => {
    const error = "Add a note. The agent needs to know what you want.";
    expect(validateNote("request_changes", "   ")).toBe(error);
    expect(validateNote("discuss", "")).toBe(error);
    expect(validateNote("more_research", "Check the logs")).toBeNull();
    expect(validateNote("approve", "   ")).toBeNull();
    expect(validateNote("reject", "")).toBeNull();
  });
});

describe("inProgressLabel / successToast", () => {
  it("uses the UI-SPEC in-progress labels", () => {
    expect(inProgressLabel("approve")).toBe("Approving…");
    expect(inProgressLabel("approve", true)).toBe("Sending…");
    expect(inProgressLabel("reject")).toBe("Rejecting…");
    expect(inProgressLabel("request_changes")).toBe("Requesting changes…");
    expect(inProgressLabel("more_research")).toBe("Requesting research…");
    expect(inProgressLabel("discuss")).toBe("Sending to discuss…");
  });

  it("uses the UI-SPEC success toasts", () => {
    expect(successToast("approve", "ada")).toBe("Approved. ada is continuing.");
    expect(successToast("approve", "cy", true)).toBe("Answers sent to cy.");
    expect(successToast("reject", "ada")).toBe("Rejected. ada has been told not to proceed.");
    for (const action of ["request_changes", "more_research", "discuss"] as const) {
      expect(successToast(action, "bob")).toBe("Sent to bob. It will reply before asking again.");
    }
  });
});

describe("relativeTime / noLongerPendingCopy", () => {
  it("says just now under a minute, then Intl relative time", () => {
    expect(relativeTime(ago(0.5), NOW)).toBe("just now");
    expect(relativeTime(ago(12), NOW)).toBe("12 minutes ago");
    expect(relativeTime(ago(180), NOW)).toBe("3 hours ago");
    expect(relativeTime(ago(60 * 50), NOW)).toBe("2 days ago");
  });

  const request = { decisionId: "d", threadId: "d", taskId: "t", reason: "r", requestedAt: ago(30) };

  it("names the decider and when for a decision made elsewhere", () => {
    const record = {
      request,
      status: "decided" as const,
      decision: { action: "approve" as const, decidedBy: "ceo@pixelfirm.dev", decidedAt: ago(12) },
    };
    expect(noLongerPendingCopy(record, NOW)).toBe("This decision was already made by ceo@pixelfirm.dev 12 minutes ago.");
  });

  it("uses the expired copy when the request expired", () => {
    const record = { request, status: "expired" as const, expired: { reason: "worker_restarted" as const, expiredAt: ago(1) } };
    expect(noLongerPendingCopy(record, NOW)).toBe(
      "This request expired: the worker restarted before you decided. The task is blocked; resume it from History to ask again.",
    );
  });
});

describe("historyBadge", () => {
  const request = { decisionId: "d", threadId: "d", taskId: "t", reason: "r", requestedAt: ago(30) };
  const decidedAs = (action: "approve" | "reject" | "request_changes" | "more_research" | "discuss") => ({
    request,
    status: "decided" as const,
    decision: { action, decidedBy: "ceo@pixelfirm.dev", decidedAt: ago(5) },
  });

  it("maps each action to its label and tone", () => {
    expect(historyBadge(decidedAs("approve"))).toEqual({ label: "Approved", tone: "success" });
    expect(historyBadge(decidedAs("reject"))).toEqual({ label: "Rejected", tone: "destructive" });
    expect(historyBadge(decidedAs("request_changes"))).toEqual({ label: "Changes requested", tone: "neutral" });
    expect(historyBadge(decidedAs("more_research"))).toEqual({ label: "More research", tone: "neutral" });
    expect(historyBadge(decidedAs("discuss"))).toEqual({ label: "Discuss", tone: "neutral" });
  });

  it("shows Expired for an expired record, even one that also carries a late decision", () => {
    const expired = { expired: { reason: "worker_restarted" as const, expiredAt: ago(1) } };
    expect(historyBadge({ request, status: "expired", ...expired })).toEqual({ label: "Expired", tone: "expired" });
    expect(historyBadge({ ...decidedAs("approve"), status: "expired", ...expired })).toEqual({ label: "Expired", tone: "expired" });
  });
});

// WR-07 (06-REVIEW): what the CEO reads must be what runs.
describe("visibleText", () => {
  it("escapes bidi controls and invisible characters, leaves everything else alone", () => {
    expect(visibleText('{"command":"git push origin \u202Emain"}')).toBe('{"command":"git push origin \\u202emain"}');
    expect(visibleText("a\u200Bb\uFEFFc\u2066d\u061Ce")).toBe("a\\u200bb\\ufeffc\\u2066d\\u061ce");
    expect(visibleText("git push origin feature/é 🚀")).toBe("git push origin feature/é 🚀");
  });
});

