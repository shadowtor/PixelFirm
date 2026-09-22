import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveHandoffDialogue } from "./dialogue-templates";

const dir = dirname(fileURLToPath(import.meta.url));

describe("resolveHandoffDialogue", () => {
  it("interpolates taskTitle and toAgentName into the 'requested' template", () => {
    const text = resolveHandoffDialogue("requested", "Fix login bug", "reviewer-bot");
    expect(text).toContain("Fix login bug");
    expect(text).toContain("reviewer-bot");
  });

  it("interpolates taskTitle and toAgentName into the 'accepted' template", () => {
    const text = resolveHandoffDialogue("accepted", "Fix login bug", "reviewer-bot");
    expect(text).toContain("Fix login bug");
    expect(text).toContain("reviewer-bot");
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

describe("resolveHandoffDialogue — length caps (05-13, T-05-13-01)", () => {
  const titleSegment = (text: string): string => text.split('"')[1];

  it("cuts a 200-character title to MAX_DIALOGUE_TITLE_CHARS code points ending in U+2026", async () => {
    const { MAX_DIALOGUE_TITLE_CHARS } = await import("./dialogue-templates");
    expect(MAX_DIALOGUE_TITLE_CHARS).toBe(16);
    const seg = titleSegment(resolveHandoffDialogue("requested", "a".repeat(200), "agent-x"));
    expect(Array.from(seg).length).toBe(MAX_DIALOGUE_TITLE_CHARS);
    expect(seg.endsWith("…")).toBe(true);
  });

  it("cuts a 40-character agent name to MAX_DIALOGUE_NAME_CHARS code points ending in U+2026", async () => {
    const { MAX_DIALOGUE_NAME_CHARS } = await import("./dialogue-templates");
    expect(MAX_DIALOGUE_NAME_CHARS).toBe(12);
    const name = "n".repeat(40);
    const text = resolveHandoffDialogue("requested", "Fix login bug", name);
    const cutName = text.slice(text.lastIndexOf(" to ") + 4);
    expect(Array.from(cutName).length).toBe(MAX_DIALOGUE_NAME_CHARS);
    expect(cutName.endsWith("…")).toBe(true);
    const accepted = resolveHandoffDialogue("accepted", "Fix login bug", name);
    expect(Array.from(accepted.split(" accepts ")[0]).length).toBe(MAX_DIALOGUE_NAME_CHARS);
  });

  it("passes values at or under the caps through byte-identical", () => {
    expect(resolveHandoffDialogue("requested", "Fix login bug", "reviewer-bot")).toBe('Handing off "Fix login bug" to reviewer-bot');
    expect(resolveHandoffDialogue("accepted", "Fix login bug", "reviewer-bot")).toBe('reviewer-bot accepts "Fix login bug"');
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
