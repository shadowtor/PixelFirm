# Phase 3 — API Coverage Decision

**Detector result:** `detected: true` on a scan of 03-RESEARCH.md + 03-CONTEXT.md + the ROADMAP.md Phase 3 section.

**Re-read of the two matched snippets (confirmed false positive, not asserted):**

1. `03-CONTEXT.md` D-02's reversibility rationale: "...swapping to a different liveness source (e.g. an actual Claude Agent SDK session hook once Phase 4 exists)..." — this names the Claude Agent SDK only as a *future, Phase-4* alternative to this phase's process-liveness heuristic. Phase 3 does not integrate it; Phase 4 (AgentRuntime & ClaudeCodeRuntime, not yet planned) is where that integration decision belongs.
2. `03-RESEARCH.md` Sources section: `@anthropic-ai/claude-agent-sdk` appears only inside a list of packages whose live npm version was checked via `npm view <pkg> version` as part of the researcher's general due-diligence pass this session — it is NOT listed in RESEARCH.md's own Standard Stack table (execa, ws, gray-matter, zod, event-schema, pino are this phase's actual dependencies) and no task in any of this phase's 4 plans installs or imports it.

**Declaration:**

No external API integration: this phase's own control-plane WS/HTTP endpoints (`POST /events`, `GET /ws`, `GET /admin/workers`) are internal and already built in Phase 2 — out of this checkpoint's scope by the contribution's own carve-out. The only new "external" surfaces this phase touches are local OS mechanisms (git CLI via `execa`, PowerShell/`ps` process listing via `execa`) and a local filesystem parser (`gray-matter` over `.planning/*.md`) — none of these are third-party network APIs/SDKs. The `@anthropic-ai/claude-agent-sdk` mentions are forward-looking research notes for a different, not-yet-planned phase, not this phase's scope. No capability matrix is fabricated; this declaration stands in its place.
