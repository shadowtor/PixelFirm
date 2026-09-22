import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_COLS, DEFAULT_ROWS, MIN_DISPLAY_SCALE, TILE_SIZE } from "pixel-office";
// The audit document the in-app credit points at. ?raw is a build-time
// filesystem read, so a missing file fails this module outright — and it
// needs no jsdom/@types/node, neither of which this package depends on.
import assetLicenses from "../../../references/ASSET-LICENSES.md?raw";
import { App } from "./App";

// OFFICE-02: 05-VERIFICATION.md failed the attribution prohibition closed
// because apps/web's suite never rendered App. Static server rendering is
// enough — App's useEffect (WebSocket + canvas game loop) does not run, so no
// DOM, no canvas and no socket are needed.
const markup = renderToStaticMarkup(<App />);
const footerMarkup = markup.slice(markup.indexOf("<footer"));

// 05-12 (WR-09): the credit is pinned, the sprite licence claim is
// deliberately absent. ASSET-LICENSES.md §1 confirms the MetroCity PACK as CC0
// at the publisher's own listing, but that the file this renderer draws is
// that pack's art rests on the fork's README credit — a distinction a footer
// cannot carry, so the footer credits and points at the audit instead. The
// only licence it asserts is the fork's MIT, which is documented in full.
//
// Apostrophe-free by construction: renderToStaticMarkup escapes `'` to
// `&#x27;`, which would make this whole-sentence assertion unmatchable against
// the rendered markup for a purely cosmetic reason.
const ATTRIBUTION =
  "Pixel office renderer forked from pixel-agents-hq/pixel-agents (MIT) · character sprites: MetroCity pack by JIK-A-4 · full audit: references/ASSET-LICENSES.md";

describe("App attribution", () => {
  it("renders the complete attribution sentence, so a silent truncation goes red", () => {
    expect(markup).toContain(ATTRIBUTION);
  });

  it("points at an audit document that actually exists and has content", () => {
    expect(ATTRIBUTION).toContain("references/ASSET-LICENSES.md");
    expect(assetLicenses.trim().length).toBeGreaterThan(0);
  });

  it("shows the credit unconditionally — never behind a disclosure element or hidden", () => {
    expect(footerMarkup).toContain("position:fixed");
    expect(footerMarkup).not.toContain("hidden");
    expect(footerMarkup).not.toContain("<details");
    expect(footerMarkup).not.toContain("<dialog");
  });
});

describe("App canvas", () => {
  // 05-21 (G-05-1a): never native 320x176 — SSR (no window) falls back to
  // the minimum integer display scale.
  it("sizes the canvas from pixel-office's own grid constants at the minimum display scale", () => {
    expect(markup).toContain(`width="${DEFAULT_COLS * TILE_SIZE * MIN_DISPLAY_SCALE}"`);
    expect(markup).toContain(`height="${DEFAULT_ROWS * TILE_SIZE * MIN_DISPLAY_SCALE}"`);
  });

  it("keeps integer pixels crisp under browser/OBS scaling", () => {
    const canvasMarkup = markup.slice(markup.indexOf("<canvas"), markup.indexOf(">", markup.indexOf("<canvas")));
    expect(canvasMarkup).toContain("image-rendering:pixelated");
  });
});
