# 06-11 Live Evidence: CEO approval workflow against a real session

Generated: 2026-09-24T07:36:58.612Z (run 3, the passing run of record)
Command: `CEO_LIVE_SHOTS=<session scratchpad>/ceo-live-run3 node scripts/verify-ceo-approval-live.mjs`
Exit code: `0` (`CEO LIVE PROOF: PASS`, summary `"ok": true`)

## Versions

| Component | Version |
|-----------|---------|
| Claude Code CLI (`claude --version`) | 2.1.280 (Claude Code) |
| `@anthropic-ai/claude-agent-sdk` (packages/claude-adapter) | 0.3.278 |
| Node | v25.9.0 |
| pnpm | 12.4.2 (plain `pnpm` spawned fine; the `npx --yes pnpm@12.4.2` fallback was not needed) |
| Auth | developer's Claude subscription (no ANTHROPIC_API_KEY; the runtime strips it) |

## What ran (zero mocks)

- Test Postgres `pixelfirm_test` on 5434, reset with `pnpm --filter api db:test:down` / `db:test:up`, migrated with `apps/api/scripts/migrate.mjs` (0000-0004 applied).
- `apps/api` (`pnpm --filter api start`) on 127.0.0.1:3000 with generated throwaway secrets, `CEO_DEV_AUTH_BYPASS=1`, `CEO_ALLOWED_ORIGINS=http://127.0.0.1:5197`, `NODE_ENV=development`.
- `apps/web` Vite dev server on 127.0.0.1:5197 (`VITE_WS_BASE_URL=ws://127.0.0.1:3000`, the same browser token).
- Worker credential from `POST /admin/workers` (workerId `24193a03-4b3e-4faf-9534-6682fe3c626c`).
- Real worker (`pnpm --filter worker start`) hosting a real Claude Code session, `WORKER_AGENT_ID=live-ceo-agent`, task `live-ceo-task-1d67d3a5-1b20-49cf-ba0a-a3a5c5e1e94a`, title "CEO approval live proof".
- Disposable repo `C:\Users\shado\AppData\Local\Temp\pixelfirm-ceo-live-zNShhs` (one commit; `.claude/settings.local.json` = `{"permissions":{"allow":["Bash(node -e *)"]}}`), removed on teardown.
- Headless Chromium: page A on `/ceo` (dev bypass, driven by accessible names), page B on the office route recording every `/ws/browser` frame.

## The three decisions and their audit chains

| # | Decision | decisionId | CEO action on /ceo | Event chain (received_at, UTC) | decidedBy | outcome |
|---|----------|------------|--------------------|--------------------------------|-----------|---------|
| 1 | AskUserQuestion "Which greeting should the probe write?" | `58825261-2234-4194-85c1-ad1f92e8f194` | chose "hello", Send answers | approval_requested 07:34:31.980 -> decision_made 07:34:32.550 -> decision_applied 07:34:32.578 | dev-bypass@pixelfirm.invalid | allowed (answers `{"Which greeting should the probe write?":"hello"}`) |
| 2 | Bash `node -e "require('fs').writeFileSync('deploy-probe-approved.txt', 'hello')"` | `fa7b4566-f62e-400f-ba0c-ef307740946f` | held 125 011 ms, Approve, Approve and run | approval_requested 07:34:38.704 -> decision_made 07:36:44.378 -> decision_applied 07:36:44.398 | dev-bypass@pixelfirm.invalid | allowed |
| 3 | Bash `node -e "require('fs').writeFileSync('deploy-probe-rejected.txt', 'x')"` | `f1f79e5f-0000-4747-90bf-69c4a1a39e49` | Reject | approval_requested 07:36:53.897 -> decision_made 07:36:54.480 -> decision_applied 07:36:54.499 | dev-bypass@pixelfirm.invalid | denied |

Task status sequence: `starting, waiting_for_review, running, waiting_for_review, running, waiting_for_review, running, completed`.

## Assumptions settled live

- **A1 (PreToolUse "ask" beats a settings allow rule in SDK mode): HOLDS.** Both probe commands match the temp repo's `Bash(node -e *)` allow rule and both parked with a `ceo.approval_requested`. `deploy-probe-approved.txt` did not exist in any of the 24 hold samples; it appeared only after the approval, with content `hello`. `deploy-probe-rejected.txt` never existed. No fallback applied.
- **A2 (a canUseTool park survives minutes with a string prompt): HOLDS.** The approve decision was held 125 011 ms, past the 100 s watchdog. No `task.status_changed` `blocked` was recorded in any hold sample (or at all in the run), and the session continued: the approved call ran, the agent went on to the third step, and the task completed. No fallback applied.

## CEO room and privacy

- The CEO room (cols 20-22, rows 1-11) had 0 sprite pixels before the task. The agent reached it 6 891 ms after decision 2 appeared on /ceo (walk deadline 14 334 ms, derived from `WALK_SPEED_PX_PER_SEC`), and every hold sample from then on had sprite pixels there (minimum 2 694). The room was empty again 4 125 ms after the last decision.
- Office route: 28 `/ws/browser` frames, including the `waiting_for_review` pose. None of the 7 private strings (question text, "deploy-probe", the three decision titles, the context strings, the tool inputs) appear in any frame or in the final office DOM.

## Screenshots (outside the repo, referenced by path only)

- `/ceo` with the pending approve item: `C:\Users\shado\AppData\Local\Temp\claude\F--Sidegigs-PixelFirm\c87db4e1-e332-4b58-867b-830a20448dd8\scratchpad\ceo-live-run3\ceo-pending-queue.png`
- Office during the 125 s hold (agent in the CEO room with the amber question-mark glyph): `C:\Users\shado\AppData\Local\Temp\claude\F--Sidegigs-PixelFirm\c87db4e1-e332-4b58-867b-830a20448dd8\scratchpad\ceo-live-run3\office-ceo-room-hold.png`
- Office after the last decision: `C:\Users\shado\AppData\Local\Temp\claude\F--Sidegigs-PixelFirm\c87db4e1-e332-4b58-867b-830a20448dd8\scratchpad\ceo-live-run3\office-after.png`

## Earlier runs (recorded, not hidden)

- **Run 1 (finished 2026-09-24T07:28:53Z), exit 1.** 15 of 16 checks passed, including A1, A2, all three audit chains and privacy. The one failure was "the requesting agent is in the CEO room while its decision is pending": the first hold sample, taken 1.7 s after decision 2 appeared on /ceo, read 0 sprite pixels because the agent was still walking from its desk (the screenshot shows it mid-floor with the glyph). Every later sample read 3 069-3 222 px. This was a harness timing bug, not product behaviour: the script now waits for the agent's arrival (bounded by a walk deadline derived from the engine's walk speed) and then requires sprite pixels in every sample. The assertion itself was not relaxed.
- **Run 2 (finished 2026-09-24T07:33:03.308Z), exit 0.** All checks passed (arrival 6 424 ms). Its office screenshot was taken at the first arriving pixel, with the agent still in the doorway, so run 3 moved the screenshot one sample later. Run 3 is the run of record.

## JSON summary (run 3, verbatim from the script's stdout)

```json
{
  "ok": true,
  "date": "2026-09-24T07:36:58.612Z",
  "taskId": "live-ceo-task-1d67d3a5-1b20-49cf-ba0a-a3a5c5e1e94a",
  "agentId": "live-ceo-agent",
  "workerId": "24193a03-4b3e-4faf-9534-6682fe3c626c",
  "finalStatus": "completed",
  "holdMs": 125011,
  "arrivalMs": 6891,
  "holdSamples": [
    {
      "atMs": 6902,
      "blocked": false,
      "roomPx": 2694,
      "approvedFileExists": false
    },
    {
      "atMs": 11916,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 16984,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 22008,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 27036,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 32063,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 37080,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 42092,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 47116,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 52140,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 57153,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 62169,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 67184,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 72200,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 77220,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 82235,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 87266,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 92294,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 97324,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 102346,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 107363,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 112382,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 117401,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    },
    {
      "atMs": 122419,
      "blocked": false,
      "roomPx": 3222,
      "approvedFileExists": false
    }
  ],
  "approvedContent": "hello",
  "rejectedFileExists": false,
  "chains": {
    "question": {
      "decisionId": "58825261-2234-4194-85c1-ad1f92e8f194",
      "types": [
        "ceo.approval_requested",
        "ceo.decision_made",
        "ceo.decision_applied"
      ],
      "decidedBy": "dev-bypass@pixelfirm.invalid",
      "action": "approve",
      "answers": {
        "Which greeting should the probe write?": "hello"
      },
      "outcome": "allowed",
      "at": [
        "2026-09-24T07:34:31.980Z",
        "2026-09-24T07:34:32.550Z",
        "2026-09-24T07:34:32.578Z"
      ]
    },
    "approved": {
      "decisionId": "fa7b4566-f62e-400f-ba0c-ef307740946f",
      "types": [
        "ceo.approval_requested",
        "ceo.decision_made",
        "ceo.decision_applied"
      ],
      "decidedBy": "dev-bypass@pixelfirm.invalid",
      "action": "approve",
      "outcome": "allowed",
      "at": [
        "2026-09-24T07:34:38.704Z",
        "2026-09-24T07:36:44.378Z",
        "2026-09-24T07:36:44.398Z"
      ]
    },
    "rejected": {
      "decisionId": "f1f79e5f-0000-4747-90bf-69c4a1a39e49",
      "types": [
        "ceo.approval_requested",
        "ceo.decision_made",
        "ceo.decision_applied"
      ],
      "decidedBy": "dev-bypass@pixelfirm.invalid",
      "action": "reject",
      "outcome": "denied",
      "at": [
        "2026-09-24T07:36:53.897Z",
        "2026-09-24T07:36:54.480Z",
        "2026-09-24T07:36:54.499Z"
      ]
    }
  },
  "officeFrames": 28,
  "shots": [
    "C:\\Users\\shado\\AppData\\Local\\Temp\\claude\\F--Sidegigs-PixelFirm\\c87db4e1-e332-4b58-867b-830a20448dd8\\scratchpad\\ceo-live-run3\\ceo-pending-queue.png",
    "C:\\Users\\shado\\AppData\\Local\\Temp\\claude\\F--Sidegigs-PixelFirm\\c87db4e1-e332-4b58-867b-830a20448dd8\\scratchpad\\ceo-live-run3\\office-ceo-room-hold.png",
    "C:\\Users\\shado\\AppData\\Local\\Temp\\claude\\F--Sidegigs-PixelFirm\\c87db4e1-e332-4b58-867b-830a20448dd8\\scratchpad\\ceo-live-run3\\office-after.png"
  ],
  "checks": [
    {
      "name": "CEO room empty before the task starts",
      "pass": true,
      "detail": {
        "spritePx": 0
      }
    },
    {
      "name": "approved probe ran exactly as parked",
      "pass": true,
      "detail": {
        "content": "hello"
      }
    },
    {
      "name": "rejected probe never ran",
      "pass": true,
      "detail": {
        "exists": false
      }
    },
    {
      "name": "exactly three approval requests: one question, one approved probe, one rejected probe",
      "pass": true,
      "detail": {
        "total": 3,
        "question": 1,
        "approved": 1,
        "rejected": 1
      }
    },
    {
      "name": "question: requested -> decision_made (dev-bypass@pixelfirm.invalid, approve) -> decision_applied (allowed)",
      "pass": true,
      "detail": {
        "decisionId": "58825261-2234-4194-85c1-ad1f92e8f194",
        "types": [
          "ceo.approval_requested",
          "ceo.decision_made",
          "ceo.decision_applied"
        ],
        "decidedBy": "dev-bypass@pixelfirm.invalid",
        "action": "approve",
        "answers": {
          "Which greeting should the probe write?": "hello"
        },
        "outcome": "allowed",
        "at": [
          "2026-09-24T07:34:31.980Z",
          "2026-09-24T07:34:32.550Z",
          "2026-09-24T07:34:32.578Z"
        ]
      }
    },
    {
      "name": "approved: requested -> decision_made (dev-bypass@pixelfirm.invalid, approve) -> decision_applied (allowed)",
      "pass": true,
      "detail": {
        "decisionId": "fa7b4566-f62e-400f-ba0c-ef307740946f",
        "types": [
          "ceo.approval_requested",
          "ceo.decision_made",
          "ceo.decision_applied"
        ],
        "decidedBy": "dev-bypass@pixelfirm.invalid",
        "action": "approve",
        "outcome": "allowed",
        "at": [
          "2026-09-24T07:34:38.704Z",
          "2026-09-24T07:36:44.378Z",
          "2026-09-24T07:36:44.398Z"
        ]
      }
    },
    {
      "name": "rejected: requested -> decision_made (dev-bypass@pixelfirm.invalid, reject) -> decision_applied (denied)",
      "pass": true,
      "detail": {
        "decisionId": "f1f79e5f-0000-4747-90bf-69c4a1a39e49",
        "types": [
          "ceo.approval_requested",
          "ceo.decision_made",
          "ceo.decision_applied"
        ],
        "decidedBy": "dev-bypass@pixelfirm.invalid",
        "action": "reject",
        "outcome": "denied",
        "at": [
          "2026-09-24T07:36:53.897Z",
          "2026-09-24T07:36:54.480Z",
          "2026-09-24T07:36:54.499Z"
        ]
      }
    },
    {
      "name": "A1: each allow-listed probe parked for a CEO decision before it could run",
      "pass": true,
      "detail": {
        "approvedFileSeenDuringHold": false,
        "samples": 24
      }
    },
    {
      "name": "A2 / D-03: the decision was held at least 125 s",
      "pass": true,
      "detail": {
        "holdMs": 125011
      }
    },
    {
      "name": "A2 / D-03: no blocked status while the decision waited",
      "pass": true,
      "detail": {
        "samples": 24
      }
    },
    {
      "name": "A2: the session continued after the held decision",
      "pass": true,
      "detail": {
        "finalStatus": "completed"
      }
    },
    {
      "name": "CEO-01: the requesting agent is in the CEO room while its decision is pending",
      "pass": true,
      "detail": {
        "arrivalMs": 6891,
        "walkDeadlineMs": 14334,
        "minRoomPx": 2694
      }
    },
    {
      "name": "CEO-01: the CEO room is empty after the last decision",
      "pass": true,
      "detail": {
        "roomPx": 0,
        "msAfterLastDecision": 4125
      }
    },
    {
      "name": "the task reached a terminal status",
      "pass": true,
      "detail": {
        "finalStatus": "completed",
        "statuses": [
          "starting",
          "waiting_for_review",
          "running",
          "waiting_for_review",
          "running",
          "waiting_for_review",
          "running",
          "completed"
        ]
      }
    },
    {
      "name": "the office relay carried frames, including the waiting pose",
      "pass": true,
      "detail": {
        "frames": 28
      }
    },
    {
      "name": "privacy: no decision text in any office frame or the office DOM",
      "pass": true,
      "detail": {
        "privateStrings": 7,
        "leaks": []
      }
    }
  ]
}
```
