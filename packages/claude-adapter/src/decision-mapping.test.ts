import { describe, expect, it } from "vitest";
// Namespace import: a not-yet-existing export fails inside the test body
// (assertion-level RED), not as an ESM link failure.
import * as mapping from "./decision-mapping.js";
import type { CeoDecision, ParkedCall } from "./decision-mapping.js";

const DECISION_ID = "0b6f7c1e-2a4d-4e8b-9f3a-6c5d4e3b2a10";
const MISMATCH = "The CEO's answers did not match the questions asked; ask again with AskUserQuestion.";

function bash(): ParkedCall {
  return { decisionId: DECISION_ID, toolName: "Bash", input: { command: "npm publish" }, kind: "ceo_gated_tool" };
}

const questions = [
  { question: "Which library?", header: "Library", multiSelect: false, options: [{ label: "A" }, { label: "B" }] },
  { question: "Which features?", header: "Features", multiSelect: true, options: [{ label: "X" }, { label: "Y" }] },
];

function ask(): ParkedCall {
  return { decisionId: DECISION_ID, toolName: "AskUserQuestion", input: { questions }, kind: "clarifying_question" };
}

function deny(decision: CeoDecision) {
  return mapping.toPermissionResult(decision, bash());
}

describe("toPermissionResult: deny prefixes and notes (D-05, UI-SPEC locked copy)", () => {
  it.each([
    ["request_changes", "  split it  ", "[CEO:REQUEST_CHANGES] split it"],
    ["more_research", "check the licence", "[CEO:MORE_RESEARCH] check the licence"],
    ["discuss", " why now? ", "[CEO:DISCUSS] why now?"],
    ["reject", "no", "[CEO:REJECT] no"],
  ] as const)("%s with note %j denies with %j", (action, note, message) => {
    expect(deny({ action, note })).toEqual({ behavior: "deny", message });
  });

  it("reject with no note is exactly the bare prefix", () => {
    expect(deny({ action: "reject" })).toEqual({ behavior: "deny", message: "[CEO:REJECT]" });
  });

  it("reject with a whitespace note is exactly the bare prefix", () => {
    const result = deny({ action: "reject", note: "   " });
    expect(result.behavior === "deny" && result.message).toBe("[CEO:REJECT]");
  });

  it.each([
    ["request_changes", "[CEO:REQUEST_CHANGES]"],
    ["more_research", "[CEO:MORE_RESEARCH]"],
    ["discuss", "[CEO:DISCUSS]"],
  ] as const)("%s with an empty note still denies safely with the bare prefix %j", (action, message) => {
    expect(deny({ action, note: "" })).toEqual({ behavior: "deny", message });
  });
});

describe("toPermissionResult: approve", () => {
  it("allows a non-question tool call with the parked input by reference", () => {
    const parked = bash();
    const result = mapping.toPermissionResult({ action: "approve" }, parked);
    expect(result.behavior).toBe("allow");
    expect(result.behavior === "allow" && result.updatedInput).toBe(parked.input);
  });

  it("allows AskUserQuestion with the parked questions reference and the validated answers", () => {
    const parked = ask();
    const answers = { "Which library?": "A", "Which features?": "X, Y" };
    const result = mapping.toPermissionResult({ action: "approve", answers }, parked);
    expect(result).toEqual({ behavior: "allow", updatedInput: { questions, answers } });
    expect(result.behavior === "allow" && result.updatedInput?.questions).toBe(parked.input.questions);
  });

  it("denies AskUserQuestion with the system message when an answers key is not a parked question", () => {
    const result = mapping.toPermissionResult(
      { action: "approve", answers: { "Which library?": "A", "Which colour?": "red" } },
      ask(),
    );
    expect(result).toEqual({ behavior: "deny", message: MISMATCH });
  });

  it("denies AskUserQuestion when answers are missing entirely", () => {
    expect(mapping.toPermissionResult({ action: "approve" }, ask())).toEqual({ behavior: "deny", message: MISMATCH });
  });
});

describe("validateAnswers", () => {
  it("returns a new record keyed by the exact parked question text", () => {
    const answers = { "Which library?": "B", "Which features?": "Y" };
    const out = mapping.validateAnswers(questions, answers);
    expect(out).toEqual(answers);
    expect(out).not.toBe(answers);
  });

  it("throws on a key that is not a parked question", () => {
    expect(() =>
      mapping.validateAnswers(questions, { "Which library?": "A", "Which features?": "X", extra: "z" }),
    ).toThrow();
  });

  it("throws when a question is unanswered", () => {
    expect(() => mapping.validateAnswers(questions, { "Which library?": "A" })).toThrow();
  });

  it("throws on an empty or whitespace value", () => {
    expect(() => mapping.validateAnswers(questions, { "Which library?": "  ", "Which features?": "X" })).toThrow();
  });

  it("throws when the parked questions are not an array", () => {
    expect(() => mapping.validateAnswers(undefined, {})).toThrow();
  });
});

describe("CEO_PROTOCOL_APPEND", () => {
  it("explains every prefix to the agent", () => {
    for (const prefix of Object.values(mapping.CEO_PREFIX)) {
      expect(mapping.CEO_PROTOCOL_APPEND).toContain(prefix);
    }
  });
});
