---
phase: 05-pixel-office-renderer
plan: 05
subsystem: api
tags: [fastify, websocket, vitest, event-schema, claude-agent-sdk]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer (05-01..05-04)
    provides: WebSocket broadcast hub, browser socket route, ClaudeCodeRuntime handoff/status wiring, and event-schema/pixel-office renderer this plan patches
provides:
  - "POST /events accepts all 4 event types ClaudeCodeRuntime actually emits (previously 403'd)"
  - "completeHandoff reassigns TaskRecord.agentId so later status events attribute correctly"
  - "Browser socket connect handler guarantees snapshot-before-broadcast ordering"
  - "apps/web/src/agent-event-mapper.ts — pure, guarded event-to-Character-upsert mapper"
  - "REQUIREMENTS.md corrected: OFFICE-02/HANDOFF-02 flipped to Complete"
affects: [05-06, 05-07, 05-08, phase-06-ceo-approval]

# Actuals (#2632)
actuals:
  tokens: 4191
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Event allow-list is an explicit Set literal per credential type, extended member-by-member (never wildcarded) as new worker-originated event types are added"
    - "Ownership reassignment (TaskRecord.agentId) happens inside the handoff-completion function itself, before its own postEvent call — not in a separate post-processing step"
    - "Snapshot-then-register connect ordering: build/send the connect-time payload before registering the socket for live broadcast, eliminating a register-then-snapshot race"
    - "Pure guard-mapper pattern (deriveCharacterUpsertFromStatusEvent) replaces inline non-null assertions at the call site with an explicit null-returning function"

key-files:
  created:
    - apps/web/src/agent-event-mapper.ts
    - apps/web/src/agent-event-mapper.test.ts
  modified:
    - apps/api/src/routes/events.ts
    - apps/api/src/routes/events.test.ts
    - packages/claude-adapter/src/claude-code-runtime.ts
    - packages/claude-adapter/src/claude-code-runtime.test.ts
    - apps/api/src/routes/ws-browser.ts
    - apps/api/src/routes/ws-browser.test.ts
    - apps/web/src/App.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "No architectural changes required — all 4 defects (CR-01, CR-02, WR-01, WR-02) were narrow, localized fixes exactly matching 05-REVIEW.md's suggested fixes"
  - "Assumption-delta: HANDOFF-01's 'second agent' roadmap phrasing does not indicate a singular-to-plural agent-model transition is needed — characters Map was already keyed by agentId (multi-agent) before this plan; no-change decision recorded in the plan objective"

patterns-established:
  - "Guard-mapper pattern: a schema-optional field (BaseEnvelope.sourceAgentId) is never trusted with a non-null assertion at a UI call site — extract a pure function that returns null on the missing case, and gate the call on that null check"

requirements-completed: [OFFICE-02, HANDOFF-02]

coverage:
  - id: D1
    description: "POST /events accepts (202) task.status_changed and agent.handoff_completed from a worker credential, closing CR-01's silent 403 on ClaudeCodeRuntime's own event types"
    requirement: "HANDOFF-01"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/events.test.ts#Test A (CR-01): accepts a schema-valid task.status_changed event from a worker credential"
        status: pass
      - kind: integration
        ref: "apps/api/src/routes/events.test.ts#Test B (CR-01): accepts a schema-valid agent.handoff_completed event from a worker credential"
        status: pass
    human_judgment: false
  - id: D2
    description: "completeHandoff reassigns the task's owning agentId to the receiver before posting the completion event, so every later task.status_changed event attributes to the new owner, not the stale sender — closing CR-02"
    requirement: "HANDOFF-01"
    verification:
      - kind: unit
        ref: "packages/claude-adapter/src/claude-code-runtime.test.ts#Test C (CR-02): completeHandoff reassigns the task's agentId so a later task.status_changed event attributes to the receiving agent, not the original sender"
        status: pass
    human_judgment: false
  - id: D3
    description: "Browser socket connect handler now sends the connect-time snapshot before registering the socket for live broadcast, closing WR-01's ordering race"
    verification:
      - kind: integration
        ref: "apps/api/src/routes/ws-browser.test.ts#the first message received is always the snapshot, even when a POST /events broadcast fires immediately after the socket opens (no snapshot-drain delay)"
        status: pass
    human_judgment: false
  - id: D4
    description: "deriveCharacterUpsertFromStatusEvent guards agent.online/session.started events with a missing sourceAgentId, returning null instead of letting a bogus 'undefined'-keyed Character be created — closing WR-02"
    verification:
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#returns null for an agent.online event with no sourceAgentId"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#returns null for a session.started event with no sourceAgentId"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#returns an IDLE upsert with name for a well-formed agent.online event"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#returns a CODING upsert with undefined name for a well-formed session.started event"
        status: pass
      - kind: unit
        ref: "apps/web/src/agent-event-mapper.test.ts#returns null for an unrelated event type"
        status: pass
    human_judgment: false
  - id: D5
    description: "REQUIREMENTS.md corrected: OFFICE-02 and HANDOFF-02 flip from Gaps Found to Complete, re-confirmed against the live codebase (LICENSE, footer attribution, ASSET-LICENSES.md 4 sections, dialogue-templates test suite); OFFICE-01/OFFICE-03/HANDOFF-01 left unchanged"
    requirement: "OFFICE-02"
    verification:
      - kind: other
        ref: "grep chain in 05-05-PLAN.md Task 3 <verify> block — all 8 checks passed, exit 0"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-21
status: complete
---

# Phase 05 Plan 05: Close CR-01/CR-02/WR-01/WR-02 pipeline defects Summary

**Fixed the 3-member worker event allow-list rejecting ClaudeCodeRuntime's own 4 event types (CR-01), added handoff-completion agentId reassignment (CR-02), reordered the browser socket connect handler to guarantee snapshot-before-broadcast (WR-01), and replaced App.tsx's non-null sourceAgentId assertion with a pure guarded mapper (WR-02) — plus corrected REQUIREMENTS.md's premature Gaps-Found marking for OFFICE-02/HANDOFF-02.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-21T05:04:00Z (approx, first Read call)
- **Completed:** 2026-09-21T05:18:24Z
- **Tasks:** 3
- **Files modified:** 10 (2 new, 8 modified)

## Accomplishments
- `POST /events` now accepts (202) `task.status_changed`, `ceo.approval_requested`, `agent.handoff_requested`, and `agent.handoff_completed` from a worker credential — previously 403'd, silently blocking the real ClaudeCodeRuntime → API pipeline
- `completeHandoff` reassigns `TaskRecord.agentId` to the receiving agent before posting the completion event, so every subsequent `task.status_changed` event for that task attributes to the correct (new) agent
- The browser socket connect handler now sends the connect-time snapshot before calling `registerBrowserSocket`, eliminating a race where a same-instant broadcast could reach a socket before its own baseline state
- New `apps/web/src/agent-event-mapper.ts` exports a pure `deriveCharacterUpsertFromStatusEvent` that returns `null` for a schema-valid-but-identity-less `agent.online`/`session.started` event, replacing App.tsx's `event.sourceAgentId!` non-null assertion that could previously fabricate an "undefined"-keyed Character
- `.planning/REQUIREMENTS.md` corrected: OFFICE-02 and HANDOFF-02 re-confirmed genuinely satisfied and flipped to Complete; OFFICE-01, OFFICE-03, HANDOFF-01 left as Gaps Found

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix CR-01 (event allow-list) and CR-02 (handoff agentId reassignment)** - `f19ec07` (fix)
2. **Task 2: Fix WR-01 (snapshot-before-register ordering) and WR-02 (sourceAgentId guard)** - `7b871c8` (fix)
3. **Task 3: Correct REQUIREMENTS.md's premature Gaps-Found marking for OFFICE-02 and HANDOFF-02** - `6c5bde5` (docs)

## Files Created/Modified
- `apps/api/src/routes/events.ts` - `WORKER_ALLOWED_EVENT_TYPES` extended from 3 to 7 members
- `apps/api/src/routes/events.test.ts` - Test A/B: acceptance-case regression tests for the 2 previously-403'd types
- `packages/claude-adapter/src/claude-code-runtime.ts` - `completeHandoff` reassigns `record.agentId` before its `postEvent` call
- `packages/claude-adapter/src/claude-code-runtime.test.ts` - Test C: CR-02 regression test proving `sourceAgentId` becomes `"Engineering"` after a handoff, not the stale `"test-agent-1"`
- `apps/api/src/routes/ws-browser.ts` - `registerBrowserSocket(socket)` moved to run after the snapshot `socket.send`
- `apps/api/src/routes/ws-browser.test.ts` - WR-01 ordering regression test (no snapshot-drain delay before firing the POST)
- `apps/web/src/App.tsx` - `onEvent` handler now gates the upsert call on `deriveCharacterUpsertFromStatusEvent`'s return value; removed non-null assertion
- `apps/web/src/agent-event-mapper.ts` - new file, pure `deriveCharacterUpsertFromStatusEvent` mapper (WR-02)
- `apps/web/src/agent-event-mapper.test.ts` - new file, 5 tests covering missing-identity guard, both well-formed event shapes, and unrelated-type rejection
- `.planning/REQUIREMENTS.md` - OFFICE-02/HANDOFF-02 checkboxes and Traceability rows flipped to Complete

## Decisions Made
- No architectural changes needed — all four fixes were narrow, localized changes matching 05-REVIEW.md's exact suggested fixes verbatim
- Assumption-delta (recorded in the plan's own objective): HANDOFF-01's "second agent" roadmap phrasing does not require an agent-model architecture change — `packages/pixel-office`'s `characters` Map was already keyed by `agentId` (multi-agent) before this plan. No-change decision, confirmed by reading `packages/pixel-office/src/index.ts` directly.

## Deviations from Plan

None - plan executed exactly as written. All four fixes, all regression tests, and the REQUIREMENTS.md correction matched the plan's `<action>` and `<verify>` blocks without requiring any auto-fix, blocking-issue resolution, or architectural escalation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01/CR-02/WR-01/WR-02 are closed with passing regression tests — the real `ClaudeCodeRuntime` → `POST /events` → `company-core` reducer → browser WS → `packages/pixel-office` pipeline can now carry a real handoff and status change end-to-end without a wire-path defect silently swallowing or misattributing the event.
- OFFICE-01, OFFICE-03, and HANDOFF-01 remain Gaps Found — 05-06 (invisible sprites), 05-07 (no bubble render pass), and 05-08 (live proof) still need to land before those close.
- No blockers for 05-06/05-07/05-08.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commits (`f19ec07`, `7b871c8`, `6c5bde5`) confirmed in git log.
