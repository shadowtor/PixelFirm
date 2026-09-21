# Deferred Items — Phase 05

Out-of-scope discoveries found during 05-01 execution. Not fixed (per Scope
Boundary — only auto-fix issues directly caused by the current task's
changes), logged here for a future plan/session to pick up.

## Pre-existing: `moduleResolution: "node16"/"nodenext"` extension errors when `tsc --noEmit` walks into `event-schema`/`company-core`'s own `index.ts`

`packages/event-schema/src/index.ts` and `packages/company-core/src/index.ts`
re-export from sibling files without explicit `.js` extensions
(e.g. `export { CompanyEventSchema } from "./payloads/index";`). Under the
root `tsconfig.json`'s `moduleResolution: "NodeNext"`, `tsc --noEmit` treats
this as error TS2835 ("Relative import paths need explicit file extensions").

This predates 05-01 — `packages/company-core/src/index.ts`'s three offending
lines were untouched by this plan. It surfaces today whenever `tsc --noEmit`
is run against a package that transitively imports `event-schema`/
`company-core` (confirmed via `pnpm --filter api typecheck`, which was
already failing before this session on this exact issue). It does **not**
block any of 05-01's required `<verify>` commands: `pnpm --filter web
typecheck` uses `apps/web/tsconfig.json`'s `moduleResolution: "bundler"`
(deliberately, per the plan), which doesn't enforce this rule, and
`pnpm --filter pixel-office test` / `pnpm --filter company-core test` /
`pnpm --filter api test` all run via Vitest's esbuild-based transform, which
strips types rather than type-checking.

One new line was added to `event-schema/src/index.ts` in 05-01 following this
exact same pre-existing convention (`export { AgentStatus } from
"./agent-status";`) for consistency with the rest of the file — not a fresh
instance of the problem, the same one.

**Fix, when someone picks this up:** either add explicit `.js` extensions to
every internal re-export in `event-schema/src/index.ts` and
`company-core/src/index.ts` (matches NodeNext's actual requirement), or
switch the root `tsconfig.json` to `moduleResolution: "bundler"` project-wide
(matching what `apps/web` already had to do) if NodeNext's stricter ESM
semantics aren't actually needed anywhere. Either is a several-line diff but
touches files no phase-05 plan currently owns — a deliberate call for
whoever picks it up, not an auto-fix.

## Pre-existing: `packages/orchestration-adapter` has no test files

`pnpm --filter orchestration-adapter test` exits 1 with "No test files
found". Untouched by 05-01 (no file in that package was read or modified this
plan). Flagged here since it surfaced while checking Phase 05 didn't regress
other packages.

## Pre-existing (05-10): two TS18046 errors in `status-mapping.test.ts`

`npx tsc --noEmit -p packages/pixel-office` reports, besides the TS2835
extensionless-import gap already documented above:

```
packages/pixel-office/src/status/status-mapping.test.ts(48,16): error TS18046: 'visual' is of type 'unknown'.
packages/pixel-office/src/status/status-mapping.test.ts(50,16): error TS18046: 'visual' is of type 'unknown'.
```

`Object.entries(STATUS_MAP)` widens the value to `unknown` under this
tsconfig. Introduced by 05-02 (`39fc0b0`) and untouched by 05-10 — no file
under `src/status/` was modified by this plan. Filtering out TS2835, 05-10
introduced zero new type errors. Fix when someone touches that file: annotate
the loop (`for (const [status, visual] of Object.entries(STATUS_MAP) as
Array<[AgentStatus, StatusVisual]>)`) rather than loosening the tsconfig.

## Accepted ceilings (05-10), flagged in-code

Both are working code with a documented limit, not stubs. `ponytail:` comments
at each site name the ceiling and the upgrade path.

| Ceiling | Site | Upgrade path |
|---|---|---|
| Twelve identity hue buckets — two agents collide on a colour past 12 seated | `packages/pixel-office/src/index.ts` (`hueForAgentId`) | On-canvas name labels; 05-UI-SPEC.md's Typography section already reserves the monospace/11px scale |
| 54 desks on the default 20x11 grid (rows 3/6/9 x 18 cols, down from 162); overflow stacks on the last valid row | `packages/pixel-office/src/index.ts` (`nextDeskPosition`) | A larger grid or a scrolling camera |

The desk-count reduction is the direct cost of the row pitch CR-02 required —
a glyph only clears the sprite box of the desk row behind it at pitch >= 3.
