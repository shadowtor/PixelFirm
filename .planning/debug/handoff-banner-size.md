---
status: diagnosed
trigger: "G-05-1b: Handoff text renders as a wide black banner that dominates the office and reads as a debug banner (UAT 05 test 1)"
created: 2026-09-22T09:00:00Z
updated: 2026-09-22T09:20:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED. Box width is measureText of a full-sentence template drawn in 11px system monospace at native zoom 1 on a 16px-tile / 320px canvas; the caps were sized to FILL one canvas line, and the box is an opaque tail-less rectangle.
bug_class: Bohrbug (deterministic sizing by design/spec)
known_pattern_candidate: none (no knowledge-base.md)
next_action: return ROOT CAUSE FOUND to orchestrator

reasoning_checkpoint:
  hypothesis: "The banner look comes from sizing: w = ceil(measureText(sentence at 11px monospace)) + 4 (renderer.ts:133,165-167) on a zoom-1 320 px canvas, with a sentence template 'Handing off \"<title<=16>\" to <name<=12>' whose caps were chosen to fit one full canvas line (dialogue-templates.ts:211-221); the fill is an opaque #121212 rect with no tail/border (renderer.ts:168-169)."
  confirming_evidence:
    - "Screenshot box native 210x13 for a 34-char line = 6.05 px/char (Consolas 11px), 66% of canvas width, spanning ~13 of 20 tiles."
    - "Probe: max-capped line is 46 code points -> w 283 = 88% of canvas."
    - "dialogue-templates.ts:215-219 ponytail note: caps 'sized to one line on the native 320px canvas at ~6.6px per monospace character'."
    - "index.ts:448 renderFrame(...) passes no zoom -> zoom 1; DIALOGUE_FONT_PX 11 is 69% of a 16 px tile and ~1/3 of the 32 px character sprite height."
  falsification_test: "If box width were independent of sentence length (e.g. icon/short label) the box would stay near one tile; measured 210 px for 34 chars refutes any fixed-width model."
  fix_rationale: "The spec'd content (full sentence) and scale (11px text on a 320 px world) are what make it a banner; fix must shorten/compact the content and/or render text at a stream-resolution layer, and give it bubble styling (tail, border) near the speaker."
  blind_spots: "Font resolves per OS/browser (Consolas here); DejaVu/Courier would be similar (0.6em -> ~6.6 px/char, wider). Did not evaluate a zoomed canvas (app never uses zoom>1)."
  candidate_causes:
    - "config: DIALOGUE_FONT_PX=11, DIALOGUE_BOX_HEIGHT_PX=13, DIALOGUE_BOX_COLOR=#121212 opaque (constants.ts:282-289)"
    - "code: width = measureText(text) + padding, plain fillRect box (renderer.ts:133,165-171)"
    - "data/spec: full-sentence templates + 16/12 caps (dialogue-templates.ts:211-221; 05-UI-SPEC.md lines 92-98,128-130 lock 11px monospace + templates)"
    - "environment: canvas rendered at native 320x176 zoom 1 and CSS-upscaled x6, system (non-pixel) antialiased monospace font"
  and_gate: "yes: width = (sentence length) x (11px font at native scale); either factor alone at its current value already exceeds half the canvas, but both together produce 66-88%."

## Symptoms

expected: Handoff text is a compact label/speech bubble near the participants.
actual: Opaque #121212 banner 1260x78 screen px (x6 scale) across the top wall; reads as a debug banner.
errors: none (visual)
reproduction: live harness handoff; scratchpad/uat05/2-handoff-600.png, 2-handoff-2500.png
started: since 05-13 (dialogue pass)

## Eliminated

- hypothesis: "Wrong zoom/scale applied to the font (e.g. font multiplied by a stream zoom)"
  evidence: "App renders zoom 1 (index.ts:448, renderer.ts:165 uses DIALOGUE_FONT_PX*zoom = 11px). Box height 13 native = DIALOGUE_BOX_HEIGHT_PX exactly; no double scaling."
  timestamp: 2026-09-22T09:15:00Z

## Evidence

- timestamp: 2026-09-22T09:05:00Z
  checked: "Pixel scan of 2-handoff-2500.png"
  found: "Box native 15..225 x 0..13 -> 210x13 px for 'Handing off \"t-sender\" to receiver' (34 chars): (210-4)/34 = 6.05 px/char (Consolas 11px advance 0.5498em)."
  implication: "Box width is text-driven: ~6 px per character on a 320 px world."
- timestamp: 2026-09-22T09:08:00Z
  checked: "constants.ts:281-291; renderer.ts:125-172"
  found: "DIALOGUE_FONT_PX=11, DIALOGUE_BOX_HEIGHT_PX=13, PAD_X=2, box #121212 opaque, text #f0f0f0; w=ceil(textWidth)+2*PAD; fillRect + fillText only (no tail, no border, square corners); font string `${11*zoom}px monospace`."
  implication: "A flat dark full-width strip of console text - the 'debug banner' look."
- timestamp: 2026-09-22T09:09:00Z
  checked: "dialogue-templates.ts:210-221; 05-UI-SPEC.md:92-98,128-130"
  found: "Templates are full sentences ('Handing off \"${taskTitle}\" to ${toAgentName}', '${toAgentName} accepts \"${taskTitle}\"'); caps 16/12 chosen so the longest (46 code points) fits ONE line of the 320 px canvas. UI-SPEC locks the 11px monospace scale and the templates."
  implication: "The spec budgets the line to be nearly canvas-wide; the implementation honours it exactly."
- timestamp: 2026-09-22T09:12:00Z
  checked: "Throwaway vitest probe (scratchpad/probe/handoff.probe.test.ts)"
  found: "UAT line w=210 (0.66 of canvas); max-cap line 'Handing off \"xxxxxxxxxxxxxxx…\" to yyyyyyyyyyy…' 46 chars, w=283 (0.88 of canvas)."
  implication: "Any real title/name near the caps yields a near-full-width strip."

## Resolution

root_cause: "The handoff line's size is set by content x scale: renderer.ts:133 sizes the box to measureText of the whole sentence (+4 px), drawn at DIALOGUE_FONT_PX=11 (constants.ts:282) in system monospace on the native zoom-1 320x176 canvas (index.ts:448), where 11px is ~69% of a 16px tile and ~6 px per character. The sentence templates and their 16/12 caps (dialogue-templates.ts:211-221) were explicitly sized to fill one 320 px line, so a typical line is 210 px (66% of the canvas, 13 tiles) and a capped one 283 px (88%). renderer.ts:168-171 paints it as an opaque #121212 square-cornered strip with no tail/border (constants.ts:289), which reads as a debug banner rather than a speech bubble."
fix:
verification:
files_changed: []
