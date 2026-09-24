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

  // WR-01 (06-REVIEW): equivalent spellings of the destructive ops.
  it.each([
    "rm -rf build",
    "rm -fr build",
    "rm -r -f build",
    "rm -rfv build",
    "rm --recursive --force build",
    "rm -R -f build",
    "Remove-Item -Recurse -Force build",
    "git clean -fdx",
    "git -C ../repo clean --force -d",
  ])("destructive filesystem op: %s", (command) => {
    expect(classifySignal("Bash", { command })?.reason).toBe(
      "Bash command matched a CEO-gated pattern: destructive filesystem op",
    );
  });

  it.each(["psql -c 'DROP SCHEMA public CASCADE'", "psql -c 'TRUNCATE users'", "psql -c 'drop table x'"])(
    "destructive DB op: %s",
    (command) => {
      expect(classifySignal("Bash", { command })?.reason).toBe("Bash command matched a CEO-gated pattern: destructive DB op");
    },
  );

  it.each(["git -C ../repo reset --hard HEAD~1", "git -C ../repo merge feature/x", "git -c core.x=y rebase main"])(
    "git global options before the subcommand: %s",
    (command) => {
      expect(classifySignal("Bash", { command })?.reason).toBe(
        "Bash command matched a CEO-gated pattern: merge/rebase/reset --hard",
      );
    },
  );

  it("near misses stay ungated", () => {
    expect(classifySignal("Bash", { command: "rm -r build" })).toBeNull();
    expect(classifySignal("Bash", { command: "rm -f a.txt" })).toBeNull();
    expect(classifySignal("Bash", { command: "git clean -n" })).toBeNull();
    expect(classifySignal("Bash", { command: "git log --grep merge" })).toBeNull();
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

  // Any other MCP tool: a destructive word in the `action` (the review's IN-01 rule).
  it("a non-Coolify MCP tool is gated on a destructive word in its action, and only then", () => {
    expect(classifySignal("mcp__db__table", { action: "delete" })).toEqual({
      kind: "ceo_gated_tool",
      reason: "MCP tool: mcp__db__table (action: delete)",
    });
    expect(classifySignal("mcp__db__table", { action: "update" })).toBeNull();
    expect(classifySignal("mcp__db__table", {})).toBeNull();
  });
});

// 06-REVIEW IN-01 (iteration 3, user decision "reading is always fine, only
// edit/delete"): every coolify-mcp call that changes anything waits for the
// CEO. The table is every tool @masonator/coolify-mcp 3.5.1 registers, with
// every value of its `action` enum, read from the installed package.
describe("classifySignal — Coolify MCP: reads pass, everything else is gated", () => {
  const call = (tool: string, action: unknown) =>
    classifySignal(`mcp__coolify__${tool}`, action === undefined ? {} : { action });

  // [tool, action] — undefined = the tool takes no action argument.
  const READS: [string, string | undefined][] = [
    ...[
      "get_version",
      "get_mcp_version",
      "list_instances",
      "get_infrastructure_overview",
      "diagnose_app",
      "diagnose_server",
      "find_issues",
      "list_servers",
      "get_server",
      "server_resources",
      "server_domains",
      "list_destinations",
      "list_applications",
      "get_application",
      "logs",
      "application_logs",
      "list_databases",
      "get_database",
      "list_services",
      "get_service",
      "list_deployments",
      "search_docs",
    ].map((tool): [string, undefined] => [tool, undefined]),
    ["projects", "list"],
    ["projects", "get"],
    ["environments", "list"],
    ["environments", "get"],
    ["environments", "verify_app"],
    ["service", "list_containers"],
    ["env_vars", "list"],
    ["deployment", "get"],
    ["deployment", "list_for_app"],
    ["private_keys", "list"],
    ["private_keys", "get"],
    ["github_apps", "list"],
    ["github_apps", "get"],
    ["github_apps", "list_repos"],
    ["github_apps", "list_branches"],
    ["database_backups", "list_schedules"],
    ["database_backups", "get_schedule"],
    ["database_backups", "list_executions"],
    ["database_backups", "get_execution"],
    ["teams", "list"],
    ["teams", "get"],
    ["teams", "get_members"],
    ["teams", "get_current"],
    ["teams", "get_current_members"],
    ["cloud_tokens", "list"],
    ["cloud_tokens", "get"],
    ["storages", "list"],
    ["scheduled_tasks", "list"],
    ["scheduled_tasks", "list_executions"],
    ["hetzner", "list_locations"],
    ["hetzner", "list_server_types"],
    ["hetzner", "list_images"],
    ["hetzner", "list_ssh_keys"],
    ["system", "health"],
    ["system", "list_resources"],
    ["tags", "list"],
  ];

  const WRITES: [string, string | undefined][] = [
    ...["deploy", "bulk_env_update", "redeploy_project", "restart_project_apps", "stop_all_apps", "validate_server"].map(
      (tool): [string, undefined] => [tool, undefined],
    ),
    ...(
      [
        ["projects", ["create", "update", "delete"]],
        ["environments", ["create", "delete"]],
        [
          "application",
          [
            "create_public",
            "create_github",
            "create_key",
            "create_dockerimage",
            "create_dockerfile",
            "update",
            "move",
            "delete",
            "delete_preview",
          ],
        ],
        ["database", ["create", "update", "move", "delete"]],
        [
          "service",
          [
            "create",
            "update",
            "move",
            "delete",
            "update_application",
            "start_application",
            "stop_application",
            "restart_application",
          ],
        ],
        ["control", ["start", "stop", "restart"]],
        ["env_vars", ["create", "update", "delete", "bulk_update"]],
        ["deployment", ["cancel"]],
        ["private_keys", ["create", "update", "delete"]],
        ["github_apps", ["create", "update", "delete"]],
        ["database_backups", ["create", "update", "delete", "delete_execution"]],
        ["cloud_tokens", ["create", "update", "delete", "validate"]],
        ["storages", ["create", "update", "delete", "backup_set", "backup_delete", "backup_run"]],
        ["scheduled_tasks", ["create", "update", "delete", "run_once"]],
        ["hetzner", ["create_server"]],
        ["system", ["enable_api", "disable_api"]],
        ["tags", ["attach", "detach"]],
      ] as const
    ).flatMap(([tool, actions]) => actions.map((action): [string, string] => [tool, action])),
  ];

  it.each(READS)("%s %s is a read and is not gated", (tool, action) => {
    expect(call(tool, action)).toBeNull();
  });

  it.each(WRITES)("%s %s changes something and is gated", (tool, action) => {
    expect(call(tool, action)?.kind).toBe("ceo_gated_tool");
  });

  it("fails closed: an unknown tool, or a missing, unknown or non-string action, is gated", () => {
    for (const [tool, action] of [
      ["some_future_tool", undefined],
      ["constructor", undefined],
      ["projects", undefined],
      ["projects", "archive"],
      ["projects", "LIST"],
      ["projects", ["list"]],
      ["teams", "some_future_action"],
      ["deploy", "list"],
    ] as [string, unknown][]) {
      expect(call(tool, action)?.kind, `${tool} ${String(action)}`).toBe("ceo_gated_tool");
    }
  });

  it("names the action when the tool has one, and matches a prefixed server name", () => {
    expect(call("control", "start")).toEqual({
      kind: "ceo_gated_tool",
      reason: "MCP tool: mcp__coolify__control (action: start)",
    });
    expect(call("env_vars", undefined)?.reason).toBe("MCP tool: mcp__coolify__env_vars (action: undefined)");
    expect(call("bulk_env_update", undefined)?.reason).toBe("MCP tool: mcp__coolify__bulk_env_update");
    expect(classifySignal("mcp__plugin_ops_coolify__stop_all_apps", {})?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("mcp__plugin_ops_coolify__list_deployments", {})).toBeNull();
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

  // WR-03 (06-REVIEW): files that control the agent and git are gate-paths too.
  it("agent and git control files are gated, from file tools and from the shell", () => {
    expect(classifySignal("Write", { file_path: "/repo/.claude/settings.json" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "C:\\repo\\.claude\\settings.local.json" })?.reason).toBe(CONFIG);
    expect(classifySignal("Write", { file_path: "/repo/.mcp.json" })?.reason).toBe(CONFIG);
    expect(classifySignal("Write", { file_path: "/repo/.gitattributes" })?.reason).toBe(CONFIG);
    expect(classifySignal("Edit", { file_path: "/repo/.git/config" })?.reason).toBe(CONFIG);
    expect(classifySignal("Write", { file_path: "/repo/.git/hooks/pre-commit" })?.reason).toBe(CONFIG);
    expect(classifySignal("Write", { file_path: "/repo/.git/info/attributes" })?.reason).toBe(CONFIG);
    expect(classifySignal("Bash", { command: "echo '{}' > .claude/settings.local.json" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("Bash", { command: "cp hook.sh .git/hooks/pre-commit" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("Write", { file_path: "/repo/docs/claude.md" })).toBeNull();
    expect(classifySignal("Write", { file_path: "/repo/src/git/config.ts" })).toBeNull();
  });

  it("git config writes are gated; reads are not", () => {
    const WRITE = "Bash command matched a CEO-gated pattern: git config write";
    expect(classifySignal("Bash", { command: "git config core.fsmonitor ./x.sh" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "git -C ../repo config --local core.hooksPath hooks" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "git config set filter.x.clean ./x" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "git config --get user.email" })).toBeNull();
    expect(classifySignal("Bash", { command: "git config --list" })).toBeNull();
    expect(classifySignal("Bash", { command: "git config get user.email" })).toBeNull();
  });

  // 06-REVIEW WR-03, iteration 2 (user decision "Allow bare reads"): a single
  // key with no value is a read. Everything else stays gated, failing closed.
  it.each([
    "git config user.name",
    "git config remote.origin.url",
    "git config --global user.email",
    "git -C ../repo config branch.feature/x.remote",
    "git config user.name || echo none",
    "git config user.name\ngit status",
    "git config --file .gitmodules submodule.lib.url",
    "git config --show-origin --list",
  ])("a git config read is not gated: %s", (command) => {
    expect(classifySignal("Bash", { command })).toBeNull();
  });

  it.each([
    "git config user.name bob",
    "git config --global core.hooksPath hooks",
    "git config --add remote.origin.fetch x",
    "git config --unset user.name",
    "git config --unset-all user.name",
    "git config --replace-all user.name bob",
    "git config --rename-section a b",
    "git config --remove-section a",
    "git config --edit",
    "git config -e",
    "git config unset user.name",
    "git config --file .git/config core.fsmonitor ./x.sh",
    // A value that happens to spell a read op is still a write (git accepts
    // options after the arguments, so `k v --list` writes k=v).
    "git config core.fsmonitor list",
    "git config core.fsmonitor get",
    "git config core.pager x --list",
    // -c / --config-env tricks and anything that cannot be read as one key.
    "git -c core.fsmonitor=./x.sh config user.name",
    "git -c core.fsmonitor=./x.sh config --get user.name",
    "git --config-env=core.fsmonitor=HOOK config user.name",
    'git config "user.name"',
    "git config user.$(touch x)",
    "git config user.name > out.txt",
  ])("a git config write or unclassifiable form is gated: %s", (command) => {
    expect(classifySignal("Bash", { command })?.reason).toBe("Bash command matched a CEO-gated pattern: git config write");
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

  // WR-02 (06-REVIEW): the same deploy-hook rule for a fetch from the shell.
  it("a shell fetch of a webhook or /hook(s)/ URL is gated; an ordinary fetch is not", () => {
    const HOOK = "Bash command matched a CEO-gated pattern: deploy hook";
    expect(classifySignal("Bash", { command: "curl -X POST https://ci.example/webhooks/abc" })?.reason).toBe(HOOK);
    expect(classifySignal("Bash", { command: "curl -fsS -X POST 'https://ci.example/hooks/abc?x=1'" })?.reason).toBe(HOOK);
    expect(classifySignal("Bash", { command: "wget -q -O- https://ci.example/hook" })?.reason).toBe(HOOK);
    expect(
      classifySignal("PowerShell", { command: "Invoke-WebRequest -Method Post https://ci.example/webhook/x" })?.kind,
    ).toBe("ceo_gated_tool");
    expect(classifySignal("Bash", { command: "curl -fsSL https://docs.example.com/guide" })).toBeNull();
    expect(classifySignal("Bash", { command: "curl https://example.com/hookshot" })).toBeNull();
  });

  it("shell writes into production config are gated; reads are not", () => {
    const WRITE = "Bash command matched a CEO-gated pattern: production config write";
    expect(classifySignal("Bash", { command: "echo X=1 >> .env" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "sed -i s/a/b/ Dockerfile" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "echo x | tee -a infra/main.tf" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "cp .env.example .env" })?.reason).toBe(WRITE);
    expect(classifySignal("Bash", { command: "mv ci.yml .github/workflows/ci.yml" })?.reason).toBe(WRITE);
    // WR-01: the PowerShell spellings of the same writes.
    expect(classifySignal("PowerShell", { command: "Set-Content -Path .env -Value X=1" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("PowerShell", { command: "'x' | Out-File infra/main.tf" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("PowerShell", { command: "Copy-Item .env.example .env" })?.kind).toBe("ceo_gated_tool");
    expect(classifySignal("PowerShell", { command: "Get-Content .env.example" })).toBeNull();
    expect(classifySignal("Bash", { command: "cat .env.example" })).toBeNull();
    expect(classifySignal("Bash", { command: "cat Dockerfile > /tmp/out.txt" })).toBeNull();
  });
});
