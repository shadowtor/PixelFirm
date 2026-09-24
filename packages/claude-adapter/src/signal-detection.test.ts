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

// 06-02 Task 1 decision: A = "narrow", B = "gate-paths" (06-02-SUMMARY.md).
describe("classifySignal — CEO-04 narrow command/MCP set", () => {
  const gated = (toolName: string, input: unknown) => classifySignal(toolName, input)?.kind;

  it("pushes to main/master and force-pushes are gated; a feature-branch push is the signed-off residual", () => {
    expect(gated("Bash", { command: "git push origin main" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "git push origin HEAD:master" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "git push -f" })).toBe("ceo_gated_tool");
    expect(classifySignal("Bash", { command: "git push origin feature/x" })).toBeNull();
  });

  // CR-01 (06-REVIEW): every tool that runs a shell command is classified, not only Bash.
  it("PowerShell and Monitor commands are classified like Bash", () => {
    expect(gated("PowerShell", { command: "git push origin main" })).toBe("ceo_gated_tool");
    expect(gated("Monitor", { command: "git push origin HEAD:main", description: "x", timeout_ms: 1000 })).toBe(
      "ceo_gated_tool",
    );
    expect(classifySignal("PowerShell", { command: "git push origin main" })?.reason).toBe(
      "PowerShell command matched a CEO-gated pattern: push to main/master",
    );
    expect(classifySignal("PowerShell", { command: "Get-ChildItem" })).toBeNull();
    expect(classifySignal("Monitor", { ws: { url: "wss://example.com" }, description: "x", timeout_ms: 1 })).toBeNull();
  });

  it("merge, rebase and reset --hard are gated; git status is not", () => {
    expect(classifySignal("Bash", { command: "git reset --hard HEAD~1" })?.reason).toBe(
      "Bash command matched a CEO-gated pattern: merge/rebase/reset --hard",
    );
    expect(gated("Bash", { command: "git rebase main" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "git merge feature/x" })).toBe("ceo_gated_tool");
    expect(classifySignal("Bash", { command: "git status" })).toBeNull();
    expect(classifySignal("Bash", { command: "git reset HEAD file.ts" })).toBeNull();
  });

  it("a dependency change that names a package is gated; lockfile installs are not", () => {
    expect(classifySignal("Bash", { command: "pnpm add left-pad" })?.reason).toBe(
      "Bash command matched a CEO-gated pattern: dependency change",
    );
    expect(gated("Bash", { command: "npm install lodash" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "npm i -D vitest" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "pip install requests" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "yarn remove react" })).toBe("ceo_gated_tool");
    expect(gated("Bash", { command: "pnpm --filter api update zod" })).toBe("ceo_gated_tool");
    expect(classifySignal("Bash", { command: "pnpm install" })).toBeNull();
    expect(classifySignal("Bash", { command: "pnpm install --frozen-lockfile" })).toBeNull();
    expect(classifySignal("Bash", { command: "npm install" })).toBeNull();
    expect(classifySignal("Bash", { command: "npm ci" })).toBeNull();
  });

  it("MCP tools with a destructive word in the name are gated; innocuously named ones are the signed-off residual", () => {
    expect(classifySignal("mcp__coolify__deploy", {})).toEqual({
      kind: "ceo_gated_tool",
      reason: "MCP tool: mcp__coolify__deploy",
    });
    expect(gated("mcp__db__drop_table", {})).toBe("ceo_gated_tool");
    expect(gated("mcp__svc__restart", {})).toBe("ceo_gated_tool");
    expect(classifySignal("mcp__plugin_context7_context7__query-docs", {})).toBeNull();
  });
});

describe("classifySignal — CEO-04 gate-paths production-change set", () => {
  const CONFIG = "File change matched a CEO-gated pattern: production config";

  it("Write/Edit/MultiEdit/NotebookEdit on production config are gated, including Windows paths", () => {
    expect(classifySignal("Write", { file_path: "C:\\repo\\Dockerfile" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/repo/.env.production" })?.reason).toBe(CONFIG);
    expect(classifySignal("MultiEdit", { file_path: "/repo/.github/workflows/deploy.yml" })?.reason).toBe(CONFIG);
    expect(classifySignal("NotebookEdit", { notebook_path: "/repo/infra/main.tf" })?.reason).toBe(CONFIG);
    expect(classifySignal("Write", { file_path: "/repo/docker-compose.prod.yml" })?.reason).toBe(CONFIG);
    expect(classifySignal("Write", { file_path: "/repo/compose.yaml" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/repo/wrangler.jsonc" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/etc/nginx/nginx.conf" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/repo/api.dockerfile" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/repo/prod.tfvars" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/repo/.ENV" })?.reason).toBe(CONFIG);
  });

  it("ordinary file changes are not gated", () => {
    expect(classifySignal("Write", { file_path: "/repo/src/app.ts" })).toBeNull();
    expect(classifySignal("Edit", { file_path: "/repo/docs/env.md" })).toBeNull();
    expect(classifySignal("Edit", { file_path: "/repo/src/environment.ts" })).toBeNull();
  });

  it("WebFetch to a deploy hook is gated; an ordinary fetch is not", () => {
    expect(classifySignal("WebFetch", { url: "https://coolify.example/api/v1/deploy?uuid=x" })?.reason).toBe(
      "WebFetch matched a CEO-gated pattern: deploy hook",
    );
    expect(classifySignal("WebFetch", { url: "https://ci.example/webhook/abc" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("WebFetch", { url: "https://ci.example/hooks/abc" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("WebFetch", { url: "https://docs.example.com/guide" })).toBeNull();
  });

  it("shell writes into production config are gated; reads are not", () => {
    const WRITE = "Bash command matched a CEO-gated pattern: production config write";
    expect(classifySignal("Bash", { command: "echo X=1 >> .env" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "sed -i s/a/b/ Dockerfile" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "echo x | tee -a infra/main.tf" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "cp .env.example .env" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "mv ci.yml .github/workflows/ci.yml" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "cat .env.example" })).toBeNull();
    expect(classifySignal("Bash", { command: "cat Dockerfile > /tmp/out.txt" })).toBeNull();
  });
});
