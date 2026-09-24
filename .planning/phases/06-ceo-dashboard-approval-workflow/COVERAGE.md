# API Coverage — Phase 6 (CEO Dashboard & Approval Workflow)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: external APIs/SDKs this phase integrates. Sources: 06-RESEARCH.md (installed `sdk.d.ts` for
> `@anthropic-ai/claude-agent-sdk@0.3.278`, code.claude.com agent-sdk docs, Cloudflare "Validate JWTs").

## @anthropic-ai/claude-agent-sdk (permission and hook surface)

| capability | decision | reason |
|---|---|---|
| `canUseTool` held open until the CEO decides (`signal`, `toolUseID`) | INTEGRATE | D-01 core gate — 06-01 |
| `PermissionResult` allow with `updatedInput` = parked input / deny with message | INTEGRATE | Approve runs only the parked call; D-05 typed prefixes — 06-01 |
| AskUserQuestion answers via `updatedInput { questions, answers }` | INTEGRATE | CEO answers questions from /ceo — 06-01 Task 2, 06-09 |
| `PreToolUse` hook returning `permissionDecision: "ask"` | INTEGRATE | Beats settings allow rules (Pitfall 1, CEO-04) — 06-02; proven live in 06-11 |
| `Notification` hook | INTEGRATE | Existing Phase 4 signal, now guarded against duplicates while parked (D-03) — 06-02 |
| `systemPrompt` preset `claude_code` with `append` | INTEGRATE | Tells the agent what each `[CEO:...]` prefix means (D-05/D-06) — 06-01 Task 2 |
| canUseTool abort `signal` | INTEGRATE | Aborted parks deny + `ceo.approval_expired` (D-02) — 06-02 |
| `PreToolUse` `defer` + session resume | OPT-OUT | Rejected by D-01; listed in CONTEXT Deferred Ideas |
| Parking inside a `PreToolUse` hook | OPT-OUT | Hook timeouts skip the tool (research Alternatives); used only as the A1 fallback if the live proof fails (06-11) |
| Streaming-input (async-iterable) prompt | OPT-OUT | Not needed unless A2 fails live; defined fallback in 06-11 |
| `toolConfig.askUserQuestion.previewFormat: "html"` | OPT-OUT | Previews must render as plain text (XSS); never enabled |
| Changing `settingSources` to drop project/local settings | OPT-OUT | GSD commands come from user settings; the PreToolUse "ask" hook closes the allow-rule gap instead |
| Subagent permission prompts | OPT-OUT | No subagent fan-out in this phase (multi-agent orchestration is out of scope) |
| `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` warning | OPT-OUT | Does not fire for settings-file rules (research State of the Art); the hook is the real guard |

## Cloudflare Access (JWT verification and application API)

| capability | decision | reason |
|---|---|---|
| Verify `Cf-Access-Jwt-Assertion` against team JWKS (`/cdn-cgi/access/certs`), `iss`, `aud`, RS256, via `jose` | INTEGRATE | D-11 decider identity — 06-05 |
| `CF_Authorization` cookie as the token source when the header is absent | INTEGRATE | Assumption A3 hedge for WebSocket upgrades — 06-05 |
| Self-hosted Access application scoped to `test.pixelfirm.dev/ceo` with a single-email allow policy, created via API | INTEGRATE | D-11 on staging without dashboard clicks — 06-12 |
| `/cdn-cgi/access/get-identity` | OPT-OUT | The verified JWT's `email` claim is all the decider identity needs |
| Service tokens (`CF-Access-Client-Id/Secret`) | OPT-OUT | Worker paths are outside the Access scope; tokens without an email claim are rejected by design |
| cloudflared origin-side "access required" enforcement | OPT-OUT | Per-hostname, so it would block the worker's `/events` and `/ws` on the shared host; the API verifies the JWT on every `/ceo` request instead |
| Access session revocation/logout endpoints | OPT-OUT | Single CEO; sessions are managed by Access itself |

## Coolify API (via the coolify MCP, infrastructure only)

| capability | decision | reason |
|---|---|---|
| Create application from Dockerfile, set runtime env, deploy, one-off command exec | INTEGRATE | Stage /ceo and apply migration 0004 on staging — 06-12 |
| Database provisioning | OPT-OUT | The `pixelfirm` database already exists (Phase 2) |
