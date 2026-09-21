---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-21T02:52:06.449Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 05 | stub | packages/pixel-office/src/sprites/spriteData.ts |  | getCharacterSprites always returns fully-transparent placeholder sprite frames — no PNG asset pipeline exists yet; D-02's real pixel-art sourcing is 05-02+ scope | open |  | 2026-09-21T02:52:05.148Z |  |
| 2 | 05 | deviation | packages/pixel-office/src/engine/renderer.ts |  | Trimmed the forked renderer/types/constants to the IDLE-only tile-grid + one-character pipeline (human-approved) instead of byte-verbatim copying the fork's furniture/carpet/area/pet/matrix-effect/editor-overlay layers and PNG sprite-cache pipeline | open |  | 2026-09-21T02:52:06.449Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "05",
    "file": "packages/pixel-office/src/sprites/spriteData.ts",
    "line": null,
    "description": "getCharacterSprites always returns fully-transparent placeholder sprite frames — no PNG asset pipeline exists yet; D-02's real pixel-art sourcing is 05-02+ scope",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T02:52:05.148Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "05",
    "file": "packages/pixel-office/src/engine/renderer.ts",
    "line": null,
    "description": "Trimmed the forked renderer/types/constants to the IDLE-only tile-grid + one-character pipeline (human-approved) instead of byte-verbatim copying the fork's furniture/carpet/area/pet/matrix-effect/editor-overlay layers and PNG sprite-cache pipeline",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T02:52:06.449Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
