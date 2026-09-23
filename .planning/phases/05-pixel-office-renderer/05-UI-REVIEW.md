# Phase 05 — UI Review

**Audited:** 2026-09-23
**Baseline:** 05-UI-SPEC.md (status: draft, checker sign-off still pending)
**Screenshots:** not captured fresh (no dev server on 3000/5173). Audited the verifier frame `verif-shots/handoff.png` (1280x720, scale 4) plus the code.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Handoff line reads as a verb-led sentence now, but the destination is cut to `live-proo…`, so the frame never says who the work goes to |
| 2. Visuals | 2/4 | Seated agents sink so far that only their hair shows (no faces), and the aisle sender's head is drawn over the desk it stands in front of |
| 3. Color | 3/4 | The 60/30/10 split holds and the accent colours stay on the glyphs, but the disconnect banner uses a red (`rgba(153,0,0,.85)`) that is not in the contract |
| 4. Typography | 3/4 | Only two text roles, as specified. The 11px footer is too small to read in a 1280x720 stream and doesn't scale with the canvas |
| 5. Spacing | 3/4 | DOM padding stays on the 4/8 scale. The handoff task glyph is placed on the desk edge and doesn't sit clear of it |
| 6. Experience Design | 3/4 | Disconnect, empty, frozen and long-text states are all handled. The spec's own sign-off is unticked and nothing ever clears a disconnect (no reconnect) |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Seated agents show no face** (WARNING). Viewers can't tell who is who or which way anyone faces. With `CHARACTER_SITTING_OFFSET_PX` at 10, the desk covers everything below the eyes (handoff.png, both row-4 agents). Change it to about 7–8, or draw the monitor-back/desk front after the sprite for seat rows only, so the eyes and mouth stay visible. Keep the guard that at least 10 body rows stay visible.
2. **Handoff destination is truncated** (WARNING, already deferred in UAT). The line `hands off to live-proo…` hides the one fact it exists to show. Size the bubble to the text up to the floor width (there is about 290 px of floor), or raise `MAX_DIALOGUE_NAME_CHARS` and drop the title from the requested line when the line would go over budget.
3. **Aisle sender and its task glyph overlap the desk** (WARNING). The sender reads as standing on or inside the desk, not in the aisle. In handoff.png the sender's head and the purple task glyph sit over the lower edge of the row-4 desk, because desks draw under characters. Either move the interaction slot's y-anchor down so the head clears the desk's bottom edge, or add desks as a soft obstacle when placing the glyph.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- WARNING: `dialogue-templates.ts` caps `toAgentName` at 10 code points, so in the live frame it renders as `hands off to live-proo…`. The receiver is the unknown here. The sender is standing right there, so the name that gets cut is the one that matters.
- Pass: the tone rule holds (no "I", no exclamation marks). The attribution footer sentence matches the locked text exactly (App.tsx:194-195).
- Minor: the disconnect copy (App.tsx:152) is clear and honest. The em dash is fine in the UI.

### Pillar 2: Visuals (2/4)
- WARNING: in handoff.png the row-4 seated agents show only hair and a sliver of eyes. The 05-38 widening (6 to 10 px) overshot: seated now reads as "buried", and the two agents can only be told apart by hair hue.
- WARNING: the standing sender's head is drawn across the desk's front lip, so depth reads as wrong: it looks like the sender is on the desk.
- WARNING: the blocked and waiting glyphs float about 12 device px above heads that are themselves half hidden, so each glyph looks tied to the desk, not the agent.
- Pass: glyph silhouettes are distinct (octagon vs hourglass), there is a clear focal point (the bubble), and the monitors give the desks structure.

### Pillar 3: Color (3/4)
- Floor planks are about 60%, the wall and `#3A3A5C` surround about 30%, and glyph accents are small. This matches the contract. No tint is used as a state signal.
- WARNING: App.tsx:148-149 hardcodes `#ffffff` on `rgba(153,0,0,0.85)` for the disconnect banner. That red is not in the Color table (Destructive is `#d62828`, and the contract reserves it for the glyphs). Either add the banner to the contract or reuse a declared token.
- Minor: the footer `#cccccc` on `WALL_COLOR` measures 6.74:1. That passes.

### Pillar 4: Typography (3/4)
- Two roles only: the DOM footer/banner at 11px monospace and the canvas dialogue at 5 world px (20 device px at scale 4). This meets the contract.
- WARNING: the footer stays 11px at every scale. In the 1280x720 frame it is the smallest element and can't be read after stream compression. Scaling it to about 3N px would keep it legible and still unobtrusive.

### Pillar 5: Spacing (3/4)
- DOM padding is `4px 8px` for both the footer and the banner (App.tsx:145, 185), which matches xs/sm.
- The canvas is centred at an integer scale, and the 8px `WALL_COLOR` strips at 720 height look correct.
- WARNING: the handoff task glyph (purple) sits on the desk's top-right lip. The glyph gap is measured from the head, but nothing checks it against furniture.

### Pillar 6: Experience Design (3/4)
- Covered: the `role="status"` disconnect banner, an empty floor with no fake placeholder (by design), frozen poses, long-text capping, and a pure-render dialogue.
- WARNING: `ws-client.ts` / App.tsx has no reconnect. Once the banner shows it stays up until a manual reload. For an unattended OBS source that means the stream stays stale until someone notices.
- WARNING: the UI-SPEC is still `status: draft` and every Checker Sign-Off box is unticked. The contract being audited against was never approved.
- Registry audit: skipped (no `components.json`, `Tool: none`).

---

## Files Audited
- apps/web/src/App.tsx, apps/web/src/ws-client.ts
- packages/pixel-office/src/constants.ts, index.ts, dialogue-templates.ts (via spec), engine/renderer.ts (via spec)
- .planning/phases/05-pixel-office-renderer/05-UI-SPEC.md, 05-UAT.md
- verif-shots/handoff.png (verifier capture, 1280x720)
