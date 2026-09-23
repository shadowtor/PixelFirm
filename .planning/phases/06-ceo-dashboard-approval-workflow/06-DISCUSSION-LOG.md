# Phase 6: CEO Dashboard & Approval Workflow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-23
**Phase:** 06-ceo-dashboard-approval-workflow
**Areas discussed:** Approval round-trip, Non-approve actions, Dashboard + CEO office, CEO action auth

---

## Approval round-trip

| Option | Description | Selected |
|--------|-------------|----------|
| Hold open | Park canUseTool until CEO decides; worker restart → expired, blocked, CEO re-triggers | ✓ |
| Durable defer | SDK defer hook; session exits/resumes; parallel tool calls need grant-matching fallback | |

**User's choice:** Hold open
**Notes:** Two advisor researchers disagreed (hold-open vs defer); defer's parallel-call fallback reintroduces grant matching.

---

## Non-approve actions

| Option | Description | Selected |
|--------|-------------|----------|
| Typed deny + note | All four deny with prefixed CEO note; Discuss threads follow-ups | ✓ |
| Reject = cancel task | Reject calls cancelTask | |

| Option | Description | Selected |
|--------|-------------|----------|
| Note required for all | | |
| Optional for Reject | One-click reject; others require note | ✓ |

---

## Dashboard + CEO office

| Option | Description | Selected |
|--------|-------------|----------|
| /ceo + capped diff + room | Private /ceo view, worker-shipped capped diff, walled room with waiting chairs | ✓ |
| Drawer + links + spot | Drawer beside canvas, links/stat only, floor spot | |

---

## CEO action auth

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare Access | Access + server JWT check, email in audit log, header+Origin CSRF | ✓ |
| CEO bearer secret | Separate CEO_ACTION_SECRET | |

---

## Claude's Discretion

Event names/shapes, downlink message shape, diff cap numbers, room size/chair count, dashboard visuals, browser feed auth migration timing.

## Deferred Ideas

- Durable defer-hook approvals surviving worker restarts.
