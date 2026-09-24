import { describe, expect, it } from "vitest";
import type { DiffSummary } from "git-adapter";
import { buildDecisionRequest, extractLinks } from "./decision-request.js";

const decisionId = "0b6f7c1e-2a4d-4e8b-9f3a-6c5d4e3b2a10";
const bootId = "5d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d";

describe("buildDecisionRequest", () => {
  it("AskUserQuestion: title from the first question, recommendation from (Recommended) labels, questions copied field by field", () => {
    const input = {
      questions: [
        {
          question: "  Which database should we use?  ",
          header: "DB",
          multiSelect: false,
          options: [
            { label: "Postgres (Recommended)", description: "relational", preview: "CREATE TABLE", extra: 1 },
            { label: "SQLite", description: "a file" },
          ],
          extra: "dropped",
        },
        {
          question: "Deploy now?",
          header: "Deploy",
          multiSelect: true,
          options: [
            { label: "Yes (Recommended)", description: "ship" },
            { label: "No", description: "wait" },
          ],
        },
      ],
    };

    const payload = buildDecisionRequest({
      taskId: "task-1",
      reason: "clarifying question",
      decisionId,
      threadId: decisionId,
      kind: "clarifying_question",
      toolName: "AskUserQuestion",
      input,
      lastAssistantText: "  Comparing options, see https://docs.test/db.  ",
    });

    expect(payload).toEqual({
      taskId: "task-1",
      reason: "clarifying question",
      decisionId,
      threadId: decisionId,
      kind: "clarifying_question",
      toolName: "AskUserQuestion",
      toolInput: JSON.stringify(input),
      title: "Which database should we use?",
      context: "Comparing options, see https://docs.test/db.",
      recommendation: "Postgres (Recommended), Yes (Recommended)",
      links: ["https://docs.test/db"],
      questions: [
        {
          question: "  Which database should we use?  ",
          header: "DB",
          multiSelect: false,
          options: [
            { label: "Postgres (Recommended)", description: "relational", preview: "CREATE TABLE" },
            { label: "SQLite", description: "a file" },
          ],
        },
        {
          question: "Deploy now?",
          header: "Deploy",
          multiSelect: true,
          options: [
            { label: "Yes (Recommended)", description: "ship" },
            { label: "No", description: "wait" },
          ],
        },
      ],
    });
  });

  it("Bash: title from the command, recommendation from its description, diff and resume fields carried, absent keys omitted", () => {
    const input = { command: "git push origin main", description: "Push the release" };
    const diff: DiffSummary = {
      files: [{ path: "a.txt", added: 1, removed: 0 }],
      unified: "+x",
      truncated: false,
      totalAdded: 1,
      totalRemoved: 0,
    };

    const payload = buildDecisionRequest({
      taskId: "task-1",
      reason: "Bash command matched a CEO-gated pattern: push to main/master",
      decisionId,
      threadId: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      kind: "ceo_gated_tool",
      toolName: "Bash",
      input,
      diff,
      sessionId: "session-1",
      worktreePath: "/work/tree",
      workerBootId: bootId,
      taskTitle: "Ship the release",
    });

    expect(payload).toEqual({
      taskId: "task-1",
      reason: "Bash command matched a CEO-gated pattern: push to main/master",
      decisionId,
      threadId: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      kind: "ceo_gated_tool",
      toolName: "Bash",
      toolInput: JSON.stringify(input),
      title: "Bash: git push origin main",
      recommendation: "Push the release",
      diff,
      sessionId: "session-1",
      worktreePath: "/work/tree",
      workerBootId: bootId,
      taskTitle: "Ship the release",
    });
  });

  it("Bash: a long command title is capped at 300 characters with a trailing ellipsis", () => {
    const payload = buildDecisionRequest({
      taskId: "t",
      reason: "r",
      decisionId,
      threadId: decisionId,
      kind: "ceo_gated_tool",
      toolName: "Bash",
      input: { command: `npm publish ${"x".repeat(400)}` },
    });
    expect(payload.title).toHaveLength(300);
    expect(payload.title?.endsWith("…")).toBe(true);
    expect(payload.title?.startsWith("Bash: npm publish x")).toBe(true);
  });

  it("an empty description, blank assistant text and no links produce no recommendation, context or links keys", () => {
    const payload = buildDecisionRequest({
      taskId: "t",
      reason: "r",
      decisionId,
      threadId: decisionId,
      kind: "ceo_gated_tool",
      toolName: "Bash",
      input: { command: "npm publish", description: "" },
      lastAssistantText: "   ",
    });
    expect(payload).not.toHaveProperty("recommendation");
    expect(payload).not.toHaveProperty("context");
    expect(payload).not.toHaveProperty("links");
    expect(payload).not.toHaveProperty("diff");
  });

  it("context is capped at 8000 characters", () => {
    const payload = buildDecisionRequest({
      taskId: "t",
      reason: "r",
      decisionId,
      threadId: decisionId,
      kind: "ceo_gated_tool",
      toolName: "Bash",
      input: { command: "npm publish" },
      lastAssistantText: "y".repeat(9000),
    });
    expect(payload.context).toHaveLength(8000);
  });
});

describe("extractLinks", () => {
  it("returns unique http(s) URLs in first-seen order and never a javascript: link", () => {
    expect(extractLinks(["see javascript:alert(1) and https://a.test/x https://a.test/x http://b.test"])).toEqual([
      "https://a.test/x",
      "http://b.test",
    ]);
  });

  it("never returns file: links, drops URLs over 2000 characters, and caps at 10", () => {
    const many = Array.from({ length: 12 }, (_, i) => `https://n.test/${i}`).join(" ");
    const long = `https://long.test/${"a".repeat(2000)}`;
    const links = extractLinks([`file:///etc/passwd ${long}`, many]);
    expect(links).toHaveLength(10);
    expect(links[0]).toBe("https://n.test/0");
    expect(links.some((l) => l.startsWith("file:"))).toBe(false);
    expect(links.every((l) => l.length <= 2000)).toBe(true);
  });

  it("stops at JSON quotes and strips trailing sentence punctuation", () => {
    expect(extractLinks([JSON.stringify({ url: "https://c.test/deploy" }), "Done (see https://d.test/a)."])).toEqual([
      "https://c.test/deploy",
      "https://d.test/a",
    ]);
  });
});
