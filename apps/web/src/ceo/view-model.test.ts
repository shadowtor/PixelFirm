import { describe, it, expect } from "vitest";
import {
  actionLabel,
  diffLineKind,
  documentTitle,
  isLongWait,
  kindLabel,
  nextSelection,
  safeLink,
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
