# Asset Licences — `packages/pixel-office`

Scoped per Phase 5's D-05: only the assets this phase's MVP actually wires into
the renderer (`packages/pixel-office`, the one rendered floor, the office
layout, and whichever animation assets D-02's sourcing triage landed on).
This is **not** a full audit of every asset bundled with the
`pixel-agents-hq/pixel-agents` fork — assets not used by this phase are
tracked as explicitly deferred below, to be re-audited when actually used or
before any public/commercial distribution (PROJECT.md's existing "audit
before commercial distribution" note).

Fork source: <https://github.com/pixel-agents-hq/pixel-agents>, commit
`3537e140c2094761beae748592aeb92ece8edfdd` (`main`, fetched 2026-09-21).

## 1. Confirmed CC0

- **MetroCity character pack** — credited in the fork's own README ("Diverse
  characters ... based on the amazing work of [JIK-A-4, Metro City]"). This
  is the character sprite source `packages/pixel-office/src/sprites/spriteData.ts`
  is built to consume (currently returning transparent placeholder frames —
  no real pixel art has been wired in yet, per 05-01-SUMMARY.md's documented
  stub; the CC0 credit applies to the pack this module is designed to load).

## 2. MIT (fork's own code)

- `packages/pixel-office/src/{engine,layout,colorize.ts,types.ts,constants.ts}`
  — forked from `pixel-agents-hq/pixel-agents` by Pablo De Lucca, MIT. Licence
  text copied verbatim to `packages/pixel-office/LICENSE`. Every forked file
  under `packages/pixel-office/src/` carries its own 3-line attribution header
  (source URL, commit SHA, licence).

## 3. Provenance-undocumented, used this phase

**None.** This phase's one rendered floor (`packages/pixel-office/src/index.ts`'s
`buildDefaultTileMap`) draws every tile as a flat solid-colour fill —
`FALLBACK_FLOOR_COLOR` / `WALL_COLOR` from `packages/pixel-office/src/constants.ts`
— via `engine/renderer.ts`'s `fillRect` calls. No furniture, floor-tile,
wall-tile, or carpet PNG/image assets from the fork are wired into
`packages/pixel-office` this phase (verified: `grep -r "furniture\|carpet\|\.png\|assets/"
packages/pixel-office/src` returns only comment text about *dropped* subsystems
and the identifier `WALL_COLOR`, no actual asset-path references). Because no
such asset is actually loaded by this phase's code, this status stays
undocumented rather than upgraded — the fork's own furniture/floor/wall/
carpet/pet PNG assets (which the fork's README credits nowhere beyond the
character pack) remain entirely untouched by this phase and stay tracked in
§4 below.

## 4. Deferred — not used this phase

Every fork asset pack not wired into this phase's one floor, to be
re-audited when actually used or before commercial distribution (D-05):

- Furniture sprite pack (`webview-ui/public/assets/furniture/` in the fork) —
  no separate credit found in the fork's README beyond the character pack;
  not loaded by this repo's trimmed renderer.
- Floor-tile sprite pack (`webview-ui/public/assets/floors/`) — same: no
  separate credit, not loaded (this repo uses flat colour fills instead).
- Wall-tile sprite pack (`webview-ui/public/assets/walls/`) — same, not
  loaded.
- Carpet sprite pack (`webview-ui/public/assets/carpets/`) — same, not
  loaded.
- Pet sprite pack (`webview-ui/public/assets/pets/`) — same, not loaded; no
  pet entity type exists in this repo's trimmed `types.ts` at all.

If any of these are wired in by a future plan, treat them the same as §3
would require: "no separate credit found in pixel-agents-hq's README beyond
the character pack; treated as MIT-covered by default per the repo's blanket
licence with no contrary evidence found; flagged for a stronger check before
any commercial distribution" — never silently upgraded to "confirmed."

## Attribution in the running app

`apps/web` renders a visible, always-on attribution line crediting this
fork and the MetroCity pack (see `apps/web/src/App.tsx`) — attribution is not
only recorded here.
