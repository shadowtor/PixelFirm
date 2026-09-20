---
status: testing
phase: 03-worker-git-adapter-gsd-adapter
source: [03-VERIFICATION.md]
started: 2026-09-20T03:01:42Z
updated: 2026-09-20T03:01:42Z
---

## Current Test

number: 1
name: Live SyncSmith cross-project demo
expected: |
  Point a real `apps/worker` process at `F:/Sidegigs/syncsmith` via `--repo`, using a
  freshly-issued `WORKER_TOKEN` (issued via `POST /admin/workers` against a running
  control plane). Trigger a real `.planning/` change in SyncSmith. Confirm the resulting
  `git.worktree_observed`/`gsd.phase_observed` events land in PixelFirm's events table
  and that `GET /admin/workers` reports the worker as "online".
awaiting: user response

## Tests

### 1. Live SyncSmith cross-project demo
expected: A real worker pointed at F:/Sidegigs/syncsmith connects, sends heartbeats, and emits real git.worktree_observed/gsd.phase_observed events after a real `.planning/` change there; GET /admin/workers shows it online.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
