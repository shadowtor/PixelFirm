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
