# Deferred Items — Phase 04

Out-of-scope discoveries logged during plan execution (SCOPE BOUNDARY — not
fixed, not caused by the executing plan's changes).

## 04-02

- `orchestration-adapter#test` fails with "No test files found, exiting with
  code 1" when run via `npx turbo run test` — pre-existing: the package has
  zero `*.test.ts` files by design (it's a pure-type contract package,
  verified via `pnpm --filter orchestration-adapter typecheck`, not vitest).
  Not caused by this plan (no orchestration-adapter files touched). Turbo's
  `test` task treats vitest's "no test files" exit code 1 as a task failure;
  worth either adding a trivial typecheck-only smoke test or excluding this
  package from turbo's `test` task in a future plan.
- `api#test` fails locally (5 of 7 test files) with `TypeError: Cannot read
  properties of undefined (reading '$client')` / `'close'` in
  `afterAll` hooks — consistent with STATE.md's existing flagged blocker
  ("apps/api's test suite has an intermittent parallel-test-file migration
  race... against the local test Postgres"), i.e. the test Postgres
  container was not running/reachable during this session's full-suite
  check. Not caused by this plan (no apps/api files touched). Pre-existing,
  already tracked in STATE.md Blockers/Concerns.

## 04-04

- `pnpm --filter claude-adapter typecheck` fails with 3 `TS2835` errors
  inside `packages/event-schema/src/index.ts` ("Relative import paths need
  explicit file extensions...") once this plan's integration test imports
  `event-schema` for the first time from `claude-adapter`. Confirmed
  pre-existing and not caused by this plan: `pnpm --filter worker typecheck`
  (an existing, unmodified consumer of `event-schema`) fails with the
  identical 3 errors against the same file. `event-schema/src/index.ts`'s
  own relative imports (`./payloads/index`, `./envelope`) are missing `.js`
  extensions required by this monorepo's `moduleResolution: "nodenext"`.
  Vitest (esbuild-based, not tsc) does not enforce this, so
  `test:integration`'s actual run was unaffected — the real
  `CLAUDE_CODE_INTEGRATION_TEST=1 pnpm --filter claude-adapter run
  test:integration` verify command passed. Worth fixing
  `event-schema/src/index.ts`'s own import extensions in a future plan.
