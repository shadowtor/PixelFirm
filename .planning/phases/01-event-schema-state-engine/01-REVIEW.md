---
phase: 01-event-schema-state-engine
reviewed: 2026-09-18T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - .gitignore
  - package.json
  - packages/company-core/package.json
  - packages/company-core/src/fixtures/stub-events.ts
  - packages/company-core/src/index.ts
  - packages/company-core/src/projections.ts
  - packages/company-core/src/reducer.test.ts
  - packages/company-core/src/reducer.ts
  - packages/company-core/tsconfig.json
  - packages/event-schema/package.json
  - packages/event-schema/src/envelope.test.ts
  - packages/event-schema/src/envelope.ts
  - packages/event-schema/src/index.ts
  - packages/event-schema/src/payloads/index.ts
  - packages/event-schema/tsconfig.json
  - pnpm-workspace.yaml
  - tsconfig.json
  - turbo.json
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the event-schema (zod discriminated union + envelope) and company-core (reducer/projection) packages that make up the Phase 1 event schema + state engine. The schema and reducer are well-organized and the 12-event fixture plus tests are internally consistent — every test in the current suite should pass because the fixture always supplies every envelope-level correlation id the reducer needs.

The core problem is a real gap between what `CompanyEventSchema` actually validates and what `reducer.ts` assumes is present. `BaseEnvelope` makes `floorId`, `projectId`, `taskId`, and `sourceAgentId` optional **for every event type**, including the types whose reducer handlers require them. Those handlers then use non-null assertions (`event.floorId!`, `event.projectId!`, `event.taskId!`, `event.sourceAgentId!`) instead of guards. A schema-valid `floor.created`/`project.created`/`task.created`/`agent.online` event that omits its correlation id will pass `CompanyEventSchema.safeParse` and then silently corrupt the projection by writing a record keyed by the literal string `"undefined"` with `id: undefined` — violating the `FloorState`/`ProjectState`/`TaskState`/`AgentState` interfaces at runtime with no error raised. This is untested (the fixture never omits these fields) and is the single Critical finding below; everything else is a Warning/Info-level maintainability or coverage note.

## Critical Issues

### CR-01: Unsafe non-null assertions on optional envelope fields corrupt projection state

**File:** `packages/company-core/src/reducer.ts:26,34,42,53,62-68`
**Issue:**
`BaseEnvelope` (`packages/event-schema/src/envelope.ts:13-17`) declares `floorId`, `projectId`, `taskId`, and `sourceAgentId` as `.optional()` for **every** discriminated-union member, including `floor.created`, `project.created`, `task.created`, and `agent.online` — the very types whose reducer handlers treat these fields as required:

```ts
// reducer.ts
"floor.created": (state, event) => ({
  ...state,
  floors: {
    ...state.floors,
    [event.floorId!]: { id: event.floorId!, name: event.payload.name },   // line 26
  },
}),
"project.created": (state, event) => ({ ... [event.projectId!]: { id: event.projectId!, ... } }), // line 34
"task.created": (state, event) => ({ ... [event.taskId!]: { id: event.taskId!, ... } }),           // line 42
"agent.online": (state, event) => ({ ... [event.sourceAgentId!]: { id: event.sourceAgentId!, ... } }), // line 53
```

Because `CompanyEventSchema.safeParse` will happily accept a `floor.created` event with no `floorId` (it's optional at the schema level, regardless of `type`), a producer bug or malformed payload from upstream passes validation and then reaches the reducer, where `event.floorId!` is `undefined` at runtime. The computed property key `[event.floorId!]` coerces to the string `"undefined"`, so the projection silently gains an entry `state.floors["undefined"] = { id: undefined, name: "..." }` — violating `FloorState.id: string` with no exception thrown, no log, and no way for a caller to detect the corruption. The same pattern applies to `project.created`, `task.created`, and `agent.online`.

`session.started` (lines 62-68) has the same root cause but a different symptom: `event.sourceAgentId!` used as a lookup key (`state.agents[event.sourceAgentId!]`) simply misses and the handler no-ops, silently dropping a legitimate-looking event instead of corrupting state — still incorrect, just a different failure mode of the same unenforced contract.

Note the file already contains the correct defensive pattern for this exact problem in `git.commit_created` and `deployment.started`:
```ts
"deployment.started": (state, event) => {
  const projectId = event.projectId;
  const existing = projectId ? state.projects[projectId] : undefined;
  if (!projectId || !existing) return state;
  ...
```
That guard-and-no-op pattern is not applied consistently to `floor.created`/`project.created`/`task.created`/`agent.online`/`session.started`.

**Fix:** Apply the same guard pattern used in `git.commit_created`/`deployment.started` to the remaining handlers, e.g.:
```ts
"floor.created": (state, event) => {
  const floorId = event.floorId;
  if (!floorId) return state;
  return {
    ...state,
    floors: { ...state.floors, [floorId]: { id: floorId, name: event.payload.name } },
  };
},
```
Repeat for `project.created` (`projectId`), `task.created` (`taskId`), `agent.online` and `session.started` (`sourceAgentId`). Longer-term, consider moving these correlation ids into each variant's payload (like `review.started`'s `payload.taskId`) so zod can enforce them as required per-type instead of relying on a single optional field shared across the whole union.

## Warnings

### WR-01: Inconsistent required-field handling across reducer handlers

**File:** `packages/company-core/src/reducer.ts:22-59` vs `107-125`
**Issue:** Some handlers (`git.commit_created`, `deployment.started`) defensively check for a missing correlation id and no-op; others (`floor.created`, `project.created`, `task.created`, `agent.online`) assert non-null and proceed unconditionally (see CR-01). As the event catalog grows toward ~40 types (per the D-01 comment in this file), this inconsistency will keep reappearing for each new handler unless a shared convention is established.
**Fix:** Once CR-01 is fixed, document the convention ("every handler must guard on optional envelope ids before indexing") in a comment at the top of the handlers table, or extract a small `withRequired(id, fn)` helper so every future handler uses the same pattern by construction.

### WR-02: Envelope-level "required-per-type" fields have no test coverage

**File:** `packages/event-schema/src/envelope.test.ts` (whole file)
**Issue:** The parametrized test table (`cases`, lines 60-127) only exercises omission of `requiredPayloadKey` — a field inside `payload`. It never tests omitting the envelope-level ids (`floorId`, `projectId`, `taskId`, `sourceAgentId`) that `extra` supplies for each case, so `CompanyEventSchema.safeParse` accepting a `floor.created` event with no `floorId` (the root cause of CR-01) is completely unverified by the current suite.
**Fix:** Add a case (or a parallel loop) asserting that, for types where an id in `extra` is semantically required (e.g. `floorId` for `floor.created`), the schema currently *does* accept the event without it — either turn that into a real rejection once CR-01 is fixed at the schema level, or add a reducer-level test proving the handler no-ops safely when the id is missing.

### WR-03: Root tsconfig omits `noUncheckedIndexedAccess`, hiding this class of bug from the compiler

**File:** `tsconfig.json:1-9`
**Issue:** `strict: true` is set, but without `noUncheckedIndexedAccess`, `Record<string, T>` lookups like `state.tasks[taskId]` are typed as `T`, not `T | undefined`. Combined with the `event.floorId!` assertions in CR-01, there is no compiler signal anywhere in this path that these values can be `undefined` at runtime — every existing guard in the file (`if (!existing) return state`) was added by hand, not enforced by the type system.
**Fix:** Add `"noUncheckedIndexedAccess": true` to the shared `compilerOptions`. This will force explicit handling at every `Record` index-access site across both packages and make regressions like CR-01 fail to compile rather than fail silently at runtime.

## Info

### IN-01: `destinationAgentId` is defined but never used

**File:** `packages/event-schema/src/envelope.ts:17`
**Issue:** `destinationAgentId: z.string().optional()` is declared on `BaseEnvelope` but is not referenced by any payload schema, any reducer handler, or the 12-event fixture.
**Fix:** If it's scaffolding for a later phase, add a one-line comment saying so (matching the style of the other inline rationale comments in this file); otherwise remove it until an event type actually needs it.

### IN-02: Redundant type assertion in `reduce`

**File:** `packages/company-core/src/reducer.ts:136`
**Issue:** `handlers[event.type as CompanyEvent["type"]]` — `event` is already typed `CompanyEvent`, so `event.type` is already `CompanyEvent["type"]`; the cast is a no-op.
**Fix:** `handlers[event.type]`.

### IN-03: Redundant type assertion in test fixture

**File:** `packages/company-core/src/reducer.test.ts:15`
**Issue:** `} as CompanyEvent;` at the end of `companyStartedEvent()` is redundant — the function's own return type annotation (`function companyStartedEvent(): CompanyEvent`) already gives the object literal contextual typing.
**Fix:** Drop the trailing `as CompanyEvent` cast.

### IN-04: Deprecated zod chained validators

**File:** `packages/event-schema/src/envelope.ts:9,11`
**Issue:** `z.string().uuid()` and `z.string().datetime()` are deprecated in the installed zod version (`zod@4.6.5`) in favor of the top-level `z.uuid()` and `z.iso.datetime()`. They still work today, but are flagged for eventual removal upstream.
**Fix:** Migrate to `z.uuid()` / `z.iso.datetime()` when convenient; not urgent for Phase 1.

### IN-05: No root-level `test` script

**File:** `package.json:1-10`
**Issue:** The root `package.json` has no `"scripts": { "test": "turbo run test" }`, so the conventional `pnpm test` / `npm test` entry point doesn't work from the repo root — a contributor has to already know to run `turbo run test` (or `pnpm -w turbo run test`) directly.
**Fix:** Add `"scripts": { "test": "turbo run test" }` to the root `package.json` for discoverability.

---

_Reviewed: 2026-09-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
