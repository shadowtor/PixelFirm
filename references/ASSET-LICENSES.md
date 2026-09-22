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

## 1. Pack CC0 at source; the loaded file's outfit layer verified against the pack, hair layer credit-only

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

  Re-fetched 2026-09-22 (HTTP 200) during 05-22: the listing still states
  *Asset license: Creative Commons Zero v1.0 Universal* and "Credits are not
  necessary but would be appreciated.", and offers `MetroCity.rar` (44 kB) and
  `MetroCity 2.0.rar` (33 kB) as downloads.

  **Link 2 — that the file we ship IS that pack's art. Verified for the outfit
  layer; the hair layer is credit only.** What `packages/pixel-office/src/sprites/spriteData.ts` loads is
  the FORK's `webview-ui/public/assets/characters/char_0.png` at pinned commit
  `3537e140c2094761beae748592aeb92ece8edfdd`, decoded by
  `packages/pixel-office/scripts/decode-metrocity-sprites.mjs` into
  `packages/pixel-office/src/sprites/character-metrocity.json` (05-06), and
  redistributed here as a derivative. That this PNG is the CC0 pack's art
  rather than modified, re-drawn, or a different pack entirely rests on the
  fork's README credit ("Diverse characters ... based on the amazing work of
  [JIK-A-4, Metro City]") — a credit line, not a provenance record. The word
  "based on" is doing real work there and is not evidence of identity.

  *Outfit layer — verified (UAT 05 test 3, 2026-09-22).* The user supplied the
  itch.io downloads. `MetroCity 2.0.rar` (a download on the CC0 character-pack
  listing above) contains `Suit.png`; its frame at (0,64) is pixel-identical to
  the outfit layer of the fork's `char_0.png` (commit `3537e140`) frame 0 at
  offset (8,0): 110/110 opaque pixels identical. That is a file-level match
  against the primary source, so the outfit layer's licence is the listing's
  CC0.

  *Hair layer — credit only.* The hair layer was not found in the supplied
  downloads (it comes from the base free character pack), so for that layer
  identity still rests on the fork's README credit. The user confirmed the art
  is fine to use even if a newer pack release differs (UAT 05 test 3).

  **What would close link 2.** Only the hair layer is open: a file-level match
  between the hair pixels of the fork's `char_0.png` and a file in an itch.io
  download. Until then, this repo credits the pack for the whole figure and
  asserts CC0 only for the verified outfit layer.

## 1a. MetroCity Interior pack (office floor, wall and furniture) — CC0 at source, files verified

- **Primary source.** <https://jik-a-4.itch.io/metrocity> ("MetroCity - Free
  Top Down Interior Asset Pack by JIK-A-4"), fetched 2026-09-22 (HTTP 200)
  during 05-22. The listing states *Asset license: Creative Commons Zero v1.0
  Universal* and "Credits are not necessary but would be appreciated.", and
  offers one download, `Interior.rar` (180 kB).
- **Files.** The user supplied `Interior.rar` (185,267 bytes, uploaded
  2026-09-22) during UAT 05 and gave explicit permission to use the MetroCity
  packs ("you are OK to use them if it makes things easier", recorded as user
  context in `05-22-PLAN.md`; see also UAT 05 test 3). Six sheets were copied
  byte-for-byte into `packages/pixel-office/assets/metrocity-interior/`,
  keeping the pack's own paths:

  | Sheet | SHA-256 |
  |---|---|
  | `Home/TilesHouse.png` | `37f8f6d6244f2d2810c22eb8839c0581f89770e4932b562e2244a5ede6bb85d3` |
  | `Home/LivingRoom-Sheet.png` | `fe930906725c09d210fc456fbf77a349c3d437735abcdc6414d6b70c9b018b5f` |
  | `Home/Flowers-Sheet.png` | `ef7dcd09ed591af7f0c29a678b9073f2f05772b956d335cadc9357e908ee9383` |
  | `Home/Cupboard-Sheet.png` | `7cc27c7fdc40c6cde35cb9e9ae5fe1384796ace448e67a1922c0e86abd2ef4fd` |
  | `Home/Paintings-Sheet.png` | `2a880955f8111ef1fcf41c726b9441aa5294d3624e7731d58bb3f90691e20322` |
  | `Hospital/Miscellaneous-Sheet.png` | `b0590124204a5515a7f342973d0dd72c280c22ef758b2ac2f91f0a94157a77df` |

- **Derivative.** `packages/pixel-office/scripts/decode-metrocity-interior.mjs`
  decodes those sheets (no network access) into
  `packages/pixel-office/src/sprites/office-metrocity.json`, which records each
  sheet's SHA-256 and each sprite's source rect. `--check` re-decodes and fails
  on any difference; `officeSprites.test.ts` runs it.

  | Sprite | Sheet | Rect (x, y, w, h) |
  |---|---|---|
  | `floorTiles` (four 16x16 quadrants) | `Home/TilesHouse.png` | 96, 128, 32, 32 |
  | `wallTop` | `Home/TilesHouse.png` | 16, 24, 16, 16 |
  | `desk` | `Home/LivingRoom-Sheet.png` | 25, 15, 46, 30 |
  | `plant` | `Home/Flowers-Sheet.png` | 22, 3, 20, 41 |
  | `plantSmall` | `Home/Flowers-Sheet.png` | 89, 23, 14, 21 |
  | `bookcase` | `Home/Cupboard-Sheet.png` | 270, 20, 36, 43 |
  | `cabinet` | `Hospital/Miscellaneous-Sheet.png` | 1333, 20, 22, 27 |
  | `painting` | `Home/Paintings-Sheet.png` | 73, 7, 14, 16 |

  `monitorBack` in the same JSON is not from the pack; it is an original (§3).
- **Credit.** MetroCity Interior pack by JIK-A-4. Credit is given even though
  the listing says it is not required.

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
| `monitorBack` in `office-metrocity.json` | 05-22 | Hand-designed 10x9 monitor seen from behind, authored inline in `packages/pixel-office/scripts/decode-metrocity-interior.mjs` (the Interior pack has no small monitor back) |

Two of them (`bubble-permission`, `bubble-waiting`) take their *concept* from
the fork's own bubble semantics, as `status/status-mapping.ts` records — but
the fork ships no such JSON asset and none was ever copied; the pixel grids are
this repo's. The fork's code is MIT in any case (§2).

### Third-party assets of undocumented provenance

**None.** The office floor tiles, top wall and furniture sprites come from
the MetroCity Interior pack, whose provenance is documented in §1a (CC0 at the
primary source, committed sheets pinned by SHA-256), so they are not of
undocumented provenance. They are decoded into `office-metrocity.json` by
05-22 and wired into the renderer by 05-24. The side and bottom wall border
stays a flat `WALL_COLOR` fill from `packages/pixel-office/src/constants.ts`.
No furniture, floor-tile, wall-tile, carpet or pet PNG from the fork is wired
into `packages/pixel-office`: the fork's own packs (which the fork's README
credits nowhere beyond the character pack) stay untouched and tracked in §4
below.

## 4. Deferred — not used this phase

Every fork asset pack not wired into this phase's one floor, to be
re-audited when actually used or before commercial distribution (D-05). The
office furniture, floor and wall sprites come from the MetroCity Interior pack
(§1a), not from any of the fork's packs below.

- Furniture sprite pack (`webview-ui/public/assets/furniture/` in the fork) —
  no separate credit found in the fork's README beyond the character pack;
  not loaded by this repo's trimmed renderer.
- Floor-tile sprite pack (`webview-ui/public/assets/floors/`) — same: no
  separate credit, not loaded (this repo uses the §1a Interior tiles instead).
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
