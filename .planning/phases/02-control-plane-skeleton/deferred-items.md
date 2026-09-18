# Deferred Items — Phase 02

Out-of-scope discoveries found during execution, not fixed (per executor scope boundary).

## 02-01

- `packages/event-schema/src/index.ts` fails `tsc --noEmit` under the root
  `tsconfig.json`'s `moduleResolution: "NodeNext"` (relative imports lack
  explicit `.js` extensions, e.g. `./payloads/index` should be
  `./payloads/index.js`). Pre-existing from Phase 1 — that package never had
  a `typecheck` script before `apps/api`'s Task 1 added the workspace's first
  one, so this was never previously exercised. `apps/api`'s own files are
  fixed to use explicit extensions; `packages/event-schema` (and likely
  `packages/company-core`) are unchanged and out of this plan's scope.
