---
gsd_state_version: "1.0"
current_phase: 05
current_phase_name: Pixel Office Renderer
status: executing
stopped_at: Completed 05-34-PLAN.md
last_updated: "2026-09-23T00:28:49.527Z"
last_activity: 2026-09-23
last_activity_desc: Phase 05 execution started
state_head: 01e361cb479c63d69b6e608e03507219902d4519
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 50
  completed_plans: 49
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-21)

**Core value:** The pixel office must accurately visualise a real Claude Code + GSD software project — agents genuinely performing the work and requesting CEO approval — using actual company events, never a prerecorded or faked animation.
**Current focus:** Phase 05 — Pixel Office Renderer

## Current Position

Phase: 05 (Pixel Office Renderer) — EXECUTING
Plan: 5 of 35
Status: Ready to execute
Last activity: 2026-09-23 — Phase 05 execution started

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 4 | - | - |
| 03 | 4 | - | - |
| 04 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 24min | 3 tasks | 17 files |
| Phase 01 P02 | 25min | 2 tasks | 6 files |
| Phase 01 P03 | 15 min | 1 tasks | 2 files |
| Phase 02 P01 | 20min | 2 tasks | 18 files |
| Phase 02 P02 | 15min | 2 tasks | 9 files |
| Phase 02 P03 | ~20min | 2 tasks | 6 files |
| Phase 03 P01 | 20min | 2 tasks | 12 files |
| Phase 03 P02 | ~11min | 2 tasks | 9 files |
| Phase 03 P03 | 13min | 2 tasks | 11 files |
| Phase 03 P04 | 35min | 3 tasks | 12 files |
| Phase 04 P01 | ~50min | 3 tasks | 14 files |
| Phase 04 P02 | 45min | 2 tasks | 4 files |
| Phase 04 P03 | 35min | 2 tasks | 6 files |
| Phase 04 P04 | ~9min + checkpoint wait | 3 tasks | 6 files |
| Phase 05 P01 | 25min | 2 tasks | 46 files |
| Phase 05 P02 | 55min | 2 tasks | 17 files |
| Phase 05 P03 | 35min | 2 tasks | 16 files |
| Phase 05 P04 | 20min | 2 tasks | 9 files |
| Phase 05 P05 | 15min | 3 tasks | 10 files |
| Phase 05 P06 | 20min | 2 tasks | 7 files |
| Phase 05 P07 | 12min | 2 tasks | 8 files |
| Phase 05 P08 | ~35min | 1 tasks | 3 files |
| Phase 05 P10 | 20 min | 2 tasks | 9 files |
| Phase 05 P09 | 20 min | 3 tasks | 4 files |
| Phase 05 P11 | 16 min | 3 tasks | 7 files |
| Phase 05 P12 | 17 min | 3 tasks | 8 files |
| Phase 05 P13 | 8 min | 3 tasks | 8 files |
| Phase 05 P14 | 4 min | 3 tasks | 5 files |
| Phase 05 P15 | 4 min | 2 tasks | 2 files |
| Phase 05 P16 | 7 min | 2 tasks | 2 files |
| Phase 05 P17 | 6min | 3 tasks | 5 files |
| Phase 05 P18 | 5min | 2 tasks | 2 files |
| Phase 05 P19 | 5min | 2 tasks | 6 files |
| Phase 05 P20 | 15 min | 2 tasks | 5 files |
| Phase 05 P21 | 20m | 2 tasks | 7 files |
| Phase 05 P22 | 10m | 2 tasks | 10 files |
| Phase 05 P23 | 10m | 2 tasks | 4 files |
| Phase 05 P24 | 20m | 2 tasks | 5 files |
| Phase 05 P25 | 15m | 2 tasks | 6 files |
| Phase 05 P26 | 10m | 2 tasks | 7 files |
| Phase 05 P27 | 9min | 2 tasks | 5 files |
| Phase 05 P28 | 9min | 2 tasks | 6 files |
| Phase 05 P29 | 6min | 2 tasks | 4 files |
| Phase 05 P30 | 9min | 2 tasks | 5 files |
| Phase 05 P31 | 9 min | 2 tasks | 6 files |
| Phase 05 P32 | 12 min | 3 tasks | 6 files |
| Phase 05 P33 | 33 min | 3 tasks | 5 files |
| Phase 05 P34 | 26 min | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Horizontal-layers build order — event schema/state engine, control plane, worker+git+gsd adapters, AgentRuntime/ClaudeCodeRuntime, pixel office renderer, CEO dashboard, visibility+overlay, Twitch — each phase a pure consumer of the one before it.
- Roadmap: Visibility levels + overlay route (Phase 7) ship as one phase per PITFALLS.md — the overlay route is unsafe to expose until server-side filtering exists.
- [Phase 01]: corepack unavailable on Node v25.9.0; fell back to npm install -g pnpm, resolved pnpm@12.4.2 pinned as packageManager
- [Phase 01]: Added companies slot to ProjectionState beyond the plan's five required kinds (agents/floors/teams/projects/tasks) so company.started has somewhere to materialize state
- [Phase 01]: [Phase 01-02]: No 'team' seed category exists among the 12 event types — agent.online carries teamId and its handler creates the team record as a side effect of the agent joining it
- [Phase 01]: [Phase 01-02]: viewer.event intentionally has no reducer handler — touches none of the five required projection kinds, no-ops via the existing unrecognized-type fallback
- [Phase 01]: [Phase 01-03]: gsd_run check tdd-red-evidence's TAP parser targets node --test's summary lines, which Vitest's --reporter=tap doesn't emit — RED evidence for this plan was verified manually instead; flagged as a GSD tooling gap on Vitest-based repos
- [Phase 01]: [Phase 01-03]: session.started's omitted-sourceAgentId test already passed pre-fix (incidental key-miss no-op) but was still added and the handler still rewritten to an explicit if (!agentId || !existing) guard, matching git.commit_created/deployment.started's contract shape
- [Phase 02]: [Phase 02-01]: Test Postgres port moved from planned 5433 to 5434 — an unrelated wardogsoutpost project's container already had 5433 bound on this machine
- [Phase 02]: [Phase 02-01]: zod added as a direct apps/api dependency (env.ts imports it directly, not just transitively via event-schema)
- [Phase 02]: [Phase 02-01]: ESM static imports hoist above top-level statements — test files must set process.env then dynamically import() env-dependent modules (../server, ../db/client), not statically import them
- [Phase 02]: [Phase 02-02]: Renamed drizzle-kit generate's auto-named workers migration to 0002_workers_table.sql, updating journal.json's tag to match
- [Phase 02]: [Phase 02-02]: No query-string token fallback implemented for /ws auth (YAGNI — no real WS client until Phase 3's worker, a Node process that can set headers)
- [Phase 02]: [Phase 02-03]: Split Task 1/Task 2 boundary so rate-limit config additions land only in Task 2's commit, matching the plan's own task split
- [Phase 02]: [Phase 02-03]: Extended Fastify logger's redact list to include x-bootstrap-secret alongside authorization (Rule 2 — SEC-01 never-logged requirement)
- [Phase 02]: [Phase 02-03]: Reworded CSRF-posture comment in server.ts to avoid the literal '@fastify/cors' substring, which was tripping the plan's own CORS audit grep
- [Phase 03]: [Phase 03-01]: worker.heartbeat payload is empty (z.object({})) — identity comes solely from authenticated request.workerId, never a client-supplied field (T-03-01)
- [Phase 03]: [Phase 03-01]: Connection status (online/stale/offline) derived live from heartbeat receipt time + socket-open state, no new persisted DB column
- [Phase 03]: [Phase 03-01]: worker.heartbeat has no company-core reducer handler by design — connection status lives server-side only, never in ProjectionState
- [Phase 03]: [Phase 03-02]: gsd_run check tdd-red-evidence's TAP parser targets node --test summaries, which Vitest doesn't emit — RED evidence verified manually both times (recurring GSD tooling gap on this Vitest-based repo)
- [Phase 03]: [Phase 03-02]: no-mutating-git.test.ts's detection was manually proven by temporarily injecting a git merge call into the RED stub, confirming the test failed, then reverting before the RED commit
- [Phase 03]: [Phase 03-02]: listWorktrees/isGitWorktree additionally verified against the real PixelFirm and SyncSmith repos, not just the temp fixture — both resolved exactly 1 worktree record each
- [Phase 03]: [Phase 03-03]: mapToGsdCategory's new_project branch covers status unknown AND status planning with no phase-file signal (SyncSmith's real shape) — but not discussing/executing/etc, which fall to unknown/unknown as a contradictory combination
- [Phase 03]: [Phase 03-03]: added missing unknown member to event-schema's GsdPhaseObservedPayload.category enum (03-01 gap) — CompanyEventSchema.safeParse would have rejected the anti-fabrication fallback event GSD-01's mitigation depends on
- [Phase 03]: [Phase 03-04]: startHeartbeat(controlPlaneUrl, token, companyId) added a required companyId param not in the plan's literal signature — worker.heartbeat envelope's companyId is mandatory on BaseEnvelope
- [Phase 03]: [Phase 03-04]: poll-loop.ts and ws-client.ts's stop() check a stopped flag before every postEvent call, not just clearInterval() — an already in-flight tick's slow isAnyClaudeProcessAlive subprocess call could otherwise still emit after stop() returns
- [Phase 03]: [Phase 03-04]: poll-loop.ts's isFirstTick guard prevents the first-ever poll tick from reporting active:true from baseline discovery alone, avoiding a false active flip on the second (genuinely unchanged) tick
- [Phase 04]: [Phase 04]: [Phase 04-01]: Claude MAX subscription billing posture verified live — subscription pool billed, not API-credit pool; claude auth status reported subscriptionType 'pro' not 'max' (flagged, non-blocking)
- [Phase 04]: [Phase 04]: [Phase 04-01]: @anthropic-ai/claude-agent-sdk@0.3.278 confirmed legitimate (anthropics org, 8.16M weekly downloads) before install
- [Phase 04]: [Phase 04]: [Phase 04-01]: pauseTask/resumeTask/cancelTask/sendMessage/requestReview/requestHandoff implemented as throwing stubs so createClaudeCodeRuntime satisfies the full AgentRuntime type immediately — real implementations deferred to Plan 04-02/04-03
- [Phase 04]: [Phase 04-02]: Query.interrupt() exists (sdk.d.ts) but is documented streaming-input-only — runQuery uses a string prompt, so interrupt() is best-effort; the real termination guarantee is attemptGracefulStop's grace-period race + AbortController.abort() hard-kill
- [Phase 04]: [Phase 04-02]: pauseTask and cancelTask share one attemptGracefulStop(record) helper (interrupt-then-race-against-GRACEFUL_TIMEOUT_MS), differing only in terminal status (paused vs cancelled); the watchdog's onTimeout reuses it too for the blocked transition
- [Phase 04]: [Phase 04-02]: runQuery sets in-memory status 'running' on init-message capture (Rule 2, previously-unused AgentTaskStatus member) so pauseTask/sendMessage's mid-stream preconditions are observable via getStatus() — no event emitted for this transition
- [Phase 04]: [Phase 04]: [Phase 04-03]: canUseTool always returns behavior deny for a classified signal, never allow -- requestReview fires and is surfaced but Phase 6's CEO dashboard grants the actual approval
- [Phase 04]: [Phase 04]: [Phase 04-03]: classifySignal's Bash CEO-gated pattern list is an explicitly documented first-pass heuristic allowlist, not exhaustive -- the watchdog remains the last line of defense against anything it misses
- [Phase 04]: [Phase 04]: [Phase 04-03]: requestHandoff is observation-only -- posts agent.handoff_requested but never alters the task's own AgentTaskStatus, since no second agent exists yet in Phase 4 to receive control
- [Phase 04]: [Phase 04]: [Phase 04-03]: role-change poll uses the plan-specified 5000ms interval (not poll-loop.ts's own 2500ms DEFAULT_INTERVAL_MS) -- ClaudeCodeRuntime now implements the complete eight-method AgentRuntime with zero remaining stubs
- [Phase 04]: [Phase 04]: [Phase 04-04]: Demo target SyncSmith Phase 1 via /gsd-discuss-phase 1 — real ClaudeCodeRuntime.startTask drove it to completed with a genuine unscripted AskUserQuestion -> ceo.approval_requested signal, all events schema-valid
- [Phase 04]: [Phase 04]: [Phase 04-04]: Human approved Task 3 checkpoint after independently re-verifying evidence content plus SyncSmith's restored clean git state (status/worktree list/branch list)
- [Phase 05]: [Phase 05]: [05-01]: Trimmed the forked pixel-agents-hq renderer/types/constants to the IDLE-only render pipeline this plan needs (human-approved at the Task 1 checkpoint), dropping ~10 fork-internal modules (furniture/carpet/area/pet/matrix-effect/editor-overlay, PNG sprite cache) not in this plan's file list
- [Phase 05]: [Phase 05]: [05-01]: BROWSER_ACCESS_TOKEN is one shared timing-safe-compared token (not a per-client HMAC credential table) — proportionate for this MVP's single trusted browser viewer
- [Phase 05]: [Phase 05]: [05-01]: No producer of agent.online exists anywhere in this codebase yet — the phase's literal live-browser demo isn't reproducible until a future plan adds an agent-identity event producer
- [Phase 05]: 05-02: STATUS_MAP is the exhaustive 15-value AgentStatus visual mapping; icon glyphs distinguished by silhouette not colour alone (OFFICE-03)
- [Phase 05]: 05-02: bubble-permission.json/bubble-waiting.json still unauthored — no bubble rendering exists yet, deferred to a future plan alongside engine/renderer.ts's bubble draw pass
- [Phase 05]: [Phase 05]: [05-03]: deriveAgentStatus is a pure priority-ordered rule table (no active task -> IDLE; failed/completed/cancelled; blocked/paused; waiting_for_review/waiting_for_handoff; starting/running refined by gsdCategory) — never returns OFFLINE or READING (documented gap, no per-agent liveness/tool-call signal exists yet)
- [Phase 05]: [Phase 05]: [05-03]: agent.handoff_completed added as CompanyEventSchema's 17th union member; StartTaskInput.agentId (required) threads through task.status_changed's sourceAgentId and requestHandoff's fromAgentId, which now throws rather than fabricating when a task's agentId is unknown
- [Phase 05]: Handoff FSM (WALKING_TO_RECEIVER->ICON_VISIBLE->RETURNING_TO_DESK) drives the forked findPath BFS off real agent.handoff_requested/completed event pairs, arrival detected per-frame from the already-updated Character (no timer/heuristic)
- [Phase 05]: git.allow_default_branch_commits=true added to config.json - this project's branching_strategy is 'none' (single-branch main), matching every prior 05-* plan's commit history
- [Phase 05]: [Phase 05]: 05-05: no-change assumption-delta decision — HANDOFF-01's 'second agent' roadmap phrasing does not require an agent-model architecture change; characters Map was already keyed by agentId (multi-agent) before this plan
- [Phase 05]: [Phase 05]: 05-06: Verified char_0.png's assumed geometry (112x96, down/up/right rows, walk=[0,1,2,1]/typing=[3,4]/reading=[5,6]) against the fork's own pngDecoder.ts/constants.ts/spriteData.ts before finalizing the decode script — matched exactly, no correction needed
- [Phase 05]: [Phase 05]: 05-06: Kept the plan's specified alpha<128 binary transparent/opaque threshold rather than the fork's stricter alpha<2 cutoff — deliberate simplification, flagged as a ponytail known-ceiling comment
- [Phase 05]: 05-07: bubble-waiting.json is an hourglass not the fork's original checkmark — bubble-completed.json already owns the checkmark silhouette, and OFFICE-03 forbids a glyph being another's recolour
- [Phase 05]: 05-07: bubble-permission.json is a question mark not three-dots-in-a-bubble — badge-discussing.json already owns the bubble-with-dots silhouette
- [Phase 05]: 05-07: the bubble overlay draws inside the character's own {zY, draw} closure, never as a separate z-sort entry, so an icon can't sort behind a character in front of it
- [Phase 05]: 05-07: renderer draw-proof pattern — a plain object recording fillRect + the fillStyle in effect, cast to CanvasRenderingContext2D at the call site; bubble-vs-base partitioning uses a control render (bubbleType null), not colour, since bubble-blocked shares #000000/#ffffff with the character sprite
- [Phase 05]: 05-08: live proof posts only event types WORKER_ALLOWED_EVENT_TYPES actually admits (task.status_changed + the handoff pair) — widening the allow-list for agent.online to make the demo pass would have faked the proof
- [Phase 05]: 05-08: renderScene's bubbleY is clamped to Math.max(0, ...) — row-1 desks gave drawY = -8, so the overlay painted entirely off-canvas and the bubble feature was non-functional for the first 18 agents
- [Phase 05]: 05-08: the live script uses fixed synthetic agent ids and asserts a clean pre-event baseline, so an append-only events table can't let a later run pass on leftover pixels
- [Phase 05]: 05-10: desk rows moved to 3/6/9 (start 3, pitch 3) rather than 05-VERIFICATION.md's single top gutter row — a gutter alone leaves the first desk on row 2 where the glyph position is still negative and the clamp still fires, so the defect would have survived
- [Phase 05]: 05-10: the state glyph is bound to its OWNER's sprite box, not floored against the canvas — being clipped at the canvas edge is strictly better than being attributed to a neighbouring agent (CR-02)
- [Phase 05]: 05-10: declined 05-VERIFICATION.md's horizontal bubbleX clamp ask — an 11-wide glyph centred on a 16-wide sprite is always a subset of its owner's extent, so the clamp is unreachable code; a containment test is the guard instead
- [Phase 05]: 05-10: getCharacterSprites' palette index was deleted rather than given a meaning — exactly one character template exists in the repo, so the parameter had nothing to select (WR-08)
- [Phase 05]: 05-10: per-agent identity hue is a pure FNV-1a fold of the agentId onto 12 x 30deg buckets — identity only, no AgentStatus value may influence it (05-UI-SPEC.md's locked Color separation)
- [Phase 05]: 05-09: apps/web now holds a live ProjectionState and runs company-core's own reduce() per relayed event — the live path and the snapshot fold path are literally the same code, so drift is structurally impossible rather than merely tested for
- [Phase 05]: 05-09: declined 05-VERIFICATION.md's stateless task.status_changed mapper — deriveAgentStatus needs gsdCategory, which lives in ProjectionState.gsdObservations and never on the event, so a stateless shape would drift on 6 of 15 AgentStatus values
- [Phase 05]: 05-09: deriveCharacterUpsertFromStatusEvent deleted, not extended — it mapped only agent.online/session.started, which no producer emits and WORKER_ALLOWED_EVENT_TYPES does not admit (the CR-01 fix itself)
- [Phase 05]: 05-09: App.tsx's upserts-before-handleHandoffEvent ordering is pinned by a source-order test proven red by inverting the code — the onEvent closure is not exported and its effect never runs under static rendering, so source order is the invariant's only observable form
- [Phase 05]: 05-09: vite's ?raw replaces node:fs for filesystem reads in apps/web tests — the package has no @types/node and Task 3 forbids adding a dependency
- [Phase 05]: D-04 checkpoint answered delete-trigger: the role poll's simulated handoff trigger is deleted; HANDOFF-01 lands as its rendering half in Phase 5 — A GSD workflow role change is an observation, not a handoff to a role-named agent. The choreography stays intact; only the dishonest trigger defers to Phase 6.
- [Phase 05]: 05-12: the MetroCity CC0 claim splits into two links — the PACK is CC0 at its publisher's cited itch.io listing (re-fetched 2026-09-21), but that the shipped char_0.png IS that pack's art rests on the fork's README credit alone; ASSET-LICENSES.md §1 states both separately rather than averaging them into one tier
- [Phase 05]: 05-12: the in-app footer drops the sprite licence claim entirely rather than restating a softer one — a one-line footer cannot carry a two-link provenance distinction honestly, so it credits both sources and asserts only the fork's documented MIT
- [Phase 05]: 05-12: the live proof's per-run reset is the repo's own db:test:down volume removal, never a DROP or row deletion — the harness parses its target from docker-compose.test.yml so it can never be aimed at a developer's dev database (WR-05)
- [Phase 05]: 05-12: Truth 4's glyph-band assertion is scoped to the blocked agent's own tile column — a whole-canvas colour count is a claim about every agent on the floor, and the Truth-2 agent's glyph sits in exactly the band the assertion excludes
- [Phase 05]: 05-12: requirements-completed left empty (matching 05-11) — three of Phase 5's four observable truths still depend on an unrun live proof and human verification; flipping them Complete would be the over-claim this plan exists to remove
- [Phase 05]: 05-13: dialogue colours #121212/#f0f0f0 (planned #1a1a1a/#ffffff are in the sprite palette); render order sprites -> dialogue -> glyphs; request-event dedup lives in the handoff FSM
- [Phase 05]: 05-14: desks and identity hues derived from seated characters (lowest free desk; hashed hue then next free bucket) — collisions start at the 13th concurrently seated agent
- [Phase 05]: 05-15: runQuery ownership token (TaskRecord.currentRun + isCurrent()) guards every per-invocation writer; guard sits in the callbacks, not the public requestReview
- [Phase 05]: 05-16: live-proof harness refuses to run while API/web port is taken (TCP preflight before any reset); servers always spawned, never reused (WR-06)
- [Phase 05]: 05-17: status pose deferred while a handoff path is pending; frozen holds only the frame, never position
- [Phase 05]: 05-17: retireHandoff is the single exit for a handoff record (home, vanished sender, replaced record)
- [Phase 05]: 05-18: runQuery claims currentRun before the preemption await and re-checks after; superseded waiter returns without query() (last caller wins)
- [Phase 05]: 05-18: pauseTask/cancelTask claim a fresh token before graceful stop so a pending preemption cannot undo a human stop
- [Phase 05]: 05-19: arrival = not WALK and empty path (hasArrived); setRestPose is the only pose writer and never interrupts WALK; walks end in restPose (IN-03)
- [Phase 05]: 05-19: a new handoff request retires every record of the same taskId or sender (WR-01); records compare the sender by Character identity (WR-03); handoff-task icon survives glyph-less statuses (WR-02)
- [Phase 05]: 05-20: glyph precedence is frozen glyph > handoff-task icon while waiting > status glyph; applyBubble is the only bubbleType writer, statusBubble written only by the status upsert
- [Phase 05]: 05-20: a handoff completion whose sender is gone or re-seated retires the record with no receiver TYPE or accepted line (senderIsCurrent in every phase)
- [Phase 05]: 05-21: office presented at integer engine zoom N>=3 (320N x 176N backing store), not CSS upscale
- [Phase 05]: 05-22: office floor/wall/furniture sourced from MetroCity Interior (CC0, SHA-pinned, --check guarded); fork packs stay deferred
- [Phase 05]: 05-22: wallTop = TilesHouse 16,24,16,16; monitorBack is a 10x9 original
- [Phase 05]: 05-23: frozen-state glyphs carry a closed 1 px black outline, fill >= 3:1 vs outline, masks differ pairwise >= 20 cells; guarded by bubbleSprites.test.ts (G-05-2)
- [Phase 05]: 05-24: office layout = 8 desks in pods (cols 1/5/9/13, rows 5/9), 16 seats on rows 4/8, 4 standing spots in right strip; monitor dy -18
- [Phase 05]: 05-24: per-(sprite, zoom) OffscreenCanvas cache with drawImage; fillRect fallback in node tests
- [Phase 05]: 05-25: seats come from the layout (16 SEATS then 4 STANDING_SPOTS, lowest free first); 21st+ agent shares the last standing spot
- [Phase 05]: 05-25: sitting offset only for TYPE on own layout seat (isOwnSeat); typing frames kept everywhere (D-01); walk ending at home faces DOWN
- [Phase 05]: 05-26: footer credits 'character and office sprites: MetroCity packs by JIK-A-4', still no licence assertion
- [Phase 05]: 05-26: live harness reads seats/standing/furniture and office colours from engine data; agent pixel = pixel in no office colour
- [Phase 05]: 05-27: handoff sender waits on the nearest free tile on the receiver's seat row; all handoff walks avoid furniture and other agents
- [Phase 05]: 05-28: handoff line is a speech bubble under the speaker's feet, spanning the pair, clamped only to the floor interior; layout guard test proves speaker bands clear
- [Phase 05]: 05-29: handoff dialogue is a short label ('<title> → <name>', '<name> accepts <title>'), caps 12/10 code points; UI-SPEC supersedes the 11px canvas dialogue scale
- [Phase 05]: 05-30: state glyphs anchor on the owner's visible head (lowest ink row 1 px above the frame's first opaque row, per frame; G-05-1c)
- [Phase 05]: 05-31: the office is sized from the FULL viewport (no footer allowance) and centred on a WALL_COLOR surround; the attribution footer is transparent and overlays the office's own bottom wall row
- [Phase 05]: 05-31: the no-black guarantee is asserted on a pngjs-decoded full-viewport screenshot, not canvas getImageData — the defect lived in host-page background the canvas cannot see
- [Phase 05]: 05-32: a character resting (not walking) on its own seat is drawn seated whatever its status, superseding 05-25's TYPE-only rule; only walkers, handoff senders at an interaction tile and standing spots stand
- [Phase 05]: 05-32: the sitting rule is expressed negatively (state !== WALK) so a future CharacterState defaults to seated at its own desk rather than silently reopening G-05-P3
- [Phase 05]: 05-32: seated-vs-standing legibility is measured by compositing difference (visible body rows: 17 seated vs 28 standing), not by sprite geometry — only a two-render diff proves the desk removed rows rather than shifting them
- [Phase 05]: 05-32: bubble-waiting redrawn as a true hourglass (widths 11/9/7/5/3/5/7/9/11, 1 px-fill waist, sand in the lower bulb) with its palette frozen, so every existing contrast test and the live harness colour sets stay valid
- [Phase 05]: 05-34: handoff senders wait on fixed aisle slots from layout data (office-layout.json interaction row 6, offsets +1/-1/+3/-3 from the receiver's home), superseding 05-27's seat-row search; slot occupancy is Chebyshev 1 so a second sender never stands beside the first
- [Phase 05]: 05-34: row 6 is the only interior row two tiles from every seat and standing spot, so slot clearance is a property of the ROW, not the offsets; a layout-data guard test proves it without running a scene
- [Phase 05]: 05-34: the waiting sender is faced on the DOMINANT axis (UP across the desk to a row-4 receiver, DOWN to a row-8 one); measured visible-ink separation 4 px over 86 neighbour pairs, against 2 px for the seat-row layout

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 4 planning: apps/api's test suite has an intermittent parallel-test-file migration race (`pg_type_typname_nsp_index` duplicate-key error) when multiple test files apply the same enum-creating migration concurrently against the local test Postgres — observed twice in Phase 3, non-reproducible on rerun, does not affect production migrations (drizzle-kit migrate runs once, sequentially). Worth a proper fix (serialize test-DB migration application) before it masks a real regression.
- [Phase 4]: CR-01/CR-02/CR-03 code-review fixes (ANTHROPIC_API_KEY env-stripping, terminal-status guard, runQuery reentrancy guard) have no dedicated unit regression test exercising the guard logic directly — real-subprocess integration coverage and direct code inspection back them today, but a future refactor could silently regress any of the three while the existing suite stays green. Non-blocking, flagged by the phase verifier.
- Phase 5 planning: full asset-licence audit of the Pixel Agents fork beyond the credited CC0 character pack is still outstanding.
- Phase 8 planning: verify current Twitch EventSub reconnect/signature details against live docs; budget subscription total_cost before choosing event types.
- Phase 5 (05-01): pre-existing repo-wide TS module-resolution gap — event-schema/index.ts and company-core/index.ts re-export without .js extensions, which tsc --noEmit flags under moduleResolution NodeNext (pnpm --filter api typecheck already failed on this before 05-01). Doesn't block any required verify command for 05-01 through 05-04 but worth a dedicated fix pass. See deferred-items.md.
- Phase 5 (05-08): still no producer of agent.online anywhere in the codebase — the literal 'agent walks into the office when it comes online' demo remains unreproducible. The live proof demonstrates the rendering truths via task.status_changed (what ClaudeCodeRuntime actually emits) and deliberately does NOT close this gap.
- Phase 5 (05-08): an already-connected browser client never re-derives AgentStatus from task.status_changed / gsd.phase_observed / agent.handoff_completed — only a fresh snapshot reflects them. Phase 6's CEO dashboard has the identical need; proper fix is a live-projection-diff broadcast.
- T-05-11-WR01 accepted: a worker credential can author state for any agent/company/visibility at POST /events. Acceptance expires the moment a non-INTERNAL consumer is pointed at the control plane (Phase 6/7 owns the fix).
- Phase 5 (05-12): the restructured live proof (scripts/verify-pixel-office-live.mjs) has never been executed end to end — it recreates a Docker volume and starts two dev servers, so it is a deliberate human run. Truths 1-4 are structurally complete and node --check clean, but none has been observed passing on a real canvas. Running it twice in succession is human-verification item 1 for this phase.
- Phase 5 (05-14): HANDOFF-01's production trigger has no owning ROADMAP phase (Phase 6 does not include multi-agent orchestration or a role-to-agent registry); a roadmap placement decision is needed before Phase 6 planning — see deferred-items.md.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-23T00:28:08.128Z
Stopped at: Completed 05-34-PLAN.md
Resume file: None
