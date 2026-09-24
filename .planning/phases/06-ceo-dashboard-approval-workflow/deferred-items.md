# Phase 06 deferred items

- **(found in 06-06, pre-existing)** `npx tsc -p packages/company-core --noEmit` reports 3 TS2345 errors in `packages/company-core/src/reducer.test.ts` (lines ~258, 348, 360): `phaseObservedEvent()`-style spreads typed as the `company.started` member. Test-only typing, vitest runs green; company-core has no typecheck script, so no gate catches it. Not touched by 06-06.
