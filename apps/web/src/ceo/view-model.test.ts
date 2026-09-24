import { describe, it, expect } from "vitest";
import { documentTitle, isLongWait, kindLabel, nextSelection, waitedLabel } from "./view-model";

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
