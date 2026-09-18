# Phase 1: Event Schema & State Engine - Research

**Researched:** 2026-09-18
**Domain:** Typed event-envelope schema (Zod discriminated union) + pure in-memory event-sourcing reducer, proven against stubbed events only — first code in the repo, no real infrastructure yet
**Confidence:** MEDIUM (stack/version facts are registry-verified HIGH; architecture pattern is the same event-sourcing shape already established in this project's own `.planning/research/ARCHITECTURE.md` and `PITFALLS.md`, MEDIUM; two version-drift findings below are WebSearch-only, LOW, and need confirmation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Event catalog scope):** Build the full typed event envelope (event ID, timestamp, company/floor/project/task, source/destination agent, payload, visibility level) now, and seed the payload catalog with a discriminated union (keyed by `type`) covering one representative event per required category (company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer — 12 categories), rather than all ~40 concrete event types Brief.md lists. Concrete event types get added to the union incrementally by whichever later phase actually knows the real payload shape. Reversibility: reversible.
- **D-02 (Monorepo bootstrap scope):** Bootstrap only the pnpm workspace root config (`pnpm-workspace.yaml`, `turbo.json`, root `tsconfig.json`) plus `packages/event-schema` and `packages/company-core`. Do NOT scaffold `apps/*` or other `packages/*` as stub directories — each is created in the phase that first needs it. Reversibility: reversible.
- **D-03 (Idempotency / replay-dedup handling):** Keep the Phase 1 reducer (`packages/company-core`) a pure function over ordered, exactly-once input — no event-ID dedup logic in Phase 1. Event-handler idempotency belongs at the ingestion/transport layer, which doesn't exist until Phase 2's Postgres event log. **Carry-forward requirement:** Phase 2 planning MUST explicitly include dedup-at-ingestion as a named requirement. Reversibility: costly if Phase 2 planning forgets this — flag explicitly when planning Phase 2.
- **D-04 (Schema versioning mechanism):** Every event carries a `version: number` field (starting at `1`), satisfying EVENT-01's envelope contract. No upcast/migration/version-dispatch machinery is built in Phase 1. Reversibility: reversible except the `version` field itself, which is already included from day one.

### Claude's Discretion

- Exact Zod schema structure/module layout within `packages/event-schema` (single file vs. per-category files, how the discriminated union is composed).
- Which specific event type is chosen as the "representative" seed for each of the 12 categories — pick whichever is simplest to stub credibly (e.g. `agent.online`/`agent.offline` for the agent category, `task.created` for task, etc.), consistent with the category-level examples already listed in Brief.md.
- Internal reducer/projection table shape (e.g. one reducer per projection type vs. one root reducer) as long as projections are read-only to downstream consumers and rebuildable by replay.
- Test structure/fixture design used to prove replay-determinism (Success Criterion 3) — a Vitest suite with hand-crafted stub event sequences is sufficient; no specific framework beyond what STACK.md already mandates (Vitest).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. The dedup/idempotency carry-forward under D-03 is not a deferred *capability* idea — it is an explicit requirement that must land in Phase 2's own discussion/planning, tracked there rather than here.

</user_constraints>

## Summary

Phase 1 has no real dependencies to integrate against — it is a pure TypeScript domain-modeling exercise: define a typed event envelope with Zod, seed a discriminated union with 12 representative event payloads (one per required category), and write a pure reducer (`packages/company-core`) that folds an ordered event array into materialized projections. Every "pitfall" that matters here is a design-discipline pitfall, not an integration pitfall: keep the reducer pure (no `Date.now()`/`crypto.randomUUID()` calls inside it — those belong at event-creation time, not fold time), keep projections read-only to consumers, and prove replay by running the same fixture array through the reducer twice and asserting deep-equality.

Two stack facts drifted since this project's own `STACK.md` was researched today: TypeScript's `latest` npm dist-tag is now the Go-native `7.0.2` compiler (GA 2026-07-08), not the `^5.7` STACK.md recommended, and pnpm's `latest` is now major `12`, not the `^9` STACK.md recommended. Both are flagged below with a concrete recommendation and logged as assumptions needing confirmation, because the TypeScript jump specifically breaks tools this project will likely add later (typescript-eslint, ts-node) since TS 7.0 does not yet ship a programmatic compiler API.

**Primary recommendation:** Bootstrap the workspace with TypeScript `^5.7` (not npm's `latest` 7.0.2) and Zod `^4.6`/Vitest `^5.0`/Turborepo `^2.10` at their current registry-verified versions; build `packages/event-schema` as a single discriminated union keyed by a namespaced `type` string (e.g. `"task.created"`), and `packages/company-core` as one root reducer with a `Record<type, handler>` dispatch table folding into per-projection-kind state slices, tested by feeding the same fixture event array through the reducer twice and diffing the results.

## Architectural Responsibility Map

Phase 1 predates any deployed application tier (no `apps/*` exist yet per D-02) — the closest fit is the future API/Backend tier, since these are the packages the Phase 2 control plane and Phase 3 worker will both import as shared domain logic.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event envelope schema + validation (`packages/event-schema`) | API / Backend (shared domain contract) | — | Zero rendering/transport code; both the future worker and control-plane API import this package as their shared contract — it belongs to neither individually |
| Company State Engine / reducers (`packages/company-core`) | API / Backend (domain logic) | Database / Storage (future) | Pure in-memory fold for Phase 1; Phase 2 backs the same reducer output with Postgres projection tables — the reducer itself never changes tiers, only its storage backing does |
| Replay/rebuild guarantee | API / Backend (domain logic) | Database / Storage (future) | Replay is proven as a reducer property now (same array in, same state out); Phase 2 adds the durable log the replay actually reads from |
| Monorepo build tooling (pnpm/turbo/tsconfig bootstrap) | Dev Tooling (not a runtime tier) | — | Build-time only; no runtime component reads `turbo.json`/`pnpm-workspace.yaml` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.7` [CITED: .planning/research/STACK.md] — see State of the Art note below re: 7.0.2 | Language for both packages | Already the project's canonical stack pin (STACK.md); Zod, Vitest, and the whole future stack are TS-native |
| Zod | `^4.6` (verified `4.6.5` on npm, published 2026-09-13) [VERIFIED: npm registry] | Runtime validation + type inference for the event envelope and payload union | This is the seam EVENT-01 exists to make enforceable — validating at the schema boundary is what makes "malformed events are rejected" a code fact, not a policy. Already the project's canonical pin (STACK.md, CONTEXT.md D-04). |
| Vitest | `^5.0` (verified `5.0.1` on npm, published 2026-09-15) [VERIFIED: npm registry] | Test runner for both packages | Already the project's canonical pin (STACK.md); native TS/ESM support, no config needed for Node-only packages |
| pnpm | see State of the Art note — recommend a current `10.x`/`11.x` release, not the registry's bleeding-edge `latest` `12.4.2`, until D-02's bootstrap is confirmed against it | Workspace/package manager | `pnpm-workspace.yaml` is the monorepo glob mechanism D-02 requires |
| Turborepo | `^2.10` (verified `2.10.13` on npm, published 2026-09-17) [VERIFIED: npm registry] | Task runner/cache for `pnpm test`/`pnpm build` across the two packages | Already the project's canonical pin (STACK.md); matches exactly, no drift |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `crypto.randomUUID()` | Node ≥14.17 (present in the installed Node `v25.9.0` [VERIFIED: local `node --version`]) | Event `id` generation | Standard-library UUID generation — no `uuid` package needed for a phase this small |
| Node built-in `Date`/`toISOString()` | — | Event `occurredAt` timestamp | No date library needed for a single ISO-8601 stamp per event |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod discriminated union | `io-ts`, Valibot | Zod is already the project's locked pin (STACK.md, CONTEXT.md D-04); no reason to reopen this for Phase 1 |
| One root reducer with a dispatch table | Multiple independent reducers combined via a `combineReducers`-style helper | Either is fine per CONTEXT.md's "Claude's Discretion" grant on reducer shape; a single dispatch table is simpler for 12 seed event types and avoids building combinator infrastructure this phase doesn't need |
| pnpm + Turborepo | npm/yarn workspaces, Nx | Already the project's locked pin (STACK.md); not reopened here |

**Installation:**
```bash
# from repo root, after pnpm-workspace.yaml / turbo.json / root tsconfig.json exist
pnpm add -w -D typescript@^5.7 vitest@^5.0 turbo@^2.10
pnpm --filter event-schema add zod@^4.6
pnpm --filter company-core add zod@^4.6   # if company-core needs the event types directly rather than only via workspace dependency
```

**Version verification:** confirmed live against the npm registry this session (2026-09-18):
- `zod` → `4.6.5` (published 2026-09-13)
- `typescript` → `latest` dist-tag is `7.0.2` (published 2026-07-08) — see below, recommend pinning `^5.7` instead
- `vitest` → `5.0.1` (published 2026-09-15)
- `turbo` → `2.10.13` (published 2026-09-17)
- `pnpm` → `latest` dist-tag is `12.4.2` (published 2026-09-15) — see below

## Package Legitimacy Audit

| Package | Registry | Age (of `latest` version, not the package) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------|-----------|-------------|---------|-------------|
| `zod` | npm | latest version published 5 days ago | 264,439,481/wk [VERIFIED: npm registry] | github.com/colinhacks/zod | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify`, but see note below |
| `typescript` | npm | latest version published ~2 months ago | 253,128,495/wk [VERIFIED: npm registry] | github.com/microsoft/TypeScript | OK | Approved |
| `vitest` | npm | latest version published 3 days ago | 94,501,079/wk [VERIFIED: npm registry] | github.com/vitest-dev/vitest | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify`, but see note below |
| `turbo` | npm | latest version published 4 days ago | 22,537,690/wk [VERIFIED: npm registry] | github.com/vercel/turborepo | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify`, but see note below |

**Note on the three `SUS` verdicts:** the legitimacy checker's only stated `reasons` for all three is `too-new`, driven by how recently the *current version* was published (days), not the package's age or reputation — all three have hundreds of millions of weekly downloads and a matching, long-established GitHub org (`colinhacks`, `vitest-dev`, `vercel`). This reads as the checker's recency heuristic reacting to a routine patch release rather than a real slopsquatting signal. Per protocol the verdict stands as reported and each package still needs a `checkpoint:human-verify` task before install — but the planner and human reviewer should expect that checkpoint to be a fast confirmation, not a real investigation.

**Packages removed due to `SLOP` verdict:** none.
**Packages flagged as suspicious `SUS`:** `zod`, `vitest`, `turbo` — planner inserts `checkpoint:human-verify` before each install (see note above on why these are almost certainly false positives).

## Architecture Patterns

### System Architecture Diagram

Phase 1 builds only the left two boxes of the project's eventual pipeline — everything to the right of the state engine (Postgres, WS gateway, renderer, overlay) is Phase 2+ and does not exist yet. The diagram below shows only what Phase 1 actually builds and proves, in isolation:

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│ Vitest fixture: an ordered   │        │ packages/company-core                 │
│ array of stubbed             │──────► │  reducer(state, event) → state        │
│ CompanyEvent<T> objects,     │        │  dispatch table keyed by event.type   │
│ one call per category        │        │  folds array via Array.reduce()       │
│ (company/floor/project/task/ │        │        │                              │
│ agent/session/handoff/       │        │        ▼                              │
│ review/approval/git/         │        │  projection state:                   │
│ deployment/viewer)           │        │   { agents, floors, teams,           │
└──────────────┬───────────────┘        │     projects, tasks }                │
               │                        └──────────────┬───────────────────────┘
               ▼                                        │ read-only export
┌─────────────────────────────┐                         ▼
│ packages/event-schema        │              ┌──────────────────────┐
│  CompanyEventSchema =        │              │ Test assertions:      │
│  z.discriminatedUnion(       │              │  1. malformed event   │
│    "type", [...])            │◄─────────────┤     → safeParse fails │
│  .safeParse(raw) / .parse()  │  validates    │  2. replay(sameArray) │
└───────────────────────────────┘  each event  │     twice → toEqual   │
                                                └──────────────────────┘
```

The only "flow" this phase proves is: **fixture array → schema validation → reducer fold → projection**, and that folding the same array twice yields identical output. Nothing here talks to a network, a database, or a filesystem.

### Recommended Project Structure

```
pnpm-workspace.yaml          # packages: ["packages/*"]
turbo.json                   # pipeline: build/test/lint tasks
tsconfig.json                # root; packages extend this via "extends"
packages/
├── event-schema/
│   ├── package.json
│   ├── tsconfig.json         # extends root, composite: true (see D-02/state-of-art note)
│   └── src/
│       ├── envelope.ts       # CompanyEventSchema base fields shared by every event
│       ├── payloads/         # one file per seeded category, or a single catalog.ts
│       │   └── index.ts      # exports the z.discriminatedUnion("type", [...])
│       └── index.ts          # public exports: schema + inferred types
└── company-core/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── projections.ts    # projection state shape (AgentState, FloorState, ...)
        ├── reducer.ts         # dispatch table + root reduce()
        └── index.ts
```

Per D-02, this is the *entire* workspace bootstrap for Phase 1 — no `apps/*`, no other `packages/*` stub directories. The `pnpm-workspace.yaml` glob (`packages/*`) already picks up future packages with zero config edits when later phases add them.

### Pattern 1: Discriminated-union event envelope, namespaced `type` string

**What:** A single Zod discriminated union keyed by a `type` string that is itself namespaced (`"task.created"`, `"agent.online"`) so the category is legible from the string alone — no separate `category` enum field is needed on the schema. EVENT-01 [VERIFIED: .planning/REQUIREMENTS.md:12] requires the envelope to carry: `"event ID, timestamp, company, floor, project, task, source agent, destination agent, payload, and visibility level"`. The project's own prior architecture research already sketched the envelope shape [VERIFIED: .planning/research/ARCHITECTURE.md:137-146]:
```typescript
export interface CompanyEvent<T = unknown> {
  id: string;              // uuid
  type: string;             // "TaskStatusChanged", "ApprovalRequested", ...
  version: number;          // schema version for this type
  occurredAt: string;       // ISO timestamp, from source system if known
  correlationId: string;    // ties events in one workflow together
  causationId?: string;     // the event/command that caused this one
  visibility: 'PRIVATE' | 'INTERNAL' | 'STREAM_SAFE' | 'PUBLIC';
  payload: T;
}
```
That sketch does not yet include the company/floor/project/task/source-agent/destination-agent scoping fields EVENT-01 requires [VERIFIED: .planning/REQUIREMENTS.md:12] — Phase 1 must extend it. The visibility literal union `'PRIVATE' | 'INTERNAL' | 'STREAM_SAFE' | 'PUBLIC'` matches SAFE-01's wording verbatim [VERIFIED: .planning/REQUIREMENTS.md:54]: `"a visibility level (PRIVATE/INTERNAL/STREAM_SAFE/PUBLIC)"`.

**When to use:** This is the only schema pattern for Phase 1 — it directly implements EVENT-01 and Success Criterion 1 (malformed events rejected).

**Example (combining both verified sources above with the required scoping fields; not all four scope IDs apply to every event, so they are optional except `companyId`):**
```typescript
// packages/event-schema/src/envelope.ts
import { z } from "zod";

const VisibilitySchema = z.enum(["PRIVATE", "INTERNAL", "STREAM_SAFE", "PUBLIC"]);

const BaseEnvelope = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),      // D-04: starts at 1, no upcast logic yet
  occurredAt: z.string().datetime(),
  companyId: z.string(),
  floorId: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  sourceAgentId: z.string().optional(),
  destinationAgentId: z.string().optional(),
  visibility: VisibilitySchema,
});

// packages/event-schema/src/payloads/index.ts
// Spread/compose rather than chained .extend() — Zod's own docs flag chained
// .extend() as tsc-quadratically-expensive as a union grows [CITED: Context7 /colinhacks/zod]
export const CompanyEventSchema = z.discriminatedUnion("type", [
  z.object({ ...BaseEnvelope.shape, type: z.literal("company.started"), payload: CompanyStartedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("task.created"), payload: TaskCreatedPayload }),
  z.object({ ...BaseEnvelope.shape, type: z.literal("agent.online"), payload: AgentOnlinePayload }),
  // ...one member per seeded category, see "12 seed events" below
]);

export type CompanyEvent = z.infer<typeof CompanyEventSchema>;
```
`.safeParse(raw)` is the reject-malformed-events entry point Success Criterion 1 requires; `.parse(raw)` throws for call sites that want to fail fast. Both are documented Zod v4 methods [CITED: Context7 /colinhacks/zod].

### Pattern 2: Pure reducer with a dispatch table, folded via `Array.reduce()`

**What:** One root reducer function per CONTEXT.md's discretion grant, keyed by `event.type`, folding an ordered `CompanyEvent[]` into a single projection state object holding all five required projection kinds (agent/floor/team/project/task, per Success Criterion 2).

**When to use:** This is the only reducer pattern Phase 1 needs — Success Criteria 2 and 3 are both direct properties of "pure function over an array."

**Example:**
```typescript
// packages/company-core/src/reducer.ts
import type { CompanyEvent } from "@pixelfirm/event-schema";

export interface ProjectionState {
  agents: Record<string, AgentState>;
  floors: Record<string, FloorState>;
  teams: Record<string, TeamState>;
  projects: Record<string, ProjectState>;
  tasks: Record<string, TaskState>;
}

const handlers: { [K in CompanyEvent["type"]]: (s: ProjectionState, e: Extract<CompanyEvent, { type: K }>) => ProjectionState } = {
  "task.created": (state, e) => ({
    ...state,
    tasks: { ...state.tasks, [e.taskId!]: { status: "created", ...e.payload } },
  }),
  "agent.online": (state, e) => ({
    ...state,
    agents: { ...state.agents, [e.sourceAgentId!]: { ...state.agents[e.sourceAgentId!], status: "idle" } },
  }),
  // ... one handler per seeded event type
};

export function reduce(state: ProjectionState, event: CompanyEvent): ProjectionState {
  const handler = handlers[event.type as CompanyEvent["type"]];
  return handler ? handler(state, event as never) : state; // unknown type → no-op, never throws
}

export function fold(events: CompanyEvent[], initial: ProjectionState = emptyState()): ProjectionState {
  return events.reduce(reduce, initial);
}
```
Returning a **new** object from every handler (never mutating `state` in place) is what makes projections "read-only to downstream consumers" (Success Criterion 2) enforceable without a separate process boundary — a consumer holding a reference to a prior `ProjectionState` can never see it change under them.

### Pattern 3: Proving replay-determinism with a fixture array run twice

**What:** Success Criterion 3 ("replaying the same event sequence from the start reproduces identical projections") is proved directly, not simulated:
```typescript
// packages/company-core/src/reducer.test.ts
import { describe, it, expect } from "vitest";
import { fold } from "./reducer";
import { stubEventSequence } from "./fixtures/stub-events"; // one CompanyEvent per seeded category

describe("replay determinism", () => {
  it("produces identical projections when replayed from the start", () => {
    const first = fold(stubEventSequence);
    const second = fold(stubEventSequence); // fresh initial state, same input array
    expect(second).toEqual(first);
  });
});
```
No special Vitest feature is required beyond `toEqual` deep-equality [CITED: Context7 /vitest-dev/vitest] — the guarantee comes entirely from `reduce`/`fold` being pure functions with no hidden state (no `Date.now()`, no `Math.random()`, no module-level mutable variables) reachable from inside them.

### Anti-Patterns to Avoid

- **Generating IDs or timestamps inside the reducer:** If a handler calls `crypto.randomUUID()` or `Date.now()` while folding, replay is no longer deterministic — Success Criterion 3 fails. All such values must already be on the `CompanyEvent` object before it reaches `fold()`.
- **Mutating the incoming `state` object in a handler:** Breaks "read-only to downstream consumers" (Success Criterion 2) the moment two consumers hold a reference to the same object across a fold call.
- **Building `version`-dispatch/upcast machinery now:** Explicitly forbidden by D-04 — a single `version: 1` field is the full Phase 1 scope; upcasters are designed later, informed by a real breaking payload change.
- **Adding event-ID dedup logic to the reducer:** Explicitly forbidden by D-03 — the reducer assumes ordered, exactly-once input for Phase 1; dedup is Phase 2's ingestion-layer job.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime validation of event shape | A hand-written `if`/`typeof` validator per event type | Zod `discriminatedUnion` + `.safeParse()` | Zod already gives narrowed TS types for free after a successful parse, and rejects unknown discriminator values by construction |
| Event ID generation | A `uuid` npm package | `crypto.randomUUID()` (Node/browser built-in) | No dependency needed for a single UUID call |
| Deep-equality assertion for replay proof | A hand-rolled recursive object comparator | Vitest's `toEqual` | Standard, well-tested, and already the project's mandated test framework |
| Cross-package build ordering/caching | Custom shell scripts calling `tsc` per package in the right order | Turborepo's task graph (`turbo.json`) | Already the project's canonical pin; content-hash caching and dependency-graph ordering come for free from the workspace layout |

**Key insight:** Every "don't hand-roll" item here has a one-line fix using a tool the project already committed to in `STACK.md` — the discipline this phase needs is restraint (don't build dedup, don't build versioning, don't scaffold unused `apps/*`), not new tooling.

## Common Pitfalls

### Pitfall 1: Non-deterministic reducer breaks the replay success criterion
**What goes wrong:** A handler calls `crypto.randomUUID()`, `Date.now()`, or reads a module-level mutable variable while folding an event, so running the same array through `fold()` twice produces two different `ProjectionState` objects.
**Why it happens:** It's tempting to "helpfully" stamp a `lastUpdatedAt: Date.now()` field onto a projection inside the handler, since the reducer already has access to the global clock.
**How to avoid:** Any timestamp a projection needs must come from the event's own `occurredAt` field, never from calling the clock inside the reducer.
**Warning signs:** A test that runs `fold()` twice on the same array and gets a `toEqual` failure only on a timestamp/ID field.

### Pitfall 2: Chained `.extend()` on the envelope becomes expensive as the union grows
**What goes wrong:** Building each of the 12 (soon ~40, per D-01) discriminated-union members by chaining `BaseEnvelope.extend({...}).extend({...})` gets measurably slower to typecheck as more members are added.
**Why it happens:** Zod's own documentation notes `.extend()` chaining is quadratically expensive under a documented TypeScript compiler limitation [CITED: Context7 /colinhacks/zod] — invisible at 12 members, real by the time later phases grow the union toward 40.
**How to avoid:** Use spread syntax (`{ ...BaseEnvelope.shape, type: z.literal(...), payload: X }`) or `z.object({...})` composition instead of `.extend()` chains, exactly as shown in Pattern 1 above.
**Warning signs:** `tsc` getting noticeably slower each time a new event type is added to the union in a later phase.

### Pitfall 3: Confusing "no dedup" (D-03) with "no ordering guarantee"
**What goes wrong:** A future contributor reads D-03 ("no event-ID dedup logic in Phase 1") and assumes the reducer also doesn't need to care about event order — then writes a handler that's order-sensitive in an unsafe way (e.g. assumes `agent.online` always arrives before `task.created` for that agent) without the fixture tests covering out-of-order input, because "dedup isn't required" gets over-read as "delivery guarantees aren't required."
**Why it happens:** D-03's scope is narrowly about *duplicate* events, not event *ordering* — the reducer still assumes an ordered, exactly-once array (that's explicit in D-03's own wording).
**How to avoid:** Keep the fixture test's event array in a realistic causal order per category (e.g. `agent.online` before any event referencing that agent), and treat "ordered" as a real input assumption worth a one-line comment in `reducer.ts`, not an implicit one.
**Warning signs:** A handler that would throw or silently no-op if `state.agents[sourceAgentId]` doesn't exist yet.

### Pitfall 4: TypeScript 7.0's `latest` npm tag silently breaks future lint tooling
**What goes wrong:** Running `pnpm add -D typescript` without a version pin installs `7.0.2` (npm's `latest` dist-tag as of today), and any tool the project adds later that imports the `typescript` package's compiler API programmatically — `typescript-eslint`, `ts-node`, `ts-morph`, `ts-jest`, `typedoc` — breaks, because TypeScript 7.0 does not yet ship that programmatic API (expected in 7.1) [ASSUMED — WebSearch only, not cross-checked against an official TypeScript 7.0 release note in this session].
**Why it happens:** TS 7.0 (codename "Corsa") is a from-scratch Go-native port of the compiler, GA'd 2026-07-08; `tsc` itself works and even carries over 6.x type-checking semantics, but the JS-callable API surface most tooling built around isn't there yet.
**How to avoid:** Pin `typescript@^5.7` explicitly in the root `package.json` for Phase 1's bootstrap (matching the project's own canonical `STACK.md` pin) rather than letting `pnpm add -D typescript` resolve to `latest`.
**Warning signs:** Adding `typescript-eslint` or similar in a later phase and getting an import error trying to load the compiler API from `typescript`.

## Runtime State Inventory

Not applicable — this is a greenfield phase (first code in the repository, no prior state to migrate). Explicitly verified: `.planning/PROJECT.md` and `.planning/phases/01-event-schema-state-engine/01-CONTEXT.md` both state no code exists yet.

## Code Examples

### 12 representative seed events (D-01), one per required category

Per D-01's discretion grant, picked for simplicity and, where possible, taken verbatim from Brief.md's own event vocabulary [VERIFIED: F:/Sidegigs/PixelFirm/Brief.md:456-520 — event names quoted directly from the "Event System" section's example list: `company.started`, `project.created`, `task.created`, `agent.online`, `agent.offline`, `agent.handoff_requested`, `review.started`, `ceo.approval_requested`, `git.commit_created`, `deployment.started`, `viewer.event`]. Two categories — **floor** and **session** — have no corresponding example anywhere in Brief.md's event list, so their event names below are invented and flagged `[ASSUMED]`; confirm the naming during planning or defer to whichever later phase first needs a real floor/session payload.

| Category | Representative `type` | Source |
|----------|------------------------|--------|
| company | `company.started` | [VERIFIED: Brief.md:456] |
| floor | `floor.created` | [ASSUMED — no Brief.md precedent] |
| project | `project.created` | [VERIFIED: Brief.md:458] |
| task | `task.created` | [VERIFIED: Brief.md:464] |
| agent | `agent.online` | [VERIFIED: Brief.md:474] |
| session | `session.started` | [ASSUMED — no Brief.md precedent; Brief.md's Employee/Agent Model section does reference a "current Claude session" concept at Brief.md:357, but not as a named event] |
| handoff | `agent.handoff_requested` | [VERIFIED: Brief.md:482] |
| review | `review.started` | [VERIFIED: Brief.md:486] |
| approval | `ceo.approval_requested` | [VERIFIED: Brief.md:498] |
| git | `git.commit_created` | [VERIFIED: Brief.md:506] |
| deployment | `deployment.started` | [VERIFIED: Brief.md:512] |
| viewer | `viewer.event` | [VERIFIED: Brief.md:518] |

### Validation entry point
```typescript
// Source: pattern per Context7 /colinhacks/zod (discriminatedUnion + safeParse)
const result = CompanyEventSchema.safeParse(rawEvent);
if (!result.success) {
  // Success Criterion 1: malformed events are rejected
  throw new Error(`Invalid event: ${result.error.message}`);
}
const event: CompanyEvent = result.data;
```

### Exhaustiveness check for the dispatch table (catches a forgotten handler at compile time)
```typescript
function assertNever(x: never): never {
  throw new Error(`Unhandled event type: ${JSON.stringify(x)}`);
}
```
Use this as the `default` arm if the reducer is written as a `switch` instead of a lookup table — it turns "forgot to add a handler for a new seeded event type" into a compile error instead of a silent no-op.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVENT-01 | Typed event schema exists for company/floor/project/task/agent/session/handoff/review/approval/git/deployment/viewer events, each carrying event ID, timestamp, company, floor, project, task, source agent, destination agent, payload, and visibility level | Pattern 1 (discriminated-union envelope) directly implements this; envelope field list verified against REQUIREMENTS.md:12 verbatim; 12 seed events table above covers all required categories |
| EVENT-03 | Company State Engine builds materialized projections (agent/floor/team/project/task state) that the renderer, dashboard, and overlay read — never write to directly | Pattern 2 (pure reducer + dispatch table) produces exactly these five projection kinds; "never mutate state in place" anti-pattern note makes read-only enforceable without a process boundary |
| EVENT-04 | State projections can be rebuilt/replayed from the event log without manual patching, so drift is detectable and correctable | Pattern 3 (fold same array twice, assert `toEqual`) is the direct, minimal proof; Pitfall 1 (non-determinism) is the concrete failure mode this criterion guards against |

</phase_requirements>

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TypeScript ^5.7 (this project's `STACK.md` pin, researched earlier today) | TypeScript 7.0.2 is npm's `latest` dist-tag, a from-scratch Go-native compiler port | GA 2026-07-08 [ASSUMED — WebSearch, not cross-checked against an official Microsoft release note this session] | Recommend staying on `^5.7` for this bootstrap — TS 7.0 doesn't yet expose the programmatic compiler API that `typescript-eslint`/`ts-node`/similar tooling needs, and this project's config already has `code_review: true` which will likely want lint tooling later |
| pnpm ^9 (this project's `STACK.md` pin) | pnpm 12.4.2 is npm's `latest` dist-tag | Verified via `npm view pnpm version` today [VERIFIED: npm registry] | Basic `pnpm-workspace.yaml` + `workspace:*` linking is stable across pnpm majors; no specific breaking-change evidence gathered this session — flagged as an assumption to confirm rather than a blocking risk |

**Deprecated/outdated:** None specific to this phase's scope (pure schema + reducer code has no deprecated APIs to avoid).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommend pinning TypeScript to `^5.7` rather than npm's `latest` `7.0.2`, because TS 7.0 doesn't yet ship a programmatic compiler API that future lint/tooling additions will likely need | Standard Stack, State of the Art, Pitfall 4 | If wrong (TS 7.0's compiler-API gap doesn't actually matter for whatever tooling gets added later, or 7.1 ships before it matters), the project unnecessarily delays adopting a ~10x faster compiler; low-cost either way since the pin is a one-line `package.json` change |
| A2 | Recommend a current pnpm major (not the bleeding-edge `12.4.2` `latest`, and not blindly re-pinning STACK.md's `^9`) without having verified specific breaking changes between pnpm 9 and 12 | Standard Stack, State of the Art | If the wrong major is picked, `pnpm-workspace.yaml` syntax or lockfile format could differ enough to need a redo — low-severity since it's caught immediately on first `pnpm install` |
| A3 | `floor.created` and `session.started` are invented event names — no precedent exists anywhere in Brief.md's event vocabulary | Code Examples (12 seed events table) | Low risk per D-01 (additive/renamable later), but if a later phase's GSD/git adapter expects a specific name for these, the seed event needs a rename — reversible |
| A4 | The extended `CompanyEvent` envelope (adding `companyId`/`floorId`/`projectId`/`taskId`/`sourceAgentId`/`destinationAgentId` as mostly-optional fields onto the ARCHITECTURE.md-sketched base interface) is my own design, not verified against any existing code or a more detailed prior spec | Architecture Patterns, Pattern 1 | Low risk — covered by CONTEXT.md's "Claude's Discretion" grant on exact schema structure; if the optionality choices are wrong for a later phase's needs, adjusting field optionality is a non-breaking Zod schema change |
| A5 | The `too-new` verdicts on `zod`/`vitest`/`turbo` from the package-legitimacy checker are very likely false positives driven by recent patch releases rather than real slopsquatting risk | Package Legitimacy Audit | If actually wrong (one of these three names has in fact been compromised via a supply-chain attack on a legitimate maintainer account), skipping a careful checkpoint could let a malicious dependency in — the planner should still gate these behind `checkpoint:human-verify` regardless of this note |

## Open Questions (RESOLVED)

1. **Should `floor` and `session` seed events use different names than `floor.created`/`session.started`?**
   - What we know: no Brief.md precedent exists for either category's event vocabulary.
   - What's unclear: whether a later phase (e.g. the GSD adapter in Phase 3, which maps GSD workflow state onto company events) has an implicit expectation for what a "session" event should be called.
   - Recommendation: proceed with `session.started`/`floor.created` for Phase 1 (reversible per D-01); flag for confirmation if Phase 3 planning surfaces a naming conflict.
   - **RESOLVED:** naming is Claude's Discretion per 01-CONTEXT.md ("Which specific event type is chosen as the 'representative' seed for each of the 12 categories — pick whichever is simplest to stub credibly... consistent with the category-level examples already listed in Brief.md"). No further resolution needed this phase — `session.started`/`floor.created` stands, reversible per D-01, revisit only if Phase 3 surfaces a conflict.

2. **Is pnpm major version 9, 10, 11, or 12 the right pin for this bootstrap?**
   - What we know: STACK.md recommended `^9` earlier today; the registry's current `latest` is `12.4.2`.
   - What's unclear: whether any pnpm major between 9 and 12 introduced a breaking change to `pnpm-workspace.yaml` syntax or the `workspace:*` protocol relevant to this bootstrap.
   - Recommendation: use whatever pnpm major is already available via `corepack` on the machine actually running the install (none was found installed locally this session — see Environment Availability below); if none is pinned, default to the latest stable major and note it in the plan rather than blindly forcing `^9`.
   - **RESOLVED:** operationally settled in 01-01-PLAN.md Task 2 — `corepack enable pnpm` (falling back to `npm install -g pnpm`) resolves whatever pnpm major is actually available, and the resulting `pnpm --version` is pinned into the root `package.json`'s `packageManager` field rather than forcing `^9` blindly. No further research needed; the bootstrap task is the resolution mechanism.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running Vitest, `tsc`, both packages | ✓ | v25.9.0 [VERIFIED: local `node --version`] | — (STACK.md recommends Node 22 LTS for the eventual deployed runtime; this Node is fine for Phase 1's dev/test-only scope) |
| pnpm | D-02's workspace bootstrap | ✗ | — [VERIFIED: local `command -v pnpm` found nothing] | Enable via `corepack enable` (Node 25 ships `corepack`, though `corepack` itself was also not found on `PATH` this session) or `npm install -g pnpm` as a first Phase 1 setup task |
| npm | Registry verification, fallback package installs | ✓ | 11.12.1 [VERIFIED: local `npm --version`] | — |
| git | Version control for the repo | ✓ | 2.55.0.windows.3 [VERIFIED: local `git --version`] | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** pnpm is not currently installed on this machine — the first Phase 1 task must install/enable it (`corepack enable pnpm` or `npm install -g pnpm`) before `pnpm-workspace.yaml` can be exercised.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^5.0` (verified `5.0.1` on npm) — none installed yet, this phase installs it |
| Config file | none yet — Wave 0 creates `vitest.config.ts` (or relies on Vitest's zero-config default for a Node-only package, sufficient here) |
| Quick run command | `pnpm --filter event-schema test` / `pnpm --filter company-core test` |
| Full suite command | `pnpm turbo run test` (runs both packages via the Turborepo task graph) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVENT-01 | Valid event of each of the 12 seeded types passes `.safeParse()`; a malformed event (missing required field, wrong discriminator literal) fails | unit | `pnpm --filter event-schema test -- envelope.test.ts` | ❌ Wave 0 |
| EVENT-03 | Feeding the 12-event fixture sequence into `fold()` produces the expected `ProjectionState` (one entry per touched agent/floor/team/project/task) | unit | `pnpm --filter company-core test -- reducer.test.ts` | ❌ Wave 0 |
| EVENT-04 | `fold(events)` called twice on the identical fixture array produces `toEqual` results | unit | `pnpm --filter company-core test -- reducer.test.ts` | ❌ Wave 0 (same file as EVENT-03, different `it` block) |

### Sampling Rate

- **Per task commit:** `pnpm --filter <package> test`
- **Per wave merge:** `pnpm turbo run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/event-schema/src/envelope.test.ts` — covers EVENT-01
- [ ] `packages/company-core/src/reducer.test.ts` — covers EVENT-03 and EVENT-04
- [ ] `packages/company-core/src/fixtures/stub-events.ts` — shared 12-event fixture array reused by both projection and replay-determinism tests
- [ ] Framework install: `pnpm add -w -D vitest@^5.0 typescript@^5.7 turbo@^2.10` (typescript pinned per Pitfall 4/A1, not left to resolve to npm's `latest`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface exists in this phase (no network, no users) |
| V3 Session Management | no | No sessions exist in this phase |
| V4 Access Control | no | No access boundaries exist in this phase (single in-process library) |
| V5 Input Validation | yes | Zod `discriminatedUnion` + `.safeParse()` at the schema boundary — this phase's entire purpose is exactly this control |
| V6 Cryptography | no | No cryptography performed; `crypto.randomUUID()` is ID generation, not a cryptographic operation requiring a hand-rolled implementation |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malformed or maliciously-crafted event object reaches the reducer and corrupts a projection (e.g. an unexpected `type` value, or extra unexpected keys smuggled into a payload) | Tampering | Zod `discriminatedUnion` rejects any event whose `type` doesn't match a known literal, and each payload schema should be a `z.object()` (not `z.looseObject()`) so unrecognized extra keys are stripped/rejected rather than silently passed through to the reducer |
| An event claims a `sourceAgentId` it doesn't actually control (spoofed attribution) | Spoofing | Out of scope for Phase 1 — there is no transport/auth layer yet to verify *who* produced an event; schema-level validation here only proves an event is *well-formed*, not that its claimed source is authentic. This is Phase 2's per-worker credential responsibility (SEC-02), not Phase 1's. |

## Sources

### Primary (HIGH confidence)
- `npm view zod version` / `time.modified` — 4.6.5, published 2026-09-13
- `npm view typescript version` / `time.modified` — latest dist-tag 7.0.2, published 2026-07-08
- `npm view vitest version` / `time.modified` — 5.0.1, published 2026-09-15
- `npm view turbo version` / `time.modified` — 2.10.13, published 2026-09-17
- `npm view pnpm version` / `time.modified` — latest dist-tag 12.4.2, published 2026-09-15
- `gsd_run query package-legitimacy check --ecosystem npm zod typescript vitest turbo` — live registry-backed verdicts (2026-09-18)
- Local environment probes: `node --version`, `npm --version`, `git --version`, `command -v pnpm`/`corepack` (2026-09-18)
- `.planning/REQUIREMENTS.md:12,54` — EVENT-01 and SAFE-01 wording, quoted verbatim
- `Brief.md:456-520` — Event System example vocabulary, quoted/cited verbatim for the 12 seed events

### Secondary (MEDIUM confidence)
- Context7 `/colinhacks/zod` — `discriminatedUnion`, `.extend()` cost warning, `safeParse`/`parse`
- Context7 `/vitest-dev/vitest` — fixture/`test.extend` patterns, `toEqual` deep-equality assertion
- `.planning/research/ARCHITECTURE.md:137-146` — `CompanyEvent<T>` interface sketch, quoted verbatim (produced this same session by a prior research pass on this project)
- `.planning/research/STACK.md` — canonical Zod/Vitest/Turborepo/pnpm/TypeScript pins for this project
- `.planning/research/PITFALLS.md` §"Pitfall 2" — projection-drift/idempotency guidance behind D-03's carry-forward requirement

### Tertiary (LOW confidence)
- WebSearch: TypeScript 7.0 Go-native compiler breaking changes (multiple dev.to/blog posts, not cross-checked against an official Microsoft TypeScript 7.0 release note in this session) — informs Pitfall 4 and Assumption A1
- WebSearch: pnpm + TypeScript project references monorepo layout conventions (aggregated blog consensus, not an official pnpm/TypeScript doc) — informs the Recommended Project Structure's `tsconfig.json` composite/project-references note

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for version numbers (npm registry, live query) — MEDIUM for the TypeScript-pin recommendation (LOW-confidence WebSearch evidence behind it, flagged as Assumption A1)
- Architecture: MEDIUM — the event-sourcing/reducer pattern reuses this project's own prior, already-committed ARCHITECTURE.md research; the envelope field extension and 12-event seed choices are this session's own reasoned design under CONTEXT.md's discretion grant
- Pitfalls: MEDIUM — Pitfalls 1-3 are logical consequences of "pure function" requirements (high confidence by construction); Pitfall 4 rests on LOW-confidence WebSearch evidence

**Research date:** 2026-09-18
**Valid until:** 7 days for the TypeScript/pnpm version-drift findings (fast-moving, re-verify against the registry before executing if more than a week passes); 30 days for the Zod/Vitest/Turborepo pins and the architecture patterns (stable)

---
*Phase 1 research for: PixelFirm — Event Schema & State Engine*
*Researched: 2026-09-18*
