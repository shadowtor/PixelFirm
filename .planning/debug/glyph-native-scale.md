---
status: diagnosed
trigger: "G-05-1a: At native 320x176 the state icons are still distinguishable from each other (small-scale glyph variants or a minimum UI scale). User: at native size the glyphs are effectively unreadable (~6px)."
created: 2026-09-22T08:01:41Z
updated: 2026-09-22T08:08:08Z
goal: find_root_cause_only
bug_class: Bohrbug (deterministic, every frame)
---

## Current Focus

hypothesis: CONFIRMED. The engine supports integer zoom end to end, but the only production caller never passes one and the app never scales the canvas, so every glyph is always drawn 1 canvas px per art px. No small-scale glyph variants exist, and the glyphs tell each other apart with 1-2 px features.
test: done. Rendered through the real renderScene at zoom 1 and 3 with a recording ctx (scratchpad exp/geom.test.ts); read App.tsx, index.ts, gameLoop.ts, the bubble JSONs and 8-native.png.
expecting: n/a
next_action: none (find_root_cause_only). Hand back to the caller.
reasoning_checkpoint:
  hypothesis: "Glyphs are unreadable at native because zoom is fixed at 1 (index.ts:209 omits the zoom argument to renderFrame; App.tsx:100-101 sizes the canvas 320x176 with no CSS scale), and each 11x13 glyph separates states by 1-2 px features."
  confirming_evidence:
    - "renderFrame(ctx, w, h, tileMap, chars, zoom = 1). Its only production call, index.ts:209, passes 5 args, so zoom is always 1."
    - "Real renderScene at zoom 3 gives the same unzoomed geometry as zoom 1 (glyph gap 6, ink h 12), so the zoom plumbing works and is simply never used."
    - "8-native.png is 320x176 and its glyph band matches the sprite data pixel for pixel: blocked 11x12 ink, permission 9x12, waiting 7x11."
  falsification_test: "If an engine or CSS scale path already existed, 8-native.png would not be 1:1 with the sprite data, or App/index would reference a zoom or scale value. Neither is true."
  fix_rationale: "Either always present at an integer scale >= 3 or author bolder glyphs. The code path (zoom) already exists."
  blind_spots: "Not measured: the user's display DPR and the OBS source size. At DPR != 1 there is also bilinear blur because the canvas has no image-rendering: pixelated (environment, unverified)."
  candidate_causes:
    - "code: zoom is never threaded (index.ts:209, App.tsx:100-101)"
    - "data: one 11x13 asset per state with 1-2 px discriminating features, and no small-scale variant"
    - "environment: no image-rendering: pixelated, so any browser or OBS upscale blurs (unverified on the user's machine)"
    - "layout: the 16 px column pitch caps glyph width, so a glyph-only upscale collides with neighbours"
  and_gate: "yes. Unreadability needs zoom = 1 AND 1-2 px features. Raising the scale or thickening the features each removes the symptom on its own."

## Symptoms

expected: At native 320x176 the blocked / waiting_for_ceo / waiting_for_agent icons are distinguishable from each other at a glance (small-scale variants or a minimum UI scale).
actual: At native size the status glyphs are effectively unreadable (~6px).
errors: none (visual)
reproduction: live harness, agents in blocked/waiting_for_ceo/waiting_for_agent, view canvas at 320x176 (scratchpad uat05/8-native.png)
started: UAT 2026-09-22 (first human look at native size)

## Eliminated

- hypothesis: "Glyphs are drawn at a sub-1 scale or get clipped at native"
  evidence: "8-native.png shows the glyph band at y 9..21 matching the sprite data 1:1 (blocked 11x12 ink at x 35..45; permission x 52..60; waiting x 53..59 relative to their owners). The recording-ctx render at zoom 1 gives the same bounds. Nothing is shrunk or clipped. The assets are simply small."
  timestamp: 2026-09-22T08:06:00Z
- hypothesis: "The renderer's zoom path is broken, so scaling is not an option"
  evidence: "renderScene at zoom 3 scales sprite, glyph, gap and body exactly x3 (glyph ink y 27..62 vs 9..20, body 81..164 vs 27..54). The path works. It is just never used."
  timestamp: 2026-09-22T08:07:00Z

## Evidence

- timestamp: 2026-09-22T08:03:00Z
  checked: packages/pixel-office/src/sprites/bubble-{blocked,permission,waiting}.json
  found: "All three are 11x13 (format locked by 05-UI-SPEC.md and bubbleSprites.test.ts:53-56). Ink bboxes: blocked 11x12 (black-outlined red disc with a 5x2 white bar); permission 9x12 amber '?' (2-3 px strokes, 3x2 dot, 1-row gap); waiting 7x11 hourglass (1 px wide neck, rows 5-7). One asset per state. No small-scale variant exists anywhere in sprites/."
  implication: "The features that separate the three states are 1-3 canvas px at zoom 1."
- timestamp: 2026-09-22T08:04:00Z
  checked: apps/web/src/App.tsx:97-102, apps/web/index.html, main.tsx
  found: "<canvas width={DEFAULT_COLS*TILE_SIZE} height={DEFAULT_ROWS*TILE_SIZE}> = 320x176. No style, no CSS width/height, no image-rendering, no stylesheet anywhere in apps/web (grep for zoom|scale|devicePixelRatio|image-rendering finds only the viewport meta)."
  implication: "The canvas is shown at 320x176 CSS px. At DPR 1 that is 320x176 device px. At DPR > 1 or under OBS scaling it is bilinear-smoothed, because image-rendering: pixelated is absent."
- timestamp: 2026-09-22T08:04:30Z
  checked: packages/pixel-office/src/index.ts:205-211, engine/renderer.ts:217-239, engine/gameLoop.ts
  found: "renderFrame(ctx, canvasWidth, canvasHeight, tileMap, characters, zoom = 1). startGameLoop's render callback calls renderFrame(ctx, canvas.width, canvas.height, tileMap, [...characters.values()]) with no zoom. renderFrame, renderTileGrid, renderScene, drawSpriteData, drawGlyph, resolveBubbleY, resolveDialogueBox and drawDialogue (font DIALOGUE_FONT_PX*zoom) all accept and apply zoom. gameLoop's imageSmoothingEnabled=false is irrelevant: the engine only uses fillRect, and the flag does not govern CSS upscaling of the element."
  implication: "A full integer-scale path exists in the engine, and index.ts:209 is the single point that pins it to 1."
- timestamp: 2026-09-22T08:07:00Z
  checked: "Experiment: scratchpad exp/geom.test.ts renders a row-3 IDLE agent with each stuck glyph through the real renderScene at zoom 1 and zoom 3 (recording ctx)"
  found: "zoom 1: glyph ink y 9..20 (blocked), 10..21 (permission), 10..20 (waiting); body y 27..54. zoom 3: every measurement exactly x3, and the unzoomed gap and ink height are identical."
  implication: "Threading zoom (or a CSS integer upscale) scales glyphs, sprites and dialogue uniformly without changing any geometry invariant."
- timestamp: 2026-09-22T08:07:30Z
  checked: "8-native.png upscaled 8x nearest (scratchpad native-crop-8x.png)"
  found: "The three glyphs are clearly different at 8x (disc+bar / ? / hourglass). At 1x the separating features are the 5x2 bar, the 3x2 dot and the 1 px neck."
  implication: "The shapes are distinct. They are just too small at 1x to resolve, and on 4:2:0 stream compression 1 px colour detail is lost (chroma is stored per 2x2 block)."
- timestamp: 2026-09-22T08:08:00Z
  checked: "What a glyph-only upscale (world stays 1x) would collide with: index.ts:67-76 DESK_ROW_START/PITCH derivation, renderer.ts:145-151 horizontal-containment rationale, TILE_SIZE 16 column pitch"
  found: "Desk rows 3/6/9 and pitch 3 are derived from a 13 px glyph ('16r - 39 >= 0 needs r >= 3', '16p > 47'). A 2x glyph (22x26) needs 16r - 52 >= 0 (r >= 4) and 16p > 60 (p >= 4), leaving 2 desk rows (36 desks). At 22 px wide on a 16 px column pitch, neighbouring glyphs overlap by 6 px. That breaks renderer.test.ts's horizontal-containment guard and the 'strict subset of its owner' invariant."
  implication: "Glyphs cannot grow independently of the world at the current 16 px pitch. The workable routes are a uniform scene scale, or bolder glyphs that stay <= ~13-15 px wide."
- timestamp: 2026-09-22T08:08:05Z
  checked: apps/web/src/App.test.tsx:48-52, scripts/verify-pixel-office-live.mjs:399-431
  found: "App.test pins the canvas attributes width=\"320\" and height=\"176\". The live harness is scale-tolerant (scale = canvas.height / mapH, with a uniform-scale check)."
  implication: "A CSS-only upscale leaves both untouched. An engine-zoom route needs App.test's expected attributes multiplied by the zoom. The harness copes either way."

## Resolution

root_cause: "The pixel office is only ever rendered at zoom 1 with no display upscale. packages/pixel-office/src/index.ts:209 calls renderFrame without its zoom argument (default 1), and apps/web/src/App.tsx:100-101 sizes the canvas at exactly 320x176 with no CSS size and no image-rendering: pixelated. So each 11x13 state glyph (ink 11x12 / 9x12 / 7x11) is shown 1 canvas px per art px. The three stuck-state glyphs differ mainly by 1-3 px features (5x2 white bar, 3x2 '?' dot, 1 px hourglass neck), and no small-scale variant exists. Contributing: the 16 px column pitch and the 05-10 desk-row geometry (derived from a 13 px glyph) mean the glyph cannot simply be enlarged on its own."
fix: ""
verification: ""
files_changed: []
suggested_fix_direction: "Laziest: a minimum integer display scale in App.tsx. Keep the 320x176 backing store and add style width/height = 320*N x 176*N (N = max(3, floor(min(innerWidth/320, innerHeight/176)))) plus imageRendering: 'pixelated'. The engine, App.test and the harness stay untouched. Alternative: add a zoom param to index.ts startGameLoop and pass it to renderFrame, sizing the canvas x zoom (crisper dialogue text, but App.test's attributes must change). Do NOT enlarge the glyphs alone. If native 1x must stay legible too, thicken the discriminating features within <= 13 px width (2 px neck, a 2x2 fill-coloured dot)."
oracle_type: "derived: minimum rendered glyph feature size (px) >= threshold at the presented scale"
