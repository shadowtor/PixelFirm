---
phase: 05-pixel-office-renderer
plan: 11
subsystem: api
tags: [claude-agent-sdk, gsd-adapter, company-core, websocket, fastify, vitest, event-sourcing]

requires:
  - phase: 05-05
    provides: "the completeHandoff ownership reassignment (CR-04's write path) and the post-snapshot socket registration (CR-03's drop window) this plan removes"
  - phase: 05-08
    provides: "the role-change poll call site inside runQuery"
  - phase: 03-worker-git-adapter-gsd-adapter
    provides: "observeGsdState and apps/worker/src/poll-loop.ts's gsd.phase_observed envelope — the analog this plan copies"
provides:
  - "The ClaudeCodeRuntime role poll emits gsd.phase_observed instead of a fabricated handoff pair; a GSD role label can no longer reach a field typed as an agent id"
  - "The module-private handoff-completion helper (record.agentId = toAgentId) is deleted — CR-04 closed at its source"
  - "browser-connections is a buffer-then-promote registry: flushBrowserSocket(socket) is a new export"
  - "/ws/browser registers before its snapshot SELECT and flushes after the send — CR-03's silent drop window closed with the snapshot-first guarantee intact"
  - "T-05-11-WR01 recorded as a named, severity-rated, expiry-bounded accepted threat"
affects: [06-multi-agent-orchestration, 07-visibility-filtering, verify-phase-05]

actuals:
  tokens: 9577
  tasks: 3
  commits: 6
plan_head_before: 0e368b3e1e2d756c094484b4c64c7964e1cf7bd4

tech-stack:
  added: []
  patterns:
    - "Observation-not-assertion: a workflow observation is emitted as the observation it is (gsd.phase_observed) and refined by the reducer, never re-cast as a domain event about agents"
    - "Buffer-then-promote socket registration: register before the awaited baseline query, queue, then flush once the baseline is sent"

key-files:
  created:
    - apps/api/src/ws/browser-connections.test.ts
  modified:
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - packages/claude-adapter/package.json
    - apps/api/src/ws/browser-connections.ts
    - apps/api/src/routes/ws-browser.ts
    - apps/api/src/routes/ws-browser.test.ts
    - .planning/phases/05-pixel-office-renderer/deferred-items.md

key-decisions:
  - "D-04 checkpoint answered `delete-trigger` by the user: the role poll's simulated handoff trigger is deleted. D-04's walk-to-desk choreography stays built, tested and live-wired, but no in-repo trigger emits a handoff pair until Phase 6 — HANDOFF-01 lands as its rendering half this phase."
  - "active: true on the runtime's gsd.phase_observed is honest on a stronger basis than poll-loop.ts's — the poll only exists inside runQuery, for the lifetime of an in-flight stream."
  - "requestHandoff kept exactly as-is: it was never the defect, and it is a required AgentRuntime interface member."
  - "The error path in /ws/browser unregisters and closes rather than flushing — a client with no baseline must never receive live events."
  - "requirements-completed deliberately left empty: this plan's Task 3 forbids editing requirement statuses, which flip only when verify-phase says so."

patterns-established:
  - "A GSD workflow role is never an agent identity: role observations flow through gsd.phase_observed and the reducer's status refinement, never through an agent-id-typed field"
  - "Connect-time registries buffer across their own baseline window instead of deferring registration past it"

requirements-completed: []
requirements-touched: [OFFICE-01, HANDOFF-01, HANDOFF-02]

coverage:
  - id: D1
    description: "A GSD role change across two poll ticks posts exactly one gsd.phase_observed carrying that observation's phase/status/category/role, and neither handoff half"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 1: a role change across two poll ticks posts exactly one gsd.phase_observed carrying that observation"
        status: pass
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 2: the role poll posts no handoff event of either half"
        status: pass
    human_judgment: false
  - id: D2
    description: "CR-04 closed: no code path writes a GSD role label where an agent id belongs, so later events still attribute to the real startTask agent and the reducer creates no phantom role-named agent"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 3 (CR-04): a role change leaves the task's owning agent id untouched"
        status: pass
      - kind: integration
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test 6: the emitted envelope, reduced by company-core, refines the REAL agent's status and creates no role-named agent"
        status: pass
      - kind: other
        ref: "grep -v '^[[:space:]]*//' packages/claude-adapter/src/claude-code-runtime.ts | grep -c 'completeHandoff' == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "CR-03 closed: an event broadcast while the /ws/browser snapshot SELECT is in flight is delivered after the snapshot rather than lost for the connection's lifetime"
    requirement: "HANDOFF-02"
    verification:
      - kind: unit
        ref: "apps/api/src/ws/browser-connections.test.ts#Test 2 (CR-03 regression): an event broadcast during the snapshot window is delivered after the snapshot, in order"
        status: pass
      - kind: integration
        ref: "apps/api/src/routes/ws-browser.test.ts#CR-03: an event posted while the connect handler is still building its snapshot is delivered AFTER the snapshot, never dropped"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-01 is an explicitly named, severity-rated, expiry-bounded accepted threat (T-05-11-WR01) in deferred-items.md rather than an implied one"
    verification:
      - kind: other
        ref: "grep -c 'T-05-11-WR01' .planning/phases/05-pixel-office-renderer/deferred-items.md != 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "HANDOFF-01's production trigger is a recorded scope boundary, not a gap: no in-repo producer of agent.handoff_completed remains, and the rendering half is what Phase 5 delivers"
    requirement: "HANDOFF-01"
    verification:
      - kind: other
        ref: "grep -c 'agent.handoff_completed' .planning/phases/05-pixel-office-renderer/deferred-items.md != 0"
        status: pass
    human_judgment: true
    rationale: "Whether the rendering half satisfies HANDOFF-01 at the scope the user accepted at the D-04 checkpoint is a scoring judgment for verify-phase, not something a test can assert. 05-12 is what proves the choreography end-to-end on a real canvas."

duration: 16 min
completed: 2026-09-21
status: complete
---

# Phase 5 Plan 11: Honest Role Observation and a Buffered Browser Socket Summary

**The ClaudeCodeRuntime role poll now emits `gsd.phase_observed` instead of fabricating a handoff to a role-named agent (CR-04), and `/ws/browser` registers-then-buffers across its snapshot SELECT so events committed in that window arrive second instead of vanishing (CR-03).**

## Performance

- **Duration:** 16 min (continuation executor; excludes the checkpoint wait)
- **Started:** 2026-09-21T09:41:00Z
- **Completed:** 2026-09-21T09:53:00Z
- **Tasks:** 3 executed (Task 1 was the resolved decision checkpoint)
- **Files modified:** 7 (1 created)

## Accomplishments

- **CR-04 closed at its source.** The role-poll branch in `claude-code-runtime.ts` no longer calls `requestHandoff(taskId, observed.role)` + a private completion helper. It posts the same `gsd.phase_observed` envelope `apps/worker/src/poll-loop.ts` posts, with `active: true` justified in-comment by the in-flight stream the poll lives inside. The completion helper — and with it the `record.agentId = toAgentId` line that wrote a role label into an agent-id field, permanently, in an append-only table — is deleted.
- **The test that codified the bug is gone.** The old `Test C (CR-02)` asserted `sourceAgentId === "Engineering"` as *intended behaviour*. It was deleted outright, not inverted, and replaced with the opposite property asserted against `startTask`'s real `agentId`.
- **A cross-component test proves the reducer half.** The emitted envelope, fed through `company-core`'s real `reduce`, refines the real agent's status (`coding` → `testing` for category `verification`) and produces an agents map containing exactly the real agent — no `"QA"` key.
- **CR-03 closed.** `browser-connections` went from `Set<WebSocket>` to `Map<WebSocket, string[] | null>`; `/ws/browser` registers *before* the awaited SELECT and calls the new `flushBrowserSocket` immediately after the snapshot send. A thrown SELECT unregisters and closes without flushing.
- **Three deferrals written down**, including `T-05-11-WR01` with a STRIDE category, a severity, and an expiry condition.

## Task Commits

1. **Task 2 (plan Task 1): role observation, not handoff** — `fef5426` (test, RED) → `23e470f` (feat, GREEN). No REFACTOR commit — the resulting diff had no obvious cleanup.
2. **Task 3 (plan Task 2): buffer the browser socket** — `9178410` (test, RED) → `043ddbd` (feat, GREEN). No REFACTOR commit.
3. **Task 4 (plan Task 3): record the deferrals** — `c00dd4e` (docs).

**Plan metadata:** the `docs(05-11): complete ...` commit carrying this SUMMARY, STATE.md, ROADMAP.md and WINDOWS.md (its own hash is not self-citable here).

_Measured: `git rev-list --count 0e368b3..HEAD` = 6 (5 task commits + the metadata commit)._

## Files Created/Modified

- `packages/claude-adapter/src/claude-code-runtime.ts` — role poll emits `gsd.phase_observed`; completion helper deleted; `requestHandoff` comment now states the runtime has no automatic handoff trigger
- `packages/claude-adapter/src/claude-code-runtime.test.ts` — role-poll describe block reworked (7 cases + the retained terminal-status case)
- `packages/claude-adapter/package.json` — `company-core` added as a devDependency for the cross-component case
- `apps/api/src/ws/browser-connections.ts` — buffer-then-promote registry, new `flushBrowserSocket` export
- `apps/api/src/ws/browser-connections.test.ts` — **new**, 5 module-state cases
- `apps/api/src/routes/ws-browser.ts` — register before SELECT, flush after snapshot, explicit failure path
- `apps/api/src/routes/ws-browser.test.ts` — route-level CR-03 case + `collectMessages` helper
- `.planning/phases/05-pixel-office-renderer/deferred-items.md` — three new level-2 entries

## Decisions Made

**D-04 (05-CONTEXT.md) — user answered `delete-trigger` at the `checkpoint:decision`.**
The simulated handoff trigger is deleted. The trade-off was stated and accepted: D-04's full choreographed walk-to-desk sequence stays built, tested and live-wired, and 05-12 still proves it end-to-end on a real canvas with both participants created by live events — but **no in-repo trigger emits a handoff pair until Phase 6's multi-agent orchestration**, so HANDOFF-01 lands as its *rendering half* this phase. A handoff must be initiated by a caller supplying a real receiving agent id via the public `requestHandoff` interface method. Recorded in full in `deferred-items.md` under "`agent.handoff_completed` has no in-repo producer after 05-11". This does not weaken D-04 — the choreography it chose over the cheaper icon-transfer is entirely intact; what is deferred is the thing that was firing it dishonestly.

Other decisions are listed in the frontmatter's `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Linked `company-core` as a `claude-adapter` devDependency**
- **Found during:** Task 2 (plan Task 1), RED phase
- **Issue:** The plan's Test 6 requires importing `reduce`/`emptyState` from `company-core` inside `claude-code-runtime.test.ts`, but `claude-adapter` had no `company-core` dependency, so the import would not resolve.
- **Fix:** Added `"company-core": "workspace:*"` to `devDependencies` and re-linked. This is a workspace-local link (pnpm `workspace:*` protocol), not a registry install — no third-party package was fetched.
- **Files modified:** `packages/claude-adapter/package.json`, `pnpm-lock.yaml`
- **Verification:** symlink present at `packages/claude-adapter/node_modules/company-core`; the suite loads and passes.
- **Committed in:** `fef5426` (RED commit)

**2. [Template deviation, not a rule] `requirements-completed: []` instead of the plan's `requirements` array**
- **Reason:** The SUMMARY template says to copy the plan's `requirements` verbatim, but this plan's Task 3 explicitly forbids flipping requirement statuses ("OFFICE-01, OFFICE-03 and HANDOFF-01 stay at `Gaps Found`; they flip only when verify-phase says so") and makes `.planning/REQUIREMENTS.md` being unmodified an acceptance criterion. Populating `requirements-completed` would drive `requirements.mark-complete` and flip them. The IDs are preserved as `requirements-touched` for traceability, and `requirements.mark-complete` was **not** run.

---

**Total deviations:** 1 auto-fixed (1 blocking) + 1 documented template deviation.
**Impact on plan:** No scope creep. Every plan-specified acceptance criterion was met.

## Issues Encountered

**1. `gsd_run check tdd-red-evidence` cannot parse this repo's RED evidence (known tooling gap).**
Tried twice, with both camelCase and snake_case record fields. The verb returned `INVALID_RED (invalid_record)` both times with `exit_code: null` and `target_test: ""` — i.e. it did not read the supplied record's fields at all, rather than judging them. Same gap prior plans in this phase reported. **RED was therefore verified manually, and the verification is stated here rather than implied:**
- *Task 2 RED:* 4 target cases failed on genuine behavioural assertions (`expected [ ... ] to have a length of +0 but got 1` for the handoff event; `expected 'QA' to be 'test-agent-1'` for the agent id), with **23 unrelated tests passing in the same run** — so not a load crash, not zero-discovery, not a syntax error. Post-GREEN: 27 passed.
- *Task 3 RED:* 5 target cases failed with `flushBrowserSocket is not a function` — the named export genuinely did not exist yet — with **40 unrelated tests passing**. This is a weaker RED than an assertion failure (it is a missing-export failure, the unavoidable shape for a new export), and is stated as such. Post-GREEN: 45 passed, 10 files.

**2. The route-level CR-03 case is a race, and it passed before the fix.**
`ws-browser.test.ts`'s new case posts an event immediately after the socket opens, hoping to land inside the handler's awaited SELECT. On the RED run the POST landed *after* the snapshot had already gone out, so the case passed against the unfixed code. It asserts the right contract (snapshot first, then the event, never dropped) and is correct post-fix in both race outcomes, but **it is not a reliable regression detector on its own** — `browser-connections.test.ts` Test 2 is the deterministic one. Logged to the defect ledger rather than papered over. Making it deterministic needs a gated `db.select` spy, which is exactly the fixture 05-VERIFICATION.md noted does not exist yet.

**3. Pre-existing, out of scope: `pnpm --filter claude-adapter typecheck` now surfaces the repo's known TS2835 gap.**
`packages/event-schema/src/index.ts` uses extensionless relative re-exports, which `moduleResolution: NodeNext` rejects. This plan's `company-core` import pulls `event-schema` into `claude-adapter`'s program for the first time, so the errors now appear there too. **This is not a new defect** — `pnpm --filter api typecheck` fails identically at `0e368b3`, and the gap is already the first entry in `deferred-items.md`. Per the scope boundary it was not fixed, and no new heading was added for it (the plan's acceptance criterion requires exactly three new headings).

## Known Stubs

None. No placeholder values, hardcoded empties, or unwired components were introduced.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or trust-boundary schema change was introduced. `T-05-11-01`, `-02` and `-03` (the plan's `mitigate` dispositions) are all closed by the shipped code; `T-05-11-WR01` and `-04` were `accept` and are recorded; `T-05-11-05` remains `transfer`red to Phase 7 unchanged — this plan does not render `bubbleText`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 05-12**, which proves the D-04 choreography end-to-end on a real canvas with both participants created by live events. Nothing this plan removed touches that path: the schema members, reducer handlers, choreography FSM and browser relay are all intact, and 05-12's handoff pair must be driven through `requestHandoff` with a real receiving agent id (or posted directly), which is now the only honest way to produce one.
- **For verify-phase:** HANDOFF-01 should be scored as its rendering half per `must_haves.truths` and the D-04 checkpoint answer. The absent production trigger is a recorded scope boundary, not a gap — see `deferred-items.md`.
- **Carried into Phase 6/7:** `T-05-11-WR01` (subject authorization at `POST /events`) and the role-to-agent registry that a real handoff trigger requires.
- **`.planning/REQUIREMENTS.md` deliberately untouched.** OFFICE-01, OFFICE-03 and HANDOFF-01 remain at `Gaps Found` until verify-phase says otherwise.

## Self-Check: PASSED

All 6 key files present on disk; all 5 task commits (`fef5426`, `23e470f`, `9178410`, `043ddbd`, `c00dd4e`) present in `git log --oneline --all`. All four plan-level `<verification>` commands re-run green after the final commit.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*
