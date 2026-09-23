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

describe("resolveHandoffDialogue — verb-led templates and caps (05-40, G-05-1b)", () => {
  const KINDS = ["requested", "accepted"] as const;
  /** Every kind against every null/present title — the full output space of a
   *  two-entry map whose entries branch on one nullable value. */
  const everyLine = (title: string | null = "t".repeat(50), name = "n".repeat(50)): string[] =>
    KINDS.flatMap((kind) => [resolveHandoffDialogue(kind, title, name), resolveHandoffDialogue(kind, null, name)]);

  it("renders the exact requested line when the title is known", () => {
    expect(resolveHandoffDialogue("requested", "Fix login", "Ada")).toBe("hands Fix login to Ada");
  });

  it("renders a complete requested sentence when no title is known — no ellipsis, no placeholder, no identifier", () => {
    expect(resolveHandoffDialogue("requested", null, "Ada")).toBe("hands off to Ada");
  });

  it("renders the exact accepted line when the title is known", () => {
    expect(resolveHandoffDialogue("accepted", "Fix login", "Ada")).toBe("Ada accepts Fix login");
  });

  it("renders a complete accepted sentence when no title is known", () => {
    expect(resolveHandoffDialogue("accepted", null, "Ada")).toBe("Ada accepts the handoff");
  });

  it("never joins two values with a bare arrow (U+2192) — the debug-banner shape the UAT round rejected", () => {
    for (const line of everyLine("Fix login", "Ada")) expect(line).not.toContain("→");
  });

  it("cuts a 30-code-point title to 14 and a 20-code-point name to 10, each ending in U+2026", async () => {
    const { MAX_DIALOGUE_TITLE_CHARS, MAX_DIALOGUE_NAME_CHARS } = await import("./dialogue-templates");
    expect(MAX_DIALOGUE_TITLE_CHARS).toBe(14);
    expect(MAX_DIALOGUE_NAME_CHARS).toBe(10);
    const title = resolveHandoffDialogue("accepted", "a".repeat(30), "Ada").split(" accepts ")[1];
    expect(Array.from(title).length).toBe(14);
    expect(title.endsWith("…")).toBe(true);
    const name = resolveHandoffDialogue("accepted", "Fix login", "n".repeat(20)).split(" accepts ")[0];
    expect(Array.from(name).length).toBe(10);
    expect(name.endsWith("…")).toBe(true);
  });

  it("the longest line over every kind and every null/present combination fits one declared budget", async () => {
    const { MAX_DIALOGUE_LINE_CHARS } = await import("./dialogue-templates");
    expect(MAX_DIALOGUE_LINE_CHARS).toBe(34);
    // Derived, never hard-coded: which combination wins is the module's business.
    const cps = Math.max(...everyLine().map((line) => Array.from(line).length));
    expect(cps).toBeLessThanOrEqual(MAX_DIALOGUE_LINE_CHARS);
    // Non-vacuity: the declared budget is a line that actually exists, not slack.
    expect(cps).toBe(MAX_DIALOGUE_LINE_CHARS);
    expect(cps * 0.6 * DIALOGUE_FONT_PX + 2 * (DIALOGUE_BOX_PAD_X_PX + 1)).toBeLessThanOrEqual(110);
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
