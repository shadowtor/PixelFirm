# Phase 1: Event Schema & State Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 1-Event Schema & State Engine
**Areas discussed:** Event catalog scope, Monorepo bootstrap scope, Idempotency / replay-dedup handling, Schema versioning mechanism

---

## Event catalog scope

Advisor research (gsd-advisor-researcher) compared building Zod schemas for the full ~40-type catalog Brief.md lists now vs. an envelope + seeded discriminated union (one representative event per required category) extended incrementally.

| Option | Description | Selected |
|--------|-------------|----------|
| Envelope + seeded union (12 categories) | Full envelope now; one representative event per category; concrete types added incrementally by later phases | ✓ |
| Full ~40-type catalog now | Zod schema for every event type listed in Brief.md, guessing payload shapes for unbuilt adapters | |

**User's choice:** Envelope + seeded union (recommended option).
**Notes:** Building all 40 now means guessing payload shapes (e.g. `git.pr_merged`, Twitch `viewer.event`) for adapters that don't exist until Phase 3+; a wrong guess is dead weight until revisited.

---

## Monorepo bootstrap scope

Advisor research compared scaffolding the entire `apps/*`/`packages/*` layout now vs. bootstrapping only the workspace root config plus the two packages Phase 1 actually needs.

| Option | Description | Selected |
|--------|-------------|----------|
| Root config + 2 packages only | pnpm-workspace.yaml, turbo.json, root tsconfig, packages/event-schema, packages/company-core | ✓ |
| Full skeleton now | All apps/* and packages/* scaffolded as stub directories with placeholder configs | |

**User's choice:** Root config + 2 packages only (recommended option).
**Notes:** pnpm/Turborepo require real package.json files to register a workspace member — "stubs" would mean fabricating 8+ fake packages that get rewritten once each phase defines its actual requirements.

---

## Idempotency / replay-dedup handling

Advisor research compared building event-ID dedup into the Phase 1 reducer now vs. keeping it a pure reduction engine and deferring dedup to the phase that introduces real at-least-once delivery.

| Option | Description | Selected |
|--------|-------------|----------|
| Pure reducer, defer dedup | Assume ordered, exactly-once input in Phase 1; dedup becomes an explicit Phase 2 (Control Plane / Postgres log) requirement | ✓ |
| Build dedup into the reducer now | Reducer tracks seen event IDs and skips repeats despite no duplicate-producing transport existing yet | |

**User's choice:** Pure reducer, defer dedup (recommended option).
**Notes:** Standard event-sourcing practice places dedup responsibility at the ingestion/transport boundary, which only exists from Phase 2 onward. Flagged as a carry-forward requirement so PITFALLS.md's warning isn't silently dropped — Phase 2 discussion/planning must include it explicitly.

---

## Schema versioning mechanism

Advisor research compared building upcast/version-dispatch machinery now vs. carrying a `version: 1` field with no migration logic until a real breaking change exists.

| Option | Description | Selected |
|--------|-------------|----------|
| Carry version:1, no upcast logic | Every event gets a version field; no dispatch/upcast layer until a real breaking change occurs | ✓ |
| Build upcast/dispatch machinery now | Per-type upcaster registry and version-dispatch designed against a hypothetical future change | |

**User's choice:** Carry version:1, no upcast logic (recommended option).
**Notes:** No second version of any event type exists yet, so upcast machinery now would be designed against a guess. The `version` field itself is the only retrofit-expensive part, and it's already included.

---

## Claude's Discretion

- Zod schema module layout within `packages/event-schema`
- Which specific event is chosen as the representative seed for each of the 12 categories
- Internal reducer/projection table shape
- Test fixture design for proving replay-determinism (Vitest, per STACK.md)

## Deferred Ideas

None — discussion stayed within phase scope.
