---
phase: 05-pixel-office-renderer
plan: 06
subsystem: ui
tags: [pngjs, sprites, metrocity, pixel-art, vitest]

# Dependency graph
requires:
  - phase: 05-pixel-office-renderer
    provides: "05-01's forked spriteData.ts/CharacterSprites shape and engine/renderer.ts's getCharacterSprites() call site"
provides:
  - "Real, non-transparent MetroCity pixel data for getCharacterSprites() — walk/typing/reading poses in all 4 directions"
  - "Reusable decode-metrocity-sprites.mjs script for regenerating character-metrocity.json from the pinned-commit source PNG"
affects: ["05-verification", "phase 06 (CEO dashboard, if it renders characters)"]

actuals:
  tokens: 48800
  tasks: 2
  commits: 1

tech-stack:
  added: ["pngjs@^7.0.0 (devDependency)", "@types/pngjs@^6.0.5 (devDependency)"]
  patterns: ["Build-time PNG decode into committed JSON data asset, consumed via plain ES JSON import — no runtime pngjs dependency in the shipped browser bundle"]

key-files:
  created:
    - packages/pixel-office/scripts/decode-metrocity-sprites.mjs
    - packages/pixel-office/src/sprites/character-metrocity.json
    - packages/pixel-office/src/sprites/spriteData.test.ts
  modified:
    - packages/pixel-office/src/sprites/spriteData.ts
    - packages/pixel-office/package.json
    - packages/pixel-office/tsconfig.json
    - references/ASSET-LICENSES.md

key-decisions:
  - "Verified the plan's assumed char_0.png geometry (112x96, 3 direction rows x 7 frames of 16x32) and frame-to-pose mapping (walk=[0,1,2,1], typing=[3,4], reading=[5,6]) directly against the fork's own core/src/assets/pngDecoder.ts, constants.ts, and webview-ui/src/office/sprites/spriteData.ts before finalizing slice offsets — all matched exactly, no correction needed"
  - "Used the fork's own PNG.sync.read via a fetched Buffer (not a locally checked-in binary) so the decode script stays reproducible from the pinned commit SHA alone"
  - "Kept the plan's specified alpha<128 binary transparent/opaque threshold (a deliberate simplification vs the fork's own alpha<2 threshold) — flagged as a ponytail known-ceiling comment in the script header rather than silently matching the fork's stricter cutoff"

requirements-completed: [OFFICE-01, OFFICE-02]

coverage:
  - id: D1
    description: "getCharacterSprites() returns real, non-transparent MetroCity pixel data for walk/typing/reading poses in all 4 directions"
    requirement: "OFFICE-01"
    verification:
      - kind: unit
        ref: "packages/pixel-office/src/sprites/spriteData.test.ts#returns non-transparent pixel data for walk/typing/reading in all 4 directions"
        status: pass
      - kind: unit
        ref: "packages/pixel-office/src/sprites/spriteData.test.ts#mirrors LEFT frames from RIGHT frames"
        status: pass
    human_judgment: true
    rationale: "The task's own acceptance criteria recommend a human/visual spot-check that the rendered character actually resembles the fork's MetroCity art (not a mis-decoded/corrupted frame) — unit tests prove non-transparency and shape but cannot judge visual correctness."
  - id: D2
    description: "references/ASSET-LICENSES.md accurately describes the wired-in MetroCity asset instead of claiming transparent placeholder frames"
    requirement: "OFFICE-02"
    verification:
      - kind: other
        ref: "grep -c \"transparent placeholder frames\" references/ASSET-LICENSES.md returns 0"
        status: pass
    human_judgment: false

duration: ~20min (Task 2, this session)
completed: 2026-09-21
status: complete
---

# Phase 05 Plan 06: Real MetroCity Character Sprites Summary

**Decoded the fork's own pinned-commit char_0.png with pngjs into a committed character-metrocity.json data asset, replacing getCharacterSprites()'s transparent emptySprite() placeholders with real, non-transparent pixel data — closing 05-VERIFICATION.md's Truth 1 invisible-sprite gap.**

## Performance

- **Duration:** ~20 min for Task 2 (Task 1 was a human-verify checkpoint from a prior session)
- **Completed:** 2026-09-21T05:43:59Z
- **Tasks:** 2 (Task 1: checkpoint, human-approved in a prior session; Task 2: auto)
- **Files modified:** 7 (4 modified, 3 created)

## Accomplishments

- Added `pngjs`/`@types/pngjs` as devDependencies of `packages/pixel-office`, scoped to the one-time decode script only (never imported by anything under `src/`, so never bundled into `apps/web`)
- Wrote `packages/pixel-office/scripts/decode-metrocity-sprites.mjs`, which fetches the fork's `char_0.png` at the pinned commit `3537e140c2094761beae748592aeb92ece8edfdd` and decodes it into `character-metrocity.json` (`{sourceUrl, commitSha, down: SpriteData[7], up: SpriteData[7], right: SpriteData[7]}`)
- Independently verified the plan's assumed geometry and frame-role mapping against the fork's real `core/src/assets/pngDecoder.ts`, `constants.ts`, and `webview-ui/src/office/sprites/spriteData.ts` before finalizing slice offsets — confirmed 112x96, 3 rows (down/up/right) x 7 columns (16x32 each), walk=[0,1,2,1]/typing=[3,4]/reading=[5,6]; no discrepancy found
- Rewrote `getCharacterSprites()` to build `CharacterSprites` from the decoded JSON, with LEFT mirrored from RIGHT via a new local `flipHorizontal` helper, preserving the existing cache-key pattern, exported signature, and hueShift-via-`adjustSprite` behavior exactly
- Added `spriteData.test.ts` asserting non-transparent output for every pose/direction, correct 16x32 frame dimensions, LEFT/RIGHT mirroring, and signature stability
- Updated `references/ASSET-LICENSES.md` §1 to state the real asset is wired in, naming the exact source URL, commit SHA, and decode script

## Task Commits

1. **Task 1: Package legitimacy check — pngjs** — checkpoint, human-approved in a prior session (no commit; checkpoint tasks don't produce their own commit)
2. **Task 2: Decode the fork's real MetroCity char_0.png into non-transparent CharacterSprites data** - `5a8beb5` (feat)

**Plan metadata:** (this SUMMARY's own commit, made immediately after this file)

## Files Created/Modified

- `packages/pixel-office/scripts/decode-metrocity-sprites.mjs` - Reusable Node script (pngjs) that fetches and decodes the pinned-commit char_0.png into the committed JSON data asset
- `packages/pixel-office/src/sprites/character-metrocity.json` - Decoded MetroCity pixel data: down/up/right x 7 frames of 16x32 hex-string cells
- `packages/pixel-office/src/sprites/spriteData.ts` - `getCharacterSprites()` now builds real `CharacterSprites` from the decoded JSON instead of `emptySprite()`
- `packages/pixel-office/src/sprites/spriteData.test.ts` - Asserts non-transparency, correct dimensions, and LEFT/RIGHT mirroring
- `packages/pixel-office/package.json` - Added `pngjs`/`@types/pngjs` devDependencies
- `packages/pixel-office/tsconfig.json` - Added `resolveJsonModule: true`
- `references/ASSET-LICENSES.md` - §1 now accurately describes the wired-in MetroCity asset

## Decisions Made

- Verified the plan's assumed `char_0.png` geometry and frame-to-pose mapping directly against the fork's own source (`pngDecoder.ts`, `constants.ts`, `webview-ui/src/office/sprites/spriteData.ts`) before finalizing the decode script's slice offsets, per the plan's explicit instruction — all values matched exactly (112x96; down/up/right rows; walk=[0,1,2,1], typing=[3,4], reading=[5,6]), so no correction to the plan's assumptions was needed.
- Kept the plan's specified alpha<128 binary transparent/opaque threshold even though the fork's own `rgbaToHex` uses a stricter alpha<2 cutoff — this is the plan's own deliberate, explicitly-instructed simplification (MetroCity's pixel art has no genuine semi-transparent pixels in practice), flagged with a `ponytail:` comment in the decode script's header noting the upgrade path (carry an explicit `#RRGGBBAA` alpha suffix, already supported by this repo's `SpriteData` convention) if a future asset needs it.
- Used `import ... with { type: "json" }` (TypeScript's NodeNext-compatible JSON import attribute syntax) rather than the plan's literal bare `import characterData from "./character-metrocity.json";` — the root `tsconfig.json`'s `module: "NodeNext"` requires the attribute for type-correctness; Vitest's esbuild-based transform accepts both forms identically, so this has zero effect on the verify commands' outcome, but keeps the file type-check-clean under this repo's actual module setting.

## Deviations from Plan

None - plan executed exactly as written. The plan's own explicit pre-flight instruction — verify the assumed slice geometry and frame semantics against the fork's real source before finalizing offsets — was carried out and confirmed the plan's assumptions were already correct, so no geometry/mapping correction was required.

## Issues Encountered

- Windows/Git-Bash path-translation friction while fetching and manually spot-checking `char_0.png`'s dimensions with pngjs before writing the script (bash's `/tmp` and native Node's path resolution disagreed on the same string). Resolved by using absolute POSIX paths for `curl`/`cp` and package-relative paths for the `node -e` sanity checks; does not affect the committed script, which uses `fetch()` directly and never touches `/tmp`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `getCharacterSprites()` now returns real MetroCity pixel data end-to-end; `engine/characters.ts` and `engine/renderer.ts` required zero changes to consume it.
- A human/visual spot-check (via the already-running dev renderer or a quick canvas render of `character-metrocity.json`) that the decoded character actually resembles the fork's MetroCity art is recommended before considering 05-VERIFICATION.md's Truth 1 fully closed — the unit tests prove non-transparency and correct shape, not visual correctness. Flagged in this SUMMARY's `coverage` block (D1, `human_judgment: true`) for `/gsd-verify-work` to route to UAT.
- `packages/pixel-office`'s test suite is fully green (37/37 across 5 files); no regressions in status-mapping/index/handoff-choreography/dialogue-templates.

---
*Phase: 05-pixel-office-renderer*
*Completed: 2026-09-21*

## Self-Check: PASSED

All created files confirmed present on disk; commit `5a8beb5` confirmed in git log.
