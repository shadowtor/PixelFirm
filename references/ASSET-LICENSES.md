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

## 1. Pack CC0 at source; the loaded file's identity rests on the fork's credit

- **MetroCity character pack** (JIK-A-4).

  This section previously read "Confirmed CC0" on the sole evidence of a credit
  line in the fork's README — which §4 of this same document classifies as
  insufficient (WR-09). The tier below is what the evidence actually supports,
  split into the two separate links it depends on.

  **Link 1 — the pack's licence. Verified at the primary source.**
  <https://jik-a-4.itch.io/metrocity-free-topdown-character-pack> ("MetroCity -
  Free Top Down Character Pack by JIK-A-4") states, in the publisher's own
  listing metadata, *Asset license: Creative Commons Zero v1.0 Universal*.
  Fetched directly and re-checked 2026-09-21 (HTTP 200) during 05-12; the same
  URL was recorded in `.planning/research/PITFALLS.md`'s source list at the
  2026-09-18 research pass and had simply never been cited in this document.
  This is a citable primary source, so the rule in §4 is satisfied rather than
  bypassed: the upgrade is cited, not silent.

  **Link 2 — that the file we ship IS that pack's art. Credit only, not
  verified.** What `packages/pixel-office/src/sprites/spriteData.ts` loads is
  the FORK's `webview-ui/public/assets/characters/char_0.png` at pinned commit
  `3537e140c2094761beae748592aeb92ece8edfdd`, decoded by
  `packages/pixel-office/scripts/decode-metrocity-sprites.mjs` into
  `packages/pixel-office/src/sprites/character-metrocity.json` (05-06), and
  redistributed here as a derivative. That this PNG is the CC0 pack's art
  rather than modified, re-drawn, or a different pack entirely rests on the
  fork's README credit ("Diverse characters ... based on the amazing work of
  [JIK-A-4, Metro City]") — a credit line, not a provenance record. The word
  "based on" is doing real work there and is not evidence of identity.

  **What would close link 2.** A visual comparison of a rendered character
  against the upstream pack's own art (05-VERIFICATION.md human-verification
  item 4, requested by 05-05 and 05-06 and still never performed), or a
  file-level match between the fork's `char_0.png` and a file in the itch.io
  download. Until one of those lands, this repo credits the pack and points
  here rather than asserting a licence over the specific bytes it ships.

## 2. MIT (fork's own code)

- `packages/pixel-office/src/{engine,layout,colorize.ts,types.ts,constants.ts}`
  — forked from `pixel-agents-hq/pixel-agents` by Pablo De Lucca, MIT. Licence
  text copied verbatim to `packages/pixel-office/LICENSE`. Every forked file
  under `packages/pixel-office/src/` carries its own 3-line attribution header
  (source URL, commit SHA, licence).

## 3. Originals authored in this repo, used this phase

The 12 bubble/badge glyph assets under `packages/pixel-office/src/sprites/` are
loaded by the shipped renderer — `bubbleSprites.ts` imports all twelve and
`engine/renderer.ts` paints them — so this section previously read "None" while
a dozen assets in use were unlisted (05-12, WR-09).

They are **originals authored in this repo**, under this repo's own licence,
not third-party assets of undocumented provenance. Verified against this repo's
own history rather than assumed: `git log --diff-filter=A` reports each file
first appearing here, and 05-01's documented scope trim means no bubble/badge
JSON existed anywhere in this repo before 05-02.

| Asset | First added | Origin |
|---|---|---|
| `bubble-blocked.json`, `bubble-completed.json`, `bubble-failed.json`, `badge-planning.json`, `badge-researching.json`, `badge-testing.json`, `badge-reviewing.json`, `badge-discussing.json`, `badge-deploying.json` | `39fc0b0` (05-02) | Hand-designed 11x13 pixel grids, authored here |
| `bubble-permission.json`, `bubble-waiting.json`, `bubble-handoff-task.json` | `9df473a` (05-07) | Hand-designed 11x13 pixel grids, authored here |

Two of them (`bubble-permission`, `bubble-waiting`) take their *concept* from
the fork's own bubble semantics, as `status/status-mapping.ts` records — but
the fork ships no such JSON asset and none was ever copied; the pixel grids are
this repo's. The fork's code is MIT in any case (§2).

### Third-party assets of undocumented provenance

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
any commercial distribution" — never silently upgraded to confirmed.

## Attribution in the running app

`apps/web` renders a visible, always-on attribution line crediting this
fork and the MetroCity pack (see `apps/web/src/App.tsx`) — attribution is not
only recorded here. That line claims exactly what §1 and §2 support and no
more: the fork's MIT licence, which is documented, and a credit for the
character pack without a licence assertion, which is not. If §1 is upgraded,
the footer is upgraded with it — `apps/web/src/App.test.tsx` pins the complete
sentence, so the two cannot drift apart silently.
