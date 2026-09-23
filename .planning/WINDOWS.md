---
schema_version: 1
open_count: 9
waived_count: 0
fixed_count: 0
total_count: 9
last_updated: 2026-09-23T07:14:07.702Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 05 | stub | packages/pixel-office/src/sprites/spriteData.ts |  | getCharacterSprites always returns fully-transparent placeholder sprite frames — no PNG asset pipeline exists yet; D-02's real pixel-art sourcing is 05-02+ scope | open |  | 2026-09-21T02:52:05.148Z |  |
| 2 | 05 | deviation | packages/pixel-office/src/engine/renderer.ts |  | Trimmed the forked renderer/types/constants to the IDLE-only tile-grid + one-character pipeline (human-approved) instead of byte-verbatim copying the fork's furniture/carpet/area/pet/matrix-effect/editor-overlay layers and PNG sprite-cache pipeline | open |  | 2026-09-21T02:52:06.449Z |  |
| 3 | 05 | deviation | packages/pixel-office/src/engine/renderer.ts |  | Bubble overlay Y clamped to canvas top; a row-1 agent's status glyph now overlaps its own sprite head instead of floating clear above it — legibility trade needs human eyeball (OFFICE-03) | open |  | 2026-09-21T06:13:09.430Z |  |
| 4 | 05 | unmet-truth | scripts/verify-pixel-office-live.mjs |  | No producer of agent.online exists; the live proof substitutes task.status_changed and does not close the agent.online gap | open |  | 2026-09-21T06:13:10.735Z |  |
| 5 | 05 | unmet-truth | packages/pixel-office/src/engine/renderer.ts |  | 05-10: glyph legibility at typical stream/viewing scale and grayscale/colourblind survivability remain judgment-tier and unverified — routed to 05-12 human verification (coverage D6) | open |  | 2026-09-21T09:11:22.159Z |  |
| 6 | 05 | deviation | apps/api/src/routes/ws-browser.test.ts |  | Route-level CR-03 case is a timing race that passed against the unfixed code; browser-connections.test.ts Test 2 is the deterministic regression detector. Needs a gated db.select spy to be reliable. | open |  | 2026-09-21T09:55:30.785Z |  |
| 7 | 05 | unrun-verify | scripts/verify-pixel-office-live.mjs |  | 05-12: the live proof's own end-to-end run (node scripts/verify-pixel-office-live.mjs, twice in succession) was never executed — it recreates a Docker volume and starts two dev servers, so it is a deliberate human run. All four truths are structurally complete and node --check clean, but no truth has been observed passing on a real canvas since the restructure. | open |  | 2026-09-21T10:21:10.862Z |  |
| 8 | 05 | unmet-truth | references/ASSET-LICENSES.md |  | 05-12: MetroCity provenance link 2 is open — the PACK is CC0 at the publisher's cited itch.io listing, but that the shipped file (the fork's char_0.png, decoded) IS that pack's art rests on the fork's README credit alone. Closes on 05-VERIFICATION.md human-verification item 4 (visual comparison against the upstream art). | open |  | 2026-09-21T10:21:12.655Z |  |
| 9 | 05 | deviation | scripts/verify-pixel-office-live.mjs |  | 05-38 plan specified PIXEL_OFFICE_SHOTS=.gsd/uat-shots-05-38, which the harness refuses by design (in-repo, 05-21 T-05-21-02); frames written to the session scratchpad instead | open |  | 2026-09-23T07:14:07.702Z |  |

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
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "05",
    "file": "packages/pixel-office/src/engine/renderer.ts",
    "line": null,
    "description": "Bubble overlay Y clamped to canvas top; a row-1 agent's status glyph now overlaps its own sprite head instead of floating clear above it — legibility trade needs human eyeball (OFFICE-03)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T06:13:09.430Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "unmet-truth",
    "phase": "05",
    "file": "scripts/verify-pixel-office-live.mjs",
    "line": null,
    "description": "No producer of agent.online exists; the live proof substitutes task.status_changed and does not close the agent.online gap",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T06:13:10.735Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 5,
    "kind": "unmet-truth",
    "phase": "05",
    "file": "packages/pixel-office/src/engine/renderer.ts",
    "line": null,
    "description": "05-10: glyph legibility at typical stream/viewing scale and grayscale/colourblind survivability remain judgment-tier and unverified — routed to 05-12 human verification (coverage D6)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T09:11:22.159Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "05",
    "file": "apps/api/src/routes/ws-browser.test.ts",
    "line": null,
    "description": "Route-level CR-03 case is a timing race that passed against the unfixed code; browser-connections.test.ts Test 2 is the deterministic regression detector. Needs a gated db.select spy to be reliable.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T09:55:30.785Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "scripts/verify-pixel-office-live.mjs",
    "line": null,
    "description": "05-12: the live proof's own end-to-end run (node scripts/verify-pixel-office-live.mjs, twice in succession) was never executed — it recreates a Docker volume and starts two dev servers, so it is a deliberate human run. All four truths are structurally complete and node --check clean, but no truth has been observed passing on a real canvas since the restructure.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T10:21:10.862Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 8,
    "kind": "unmet-truth",
    "phase": "05",
    "file": "references/ASSET-LICENSES.md",
    "line": null,
    "description": "05-12: MetroCity provenance link 2 is open — the PACK is CC0 at the publisher's cited itch.io listing, but that the shipped file (the fork's char_0.png, decoded) IS that pack's art rests on the fork's README credit alone. Closes on 05-VERIFICATION.md human-verification item 4 (visual comparison against the upstream art).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-21T10:21:12.655Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "05",
    "file": "scripts/verify-pixel-office-live.mjs",
    "line": null,
    "description": "05-38 plan specified PIXEL_OFFICE_SHOTS=.gsd/uat-shots-05-38, which the harness refuses by design (in-repo, 05-21 T-05-21-02); frames written to the session scratchpad instead",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-23T07:14:07.702Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
