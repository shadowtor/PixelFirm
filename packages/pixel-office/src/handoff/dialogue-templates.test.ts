import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveHandoffDialogue } from "./dialogue-templates";
import { DIALOGUE_FONT_PX, DIALOGUE_BOX_PAD_X_PX } from "../constants";

const dir = dirname(fileURLToPath(import.meta.url));

describe("resolveHandoffDialogue", () => {
  it("interpolates taskTitle and toAgentName into the 'requested' template", () => {
    const text = resolveHandoffDialogue("requested", "Fix login", "reviewer");
    expect(text).toContain("Fix login");
    expect(text).toContain("reviewer");
  });

  it("interpolates taskTitle and toAgentName into the 'accepted' template", () => {
    const text = resolveHandoffDialogue("accepted", "Fix login", "reviewer");
    expect(text).toContain("Fix login");
    expect(text).toContain("reviewer");
  });

  it("never phrases dialogue with exclamation marks or first-person framing (kept transparency prohibition)", () => {
    const requested = resolveHandoffDialogue("requested", "Some task", "agent-x");
    const accepted = resolveHandoffDialogue("accepted", "Some task", "agent-x");
    for (const text of [requested, accepted]) {
      expect(text).not.toContain("!");
      expect(text.toLowerCase()).not.toMatch(/\bi\b/);
    }
  });
});

describe("resolveHandoffDialogue — short label templates and caps (05-29, G-05-1b)", () => {
  it("renders the exact short templates", () => {
    expect(resolveHandoffDialogue("requested", "Fix login", "Ada")).toBe("Fix login → Ada");
    expect(resolveHandoffDialogue("accepted", "Fix login", "Ada")).toBe("Ada accepts Fix login");
  });

  it("cuts a 30-code-point title to 12 code points ending in U+2026", async () => {
    const { MAX_DIALOGUE_TITLE_CHARS } = await import("./dialogue-templates");
    expect(MAX_DIALOGUE_TITLE_CHARS).toBe(12);
    const seg = resolveHandoffDialogue("requested", "a".repeat(30), "Ada").split(" → ")[0];
    expect(Array.from(seg).length).toBe(12);
    expect(seg.endsWith("…")).toBe(true);
  });

  it("cuts a 20-code-point agent name to 10 code points ending in U+2026", async () => {
    const { MAX_DIALOGUE_NAME_CHARS } = await import("./dialogue-templates");
    expect(MAX_DIALOGUE_NAME_CHARS).toBe(10);
    const name = resolveHandoffDialogue("accepted", "Fix login", "n".repeat(20)).split(" accepts ")[0];
    expect(Array.from(name).length).toBe(10);
    expect(name.endsWith("…")).toBe(true);
  });

  it("the longest possible line fits the label budget (<= 100 world px in 05-28's bubble)", () => {
    const longest = resolveHandoffDialogue("accepted", "t".repeat(50), "n".repeat(50));
    const cps = Array.from(longest).length;
    expect(cps).toBe(31);
    expect(cps * 0.6 * DIALOGUE_FONT_PX + 2 * (DIALOGUE_BOX_PAD_X_PX + 1)).toBeLessThanOrEqual(100);
  });

  it("never splits a surrogate pair (cut by code point)", () => {
    const text = resolveHandoffDialogue("requested", "\u{1F600}".repeat(20), "agent-x");
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        expect(next >= 0xdc00 && next <= 0xdfff, `lone high surrogate at ${i}`).toBe(true);
        i++;
      } else {
        expect(c >= 0xdc00 && c <= 0xdfff, `lone low surrogate at ${i}`).toBe(false);
      }
    }
    expect(text.length).toBeLessThan(20 * 2 + 30);
  });
});

describe("HANDOFF-02 — zero network/LLM call surface (mechanical proof)", () => {
  const forbidden = ["fetch(", "anthropic", "openai", "claude-agent-sdk", "http"];

  it("dialogue-templates.ts contains none of the forbidden substrings", () => {
    const source = readFileSync(join(dir, "dialogue-templates.ts"), "utf-8").toLowerCase();
    for (const needle of forbidden) {
      expect(source).not.toContain(needle);
    }
  });

  it("handoff-choreography.ts contains none of the forbidden substrings", () => {
    const source = readFileSync(join(dir, "handoff-choreography.ts"), "utf-8").toLowerCase();
    for (const needle of forbidden) {
      expect(source).not.toContain(needle);
    }
  });
});
