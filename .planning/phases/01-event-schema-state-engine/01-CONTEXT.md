# Phase 1: Event Schema & State Engine - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a typed event schema (`packages/event-schema`) and a Company State Engine (`packages/company-core`) that correctly produce and rebuild projections from a stream of events — proven entirely against stubbed, in-memory events. No real infrastructure (Postgres event log, WS gateway, worker, adapters) exists yet or is built in this phase; that begins in Phase 2. This is the first code written in the repository.

</domain>

<decisions>
## Implementation Decisions

### Event catalog scope
- **D-01:** Build the full typed event envelope (event ID, timestamp, company/floor/project/task, source/destination agent, payload, visibility level) now, and seed the payload catalog with a discriminated union (keyed by `type`) covering one representative event per required category (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer — 12 categories), rather than all ~40 concrete event types Brief.md lists. Concrete event types get added to the union incrementally by whichever later phase (git-adapter, gsd-adapter, CEO dashboard, Twitch/YouTube) actually knows the real payload shape. — **Reversibility:** reversible — extending a Zod discriminated union with new type branches is additive and non-breaking to already-validated event types.

### Monorepo bootstrap scope
- **D-02:** Bootstrap only the pnpm workspace root config (`pnpm-workspace.yaml`, `turbo.json`, root `tsconfig.json`) plus `packages/event-schema` and `packages/company-core`. Do not scaffold `apps/{web,api,stream-overlay,worker}` or the other `packages/*` (pixel-office, claude-adapter, git-adapter, gsd-adapter, twitch-adapter, youtube-adapter, orchestration-adapter, shared-ui) as stub directories — each is created in the phase that first needs it. The workspace glob (`apps/*`, `packages/*`) already picks up new packages with zero config edits. — **Reversibility:** reversible — adding a workspace member later is a small additive change.

### Idempotency / replay-dedup handling
- **D-03:** Keep the Phase 1 reducer (`packages/company-core`) a pure function over ordered, exactly-once input — no event-ID dedup logic in Phase 1. Event-handler idempotency (dedupe by event ID) is standard practice at the ingestion/transport layer, which doesn't exist until Phase 2's Postgres event log. **Carry-forward requirement:** Phase 2 (Control Plane Skeleton) planning MUST explicitly include dedup-at-ingestion as a named requirement — this is the exact failure mode PITFALLS.md calls "never acceptable to skip" once a real transport exists, and it must not be silently dropped just because Phase 1 deferred it. — **Reversibility:** costly — if Phase 2 planning forgets this requirement, the gap surfaces as production state drift (duplicate event application) rather than a build-time error; flag explicitly when planning Phase 2.

### Schema versioning mechanism
- **D-04:** Every event carries a `version: number` field (starting at `1`), satisfying EVENT-01's envelope contract. No upcast/migration/version-dispatch machinery is built in Phase 1. Real versioning logic (upcasters, dispatch-on-read) is designed and built in whichever future phase first needs to change an existing event type's payload shape in a breaking way — informed by a real change rather than a guess. — **Reversibility:** reversible — the `version` field itself is the only part that's expensive to retrofit, and it's already included from day one.

### Claude's Discretion
- Exact Zod schema structure/module layout within `packages/event-schema` (single file vs. per-category files, how the discriminated union is composed).
- Which specific event type is chosen as the "representative" seed for each of the 12 categories — pick whichever is simplest to stub credibly (e.g. `agent.online`/`agent.offline` for the agent category, `task.created` for task, etc.), consistent with the category-level examples already listed in Brief.md.
- Internal reducer/projection table shape (e.g. one reducer per projection type vs. one root reducer) as long as projections are read-only to downstream consumers and rebuildable by replay.
- Test structure/fixture design used to prove replay-determinism (Success Criterion 3) — a Vitest suite with hand-crafted stub event sequences is sufficient; no specific framework beyond what STACK.md already mandates (Vitest).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — Core Value, constraints (event-driven architecture, monorepo layout, tech stack), Key Decisions
- `.planning/REQUIREMENTS.md` — EVENT-01, EVENT-03, EVENT-04 (this phase's mapped requirements)
- `.planning/ROADMAP.md` §Phase 1 — Goal and Success Criteria for this phase
- `Brief.md` §"Event System" — original event type examples (company.started, task.blocked, git.pr_merged, etc.) and required envelope fields; §"Company Model" and §"Agent States" for projection shape context

### Research (produced 2026-09-18)
- `.planning/research/STACK.md` — TypeScript ^5.7, Zod ^4.6 for `packages/event-schema`, pnpm ^9 + Turborepo ^2.10 for monorepo tooling, Vitest for tests
- `.planning/research/ARCHITECTURE.md` §"Recommended Project Structure", §"Pattern 1: Event Sourcing with Materialized Projections" — `CompanyEvent<T>` interface example (id/type/version/occurredAt/correlationId/causationId/visibility/payload), reducer-not-service-call pattern, `packages/event-schema` and `packages/company-core` responsibilities
- `.planning/research/PITFALLS.md` §"Pitfall 2: Pixel office state silently drifts from real Claude Code / GSD / git state" — idempotency/dedup guidance and verification approach (kill-worker-mid-task replay test), carried forward to Phase 2 per D-03 above

</canonical_refs>

<code_context>
## Existing Code Insights

No code exists yet — this is the first phase and the first code written in the repository. Only planning docs (`.planning/`), `Brief.md`, and `README.md` exist. There are no reusable assets, established patterns, or integration points to scout.

</code_context>

<specifics>
## Specific Ideas

No specific customizations beyond the canonical refs and decisions above. Brief.md's event type list (company.*, project.*, task.*, agent.*, review.*, qa.*, ceo.*, git.*, deployment.*, viewer.*, company.progression) is the source to draw the 12 seeded representative events from (D-01) — treat it as the vocabulary reference, not a checklist to fully implement in Phase 1.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Note: the dedup/idempotency carry-forward under D-03 is not a deferred *capability* idea — it's an explicit requirement that must land in Phase 2's own discussion/planning, tracked there rather than here.)

</deferred>

---

*Phase: 1-Event Schema & State Engine*
*Context gathered: 2026-09-18*
