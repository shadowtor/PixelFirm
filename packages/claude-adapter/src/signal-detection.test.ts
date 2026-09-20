import { describe, expect, it } from "vitest";
import { classifySignal } from "./signal-detection.js";

describe("classifySignal", () => {
  it("Test 1: AskUserQuestion always classifies as a clarifying question", () => {
    const result = classifySignal("AskUserQuestion", { questions: [] });

    expect(result).not.toBeNull();
    expect(result?.kind).toBe("clarifying_question");
    expect(result?.reason).toMatch(/AskUserQuestion/);
  });

  it("Test 2: a CEO-gated Bash command classifies as ceo_gated_tool; an ordinary Bash command does not", () => {
    const gated = classifySignal("Bash", { command: "git push --force origin main" });
    expect(gated).not.toBeNull();
    expect(gated?.kind).toBe("ceo_gated_tool");
    expect(gated?.reason.length).toBeGreaterThan(0);

    const ordinary = classifySignal("Bash", { command: "npm test" });
    expect(ordinary).toBeNull();
  });

  it("Test 3: a plain Read tool call is never gated", () => {
    expect(classifySignal("Read", { file_path: "src/index.ts" })).toBeNull();
  });
});
