# API Coverage — @anthropic-ai/claude-agent-sdk

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: capabilities relevant to Phase 4 (RUNTIME-01 AgentRuntime interface, RUNTIME-02
> ClaudeCodeRuntime). Source: 04-RESEARCH.md (fetched live from code.claude.com/docs/en/agent-sdk/*
> and code.claude.com/docs/en/headless this session).

| capability | decision | reason |
|---|---|---|
| query/session start (`query()`) | INTEGRATE | Core of `startTask`/`resumeTask` (D-01, D-02) — Plan 04-01 |
| streaming message consumption (`for await` over `SDKMessage`) | INTEGRATE | `getStatus`'s watchdog resets on every yielded message regardless of type (D-04) — Plan 04-01/04-02 |
| session capture (`session_id` on `init`/`result` messages) | INTEGRATE | Required for `pauseTask`/`resumeTask`/`sendMessage` (Pattern 2, no persistent client object in the TS SDK) — Plan 04-02 |
| resume/continue (`options.resume`) | INTEGRATE | `resumeTask`/`sendMessage`'s only mechanism to continue a session (D-03 sibling) — Plan 04-02 |
| interrupt/abort (`AbortController`, graceful `interrupt()`/`stop_task` if it exists) | INTEGRATE | `cancelTask`'s graceful-then-hard-kill (D-03) — Plan 04-02 |
| `canUseTool` permission callback | INTEGRATE | `requestReview` signal source #2a — fires on `AskUserQuestion` and CEO-gated tool calls (D-08) — Plan 04-03 |
| `Notification` hook (`permission_prompt` after ~6s) | INTEGRATE | `requestReview` signal source #2b — independent timing-based fallback signal (D-08) — Plan 04-03 |
| `permissionMode` (explicit `"default"`/`"plan"`) | INTEGRATE | Must be set explicitly on every `query()` call so `canUseTool` is reachable — Plan 04-01/04-03 |
| `permissionMode: "bypassPermissions"` | OPT-OUT | Silently defeats `canUseTool`/CEO-gate detection for everything except a small always-gated list (Pitfall 3) — never used for any unattended task this runtime drives; authored as a kept prohibition in 04-01's `must_haves.prohibitions` |
| `PreToolUse`/`PostToolUse` hooks | OPT-OUT | D-08's two named signal sources (`canUseTool` + `Notification`) already cover this phase's review/handoff detection needs; no additional behavior in RUNTIME-01/02 depends on per-tool pre/post hooks |
| Subagents / `Agent` tool / subagent fan-out | OPT-OUT | Out of this phase's scope (CONTEXT.md domain boundary: "no multi-agent concurrency model" — Phase 5+); PITFALLS.md's unbounded-fan-out risk is noted but not exercised by a single top-level task |
| MCP server configuration | OPT-OUT | No MCP servers are named anywhere in PROJECT.md/RESEARCH.md for this phase; nothing in RUNTIME-01/02 requires one |
| `includePartialMessages` (streaming tool-input deltas) | OPT-OUT | STACK.md flags this as useful for live "typing" animation — that's Phase 5 (Pixel Office Renderer)'s concern, not this phase's runtime-abstraction proof |
| CLI subprocess fallback (`claude -p --output-format stream-json` via `execa`) | OPT-OUT | D-01 requires this only for "a specific, identified SDK gap discovered during research/implementation" — RESEARCH.md found none; building it speculatively is exactly the anti-pattern D-01 forbids |
| V2 TypeScript session client (`createSession()`, `send`/`stream`) | OPT-OUT | Removed in `@anthropic-ai/claude-agent-sdk` 0.3.142 — does not exist in the installed `^0.3` version; superseded by `query()` + `resume`/`continue` (Pattern 2) |
| Cross-host / persisted session store beyond `~/.claude/projects/**/*.jsonl` | OPT-OUT | Session files are local-machine-only by SDK design; MVP is a single worker machine (RUNTIME-03) — no `SessionStore` adapter needed |

Every `OPT-OUT` above carries its one-line reason inline. No capability in this table is silently
omitted — see the `Sources` section of `04-RESEARCH.md` for citations.
