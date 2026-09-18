# Phase 1: Event Schema & State Engine - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** 12 (bootstrap + package files)
**Analogs found:** 0 / 12

## No Existing Codebase — Explicit Statement

This is Phase 1 of a brand-new project. Verified via `git ls-files`: the only tracked files in the repository are `.planning/**`, `Brief.md`, `README.md`, and `.claude/CLAUDE.md`. There is no `src/`, `packages/`, `apps/`, or any prior TypeScript/JavaScript code. **There are no reusable code analogs anywhere in this repository for any file this phase creates.** Fabricating an analog would mislead the planner; none is provided below.

Per RESEARCH.md's own `<code_context>` section: "No code exists yet — this is the first phase and the first code written in the repository. Only planning docs (`.planning/`), `Brief.md`, and `README.md` exist."

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|-----------------|---------------|
| `pnpm-workspace.yaml` | config | — | none | no analog |
| `turbo.json` | config | — | none | no analog |
| `tsconfig.json` (root) | config | — | none | no analog |
| `packages/event-schema/package.json` | config | — | none | no analog |
| `packages/event-schema/tsconfig.json` | config | — | none | no analog |
| `packages/event-schema/src/envelope.ts` | model | transform (validation) | none | no analog |
| `packages/event-schema/src/payloads/*.ts` | model | transform (validation) | none | no analog |
| `packages/event-schema/src/index.ts` | utility (barrel export) | — | none | no analog |
| `packages/company-core/package.json` | config | — | none | no analog |
| `packages/company-core/src/projections.ts` | model | CRUD (in-memory) | none | no analog |
| `packages/company-core/src/reducer.ts` | service | event-driven / transform | none | no analog |
| `packages/company-core/src/fixtures/stub-events.ts` | test (fixture) | — | none | no analog |
| `packages/company-core/src/reducer.test.ts` | test | event-driven | none | no analog |
| `packages/event-schema/src/envelope.test.ts` | test | transform | none | no analog |

## Pattern Assignments

None — no analog files exist to extract excerpts from. Do not invent placeholder patterns.

**Planner should instead build every file in this phase directly from `01-RESEARCH.md`**, which already contains concrete, ready-to-use code for each file:

- `packages/event-schema/src/envelope.ts` — full `BaseEnvelope`/`VisibilitySchema` Zod code: RESEARCH.md "Pattern 1", lines showing `BaseEnvelope` and `VisibilitySchema`.
- `packages/event-schema/src/payloads/index.ts` — `CompanyEventSchema = z.discriminatedUnion(...)` composition example: RESEARCH.md "Pattern 1".
- `packages/company-core/src/reducer.ts` — `ProjectionState` interface, `handlers` dispatch table, `reduce()`/`fold()` functions: RESEARCH.md "Pattern 2".
- `packages/company-core/src/reducer.test.ts` — replay-determinism test shape (`fold` called twice, `toEqual`): RESEARCH.md "Pattern 3".
- 12 seed event `type` names and their category mapping: RESEARCH.md "Code Examples > 12 representative seed events" table.
- Validation entry point (`safeParse` + reject-malformed pattern): RESEARCH.md "Validation entry point" code block.
- Exhaustiveness-check helper (`assertNever`): RESEARCH.md "Code Examples" — use if reducer is written as a switch instead of a lookup table.

## Shared Patterns

None extracted from codebase (none exists). Cross-cutting concerns to apply, per RESEARCH.md, sourced from research rather than code:

### Purity discipline (applies to `reducer.ts` and every handler)
No `Date.now()`, `crypto.randomUUID()`, `Math.random()`, or module-level mutable state inside any reducer handler — all such values must already be on the `CompanyEvent` object before `fold()` runs. Source: RESEARCH.md "Anti-Patterns to Avoid" / "Pitfall 1".

### Immutable state updates (applies to every reducer handler)
Every handler returns a **new** object (spread, never mutate `state` in place) — this is what makes projections read-only to downstream consumers. Source: RESEARCH.md "Pattern 2" note below the code block.

### Schema composition via spread, not `.extend()` chains (applies to all files in `packages/event-schema/src/payloads/`)
Use `{ ...BaseEnvelope.shape, type: z.literal(...), payload: X }` — chained `.extend()` is documented as quadratically expensive to typecheck as the union grows. Source: RESEARCH.md "Pitfall 2".

## No Analog Found

All 12+ files listed above have no analog — this is expected and correct for a Phase 1 greenfield bootstrap. Planner should treat `01-RESEARCH.md`'s "Architecture Patterns" and "Code Examples" sections as the primary reference source instead of codebase analogs.

## Metadata

**Analog search scope:** Entire repository (`git ls-files`), confirmed no `src/`/`packages/`/`apps/` directories tracked.
**Files scanned:** All tracked files (4 total: `.planning/**`, `Brief.md`, `README.md`, `.claude/CLAUDE.md`) — none are code analogs.
**Pattern extraction date:** 2026-09-18
