---
status: diagnosed
trigger: "G-05-2: Waiting-for-CEO glyph stays high-contrast in grayscale and colour-deficiency views (strong outline/background or more distinctive silhouette); every state reads from shape + animation, not colour. User: orange ? gets muddy in grayscale and some CVD views."
created: 2026-09-22T08:01:41Z
updated: 2026-09-22T08:08:08Z
goal: find_root_cause_only
bug_class: Bohrbug (deterministic asset palette)
---

## Current Focus

hypothesis: CONFIRMED. bubble-permission.json has no backing plate and no dark outline. Its only edge colour #8a5a00 is a mid-tone (luma 94) that sits between the wall (60) and the floor (128), so it disappears against both. The '?''s identifying features (dot, stem base) are drawn mostly in that edge colour and sit on the floor half of the glyph.
test: done. Computed WCAG contrast and Rec.709 luma per palette entry vs FALLBACK_FLOOR_COLOR and WALL_COLOR, then sampled every glyph ink pixel in 1-states / 3-gray / 4-deut / 5-prot / 6-gray-deut against the background it actually sits on.
expecting: n/a
next_action: none (find_root_cause_only). Hand back to the caller.
reasoning_checkpoint:
  hypothesis: "The '?' goes muddy because its only edge colour #8a5a00 (luma 94) has 1.50:1 contrast vs the #808080 floor and 1.83:1 vs the #3A3A5C wall. Its fill #ffb703 is only 2.26:1 vs the floor. It has no plate. And its dot and stem base are 4/6 and 3/3 edge-coloured pixels on the floor."
  confirming_evidence:
    - "3-gray.png: 25/49 permission ink pixels are within 40 luma levels of their own background. That is exactly the 25 edge pixels. The fill reads light-grey on mid-grey."
    - "4-deut/5-prot: the edge becomes ~Y115-120 on a Y128 floor (delta ~8-13). All 10 edge pixels on the floor half (stem base + dot) vanish, leaving a 2 px dot."
    - "blocked by contrast has a full #000000 outline (5.32:1 vs floor) and a #ffffff bar (10.8:1 vs wall), so it survives every view."
  falsification_test: "If the palette were not the cause, the edge pixels in 3-gray would differ clearly from the floor/wall luma. They are at 94 vs 60/128 (delta 34 both sides)."
  fix_rationale: "Give the glyph a constant high-contrast backdrop independent of floor/wall: a near-black 1 px outline enclosing the '?' plus a light plate, or a dark-outlined light plate. Draw the dot and stem in a colour with high luma separation from both backgrounds."
  blind_spots: "The CVD simulator's exact matrix is unknown (taken as given from the screenshots). Stream compression was not tested. The user did not complain about waiting, but its body is also low contrast (see Evidence)."
  candidate_causes:
    - "data: bubble-permission.json palette (mid-tone edge #8a5a00, no plate, partial outline only)"
    - "environment: two different backgrounds under one glyph (wall Y60 above y16, floor Y128 below), set by the G-05-1c row-3 geometry. A single mid-tone edge cannot contrast with both."
    - "code/test gap: bubbleSprites.test.ts 'colour-blind silhouette proxy' checks only the painted mask, never luminance vs background"
    - "design: all three stuck states are frozen + IDLE (static), so animation does not separate them. Shape is the only cue, and shape fails once the edge pixels vanish."
  and_gate: "yes. The mid-tone edge AND the mid-grey floor AND the discriminating features (dot/stem) being edge-coloured and on the floor. Any one fixed (dark outline, plate, or features drawn in the fill colour) restores legibility."

## Symptoms

expected: waiting_for_ceo glyph stays high-contrast under grayscale / deuteranopia / protanopia. Every state reads from shape + animation, not colour.
actual: The orange "?" gets muddy in grayscale and some colour-deficiency views.
errors: none (visual)
reproduction: uat05/3-gray.png, 4-deut.png, 5-prot.png, 6-gray-deut.png
started: UAT 2026-09-22

## Eliminated

- hypothesis: "The '?' silhouette is simply too similar to another glyph's mask"
  evidence: "bubbleSprites.test.ts 'OFFICE-03 distinct-silhouette prohibition' proves the painted mask is unique among all 12. At 8x (native-crop-8x.png) the '?' is clearly a question mark. The shape is distinct. What fails is the luminance of its pixels, which erases part of the shape in achromatic views."
  timestamp: 2026-09-22T08:07:30Z
- hypothesis: "The orange fill itself is the weakest colour"
  evidence: "The fill #ffb703 has the highest fill contrast of the three glyphs vs the floor (2.26 vs 1.27 for the blocked red and the waiting blue). The weak element is the edge colour #8a5a00 (1.50 floor / 1.83 wall, the lowest of every palette entry), plus the absence of any plate or dark outline."
  timestamp: 2026-09-22T08:07:30Z

## Evidence

- timestamp: 2026-09-22T08:03:00Z
  checked: sprites/bubble-permission.json vs bubble-blocked.json vs bubble-waiting.json
  found: "permission palette {1:#ffb703 fill, 2:#8a5a00 edge}. The edge is partial (left/bottom only, rows 1-12), there is no enclosing outline and no background. Stem base (row 9) = 3/3 edge pixels. Dot (rows 11-12) = 4/6 edge, 2/6 fill. blocked = full 1 px #000000 outline + #d62828 fill + #ffffff bar. waiting = #4361ee body + #22246e top/bottom caps, no outline."
  implication: "Only blocked carries its own high-contrast backdrop. permission's key features rely on the edge colour."
- timestamp: 2026-09-22T08:05:00Z
  checked: "WCAG contrast + Rec.709 luma per palette entry vs FALLBACK_FLOOR_COLOR #808080 (Y128) and WALL_COLOR #3A3A5C (Y60)"
  found: "permission fill #ffb703 Y185: 2.26 floor / 6.20 wall. permission edge #8a5a00 Y94: 1.50 floor / 1.83 wall (the lowest of all entries). blocked outline #000 Y0: 5.32 floor. blocked bar #fff: 3.95 floor / 10.83 wall. blocked fill Y77: 1.27 floor. waiting caps #22246e Y41: 3.44 floor. waiting body #4361ee Y101: 1.27 floor / 2.16 wall."
  implication: "permission's edge luma (94) sits almost exactly midway between wall (60) and floor (128). It cannot outline the glyph against either background."
- timestamp: 2026-09-22T08:06:30Z
  checked: "Per-pixel sampling of every glyph ink pixel in the harness screenshots vs its actual background (wall for y < 16, floor for y >= 16), 6x scale"
  found: "Weak pixels (|dY| < 40): 3-gray: blocked 35%, permission 51% (all 25 edge px), waiting 49%. 4-deut: blocked 0%, permission 20% (the 10 edge px on the floor: stem base + dot), waiting 51%. 5-prot: blocked 28%, permission 20%, waiting 85%. 6-gray-deut: blocked 0%, permission 20%, waiting 85%. In deut/prot the permission edge is ~Y115-122 on a Y128 floor."
  implication: "In every achromatic/CVD view the '?' loses its stem base and most of its dot, the features that make it a question mark rather than a hook. That matches 'muddy'. Secondary: waiting's 1 px blue body is also weak (it survives on its near-black caps), so the same class of defect exists for waiting_for_agent."
- timestamp: 2026-09-22T08:07:00Z
  checked: "3-gray.png and 6-gray-deut.png visually"
  found: "The '?' renders as a light-grey hook with a faint stem and dot on a mid-grey floor. The blocked disc stays crisp (black ring + white bar). The hourglass reads by its dark caps."
  implication: "Direct visual confirmation of the user's report."
- timestamp: 2026-09-22T08:07:30Z
  checked: "Glyph vertical placement vs background (see glyph-anchoring.md): glyph ink y 9..21, wall/floor edge y 16"
  found: "The upper loop of the '?' sits on the dark wall (fill contrast 6.20). The stem base and dot sit on the grey floor (fill 2.26, edge 1.50)."
  implication: "The least-contrasting half of the glyph is exactly where its discriminating features are. Fixing G-05-1c (glyph fully on the floor) makes the floor the only background to beat."
- timestamp: 2026-09-22T08:08:00Z
  checked: sprites/bubbleSprites.test.ts:61-81, 05-UI-SPEC.md Color section, status-mapping.ts:43-50
  found: "The only colour-blind guard is silhouette(): the painted/unpainted mask, with no luminance or contrast check vs FALLBACK_FLOOR_COLOR/WALL_COLOR. The UI-SPEC locks 'colour never the only signal' and forbids tint-as-state. All three stuck states are frozen + IDLE (static), so among them animation carries no distinguishing signal and shape must do all the work."
  implication: "Why not caught: the guard proves mask uniqueness, not that the mask survives luminance-only viewing. A glyph can pass while half its pixels vanish in grayscale."

## Resolution

root_cause: "packages/pixel-office/src/sprites/bubble-permission.json was authored (05-07) as a bare amber '?' with no backing plate and no dark enclosing outline. Its only edge colour #8a5a00 has luma 94, almost exactly midway between WALL_COLOR #3A3A5C (60) and FALLBACK_FLOOR_COLOR #808080 (128), with WCAG contrast 1.50:1 vs the floor and 1.83:1 vs the wall, the lowest of any glyph palette entry. The fill #ffb703 is only 2.26:1 vs the floor. The glyph's discriminating features, the stem base (3/3 edge px) and the dot (4/6 edge px), sit on the floor half of the glyph (G-05-1c geometry). In grayscale, and even more in deut/prot where the edge becomes ~Y120 on a Y128 floor, those features vanish and the '?' degrades to a faint light-grey hook. Because all stuck states are frozen and static, shape is the only cue left. Not caught because bubbleSprites.test.ts's colour-blind proxy checks mask uniqueness only, never luminance vs background."
fix: ""
verification: ""
files_changed: []
suggested_fix_direction: "Re-author bubble-permission.json within 11x13 with a near-black (#000/#1a1a1a) 1 px outline fully enclosing the '?', plus a light plate (white/near-white rounded square or speech bubble, distinct from the discussing badge's mask). Or keep the bare '?' with a full dark outline and a fill with luma well above 128 (the amber at Y185 is fine once outlined). Draw the dot and stem in fill, not edge colour. Apply the same check to bubble-waiting.json (1 px mid-luma body). Add a guard test: every glyph must have a closed outline or plate whose luma differs from both FLOOR (128) and WALL (60) by >= ~60, or a WCAG contrast >= 3:1 against both."
oracle_type: "derived: grayscale luma delta of every glyph ink pixel (or enclosing outline) vs FALLBACK_FLOOR_COLOR and WALL_COLOR >= threshold"
