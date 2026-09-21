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

## Accepted threat `T-05-11-WR01` — a worker credential can author state for any agent, company and visibility

**Threat id:** `T-05-11-WR01` · **Category:** Spoofing / Elevation of Privilege ·
**Severity:** high · **Disposition:** accepted for Phase 5.

`apps/api/src/routes/events.ts` takes `sourceAgentId`, `companyId` and
`visibility` **verbatim from the request body** and inserts them as written.
`authenticateWorker` proves only that the bearer is a valid, non-revoked
worker credential — it never checks that the credential is entitled to author
for the subject it names. Only the heartbeat path keys on the authenticated
`request.workerId`; every other field describing *who* and *which company* the
event is about is caller-supplied. A single leaked worker token can therefore
attribute work to any agent, plant events in any company, and stamp any
visibility level — including marking `PRIVATE` material `STREAM_SAFE`.

**Why it is accepted here rather than fixed.** The fix is *subject*
authorization, not *event-type* authorization. Event-type authorization is
already in place (`WORKER_ALLOWED_EVENT_TYPES`) and is a different control.
Subject authorization requires the `workers` table to carry agent and company
columns so an incoming event's subject can be checked against the credential's
own entitlement — a schema change whose consumers are Phase 6's CEO dashboard
(which needs per-agent attribution it can trust) and Phase 7's visibility
filtering (which needs `visibility` to be an authority-assigned label, not a
client-supplied one). Both phases own the authorization model this slots into;
building half of it here would produce a column no consumer reads and an
entitlement check with no model behind it.

**Blast radius, stated honestly.** 05-05 widened `WORKER_ALLOWED_EVENT_TYPES`
from three types to seven, which widened the set of state a compromised
credential can forge. Nothing in Phase 5 narrows the *subject* — this round
included. The only thing bounding real-world exposure is T-05-03's already
accepted premise that the control plane is INTERNAL-tier only and is not
exposed publicly.

**Acceptance expiry:** this acceptance expires the first moment any
non-INTERNAL consumer is pointed at this control plane — a public/stream
viewer, a third-party integration, or any deployment reachable outside the
operator's own machine. At that moment this stops being an accepted threat and
becomes a release blocker.

**Fix, when someone picks this up:** add `agentId`/`companyId` columns to the
`workers` table, populate them at credential issue time, and reject at
`POST /events` any event whose `sourceAgentId`/`companyId` does not match the
authenticated credential's entitlement; derive `visibility` server-side from
the credential's tier rather than trusting the body. Phase 6/7 scope.

## `agent.handoff_completed` has no in-repo producer after 05-11

Plan 05-11 Task 1 removed the role-change poll's simulated handoff pair. The
poll fired whenever `observeGsdState` reported a different GSD *workflow role*
and passed that role label ("Engineering", "QA") as `toAgentId`; the private
completion helper then wrote the label into `record.agentId`, so a role name
became `sourceAgentId` on every later event in an append-only table with no
UPDATE path (CR-04). It also meant the office animated a handoff between two
agents whenever a workflow role changed — a fabricated animation, the exact
thing this phase's goal forbids. A workflow role change is an observation
about the workflow, not a handoff to an agent named after the role, so the
poll now emits `gsd.phase_observed` (which the reducer already consumes to
refine the real agent's status) and nothing else.

**What that leaves:** `agent.handoff_completed` — and in practice
`agent.handoff_requested` too — has no *automatic* producer anywhere in the
repo. This was a user decision taken at 05-11's `checkpoint:decision`
(option `delete-trigger`), recorded against 05-CONTEXT.md **D-04**, with this
consequence stated before it was accepted.

**What stays intact:** the schema members in `packages/event-schema`, the
reducer handlers in `packages/company-core`, the D-04 walk-to-desk
choreography FSM, the browser relay, and the public
`requestHandoff(taskId, toAgentId)` member of the `AgentRuntime` interface.
`requestHandoff` was never the defect — it refuses to fabricate a
`fromAgentId` and is correct whenever its caller supplies a real receiving
agent id. HANDOFF-01 therefore lands in Phase 5 as its **rendering half**: a
real handoff pair riding the live relay drives reducer → character upsert →
choreography → canvas, end to end. The production *trigger* is what is
deferred.

**Carried forward unmet, deliberately.** 05-VERIFICATION.md asks for "an
end-to-end check that drives ClaudeCodeRuntime's own emission path rather than
hand-posted synthetic events." After this fix that check is **not satisfiable**
for handoffs: there is no legitimate ClaudeCodeRuntime handoff emission path
left to drive, because the only one that existed was the fabrication being
removed. Manufacturing one so the check could pass would be precisely the
fabrication the Core Value forbids. The ask is not dropped — it is answered
with "the thing it asked to exercise should not exist yet." Note the same
verification file's own `missing` list already proposed this exact resolution:
"stop emitting handoff events for role changes and emit `gsd.phase_observed`
instead."

**Fix, when someone picks this up:** a real trigger needs either a
role-to-agent registry that resolves an observed GSD role to an actual agent
id, or genuine multi-agent orchestration where a second agent exists to
receive control. Both are Phase 6 scope. Restoring an automatic trigger is
therefore building that registry, not reverting a line.

## Office capacity and identity-hue ceilings (deliberate, from 05-10)

Recorded here as a scoped deferral so a future reader meets both limits in the
deferral record rather than only in an in-code comment: the default 20x11 grid
seats **54 desks** (not 162), because a desk row pitch of 3 is the smallest
that gives a status glyph clearance over the desk row behind it; and per-agent
identity uses **12 evenly spaced hue buckets**, so colour collisions begin at
the thirteenth seated agent. Upgrade paths: a larger grid or a scrolling
camera for capacity, and on-canvas name labels for identity —
`05-UI-SPEC.md`'s Typography section already reserves the monospace 11px scale
for exactly that. Both sites carry `ponytail:` comments naming the ceiling;
see the "Accepted ceilings (05-10)" table above for the exact call sites.
