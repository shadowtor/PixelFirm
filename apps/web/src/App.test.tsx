import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MIN_DISPLAY_SCALE,
  TILE_SIZE,
  WALL_COLOR,
  displayScaleFor,
} from "pixel-office";
// The audit document the in-app credit points at. ?raw is a build-time
// filesystem read, so a missing file fails this module outright — and it
// needs no jsdom/@types/node, neither of which this package depends on.
import assetLicenses from "../../../references/ASSET-LICENSES.md?raw";
// Same ?raw read for the host page: the pre-mount background lives there, not
// in any module this suite can import.
import indexHtml from "../index.html?raw";
import { App } from "./App";

// OFFICE-02: 05-VERIFICATION.md failed the attribution prohibition closed
// because apps/web's suite never rendered App. Static server rendering is
// enough — App's useEffect (WebSocket + canvas game loop) does not run, so no
// DOM, no canvas and no socket are needed.
const markup = renderToStaticMarkup(<App />);
const footerMarkup = markup.slice(markup.indexOf("<footer"));
// Everything before the canvas is its full-viewport surround (05-31).
const wrapperMarkup = markup.slice(0, markup.indexOf("<canvas"));

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
  "Pixel office renderer forked from pixel-agents-hq/pixel-agents (MIT) · character and office sprites: MetroCity packs by JIK-A-4 · full audit: references/ASSET-LICENSES.md";

// 05-36 (WR-02): read the element's background declarations OUT of the rendered
// markup so the assertion is an equality on what actually ships. The substring
// guard this replaces passed for "no backdrop at all", which is exactly the
// regression it was supposed to catch.
function backgroundDeclarations(html: string, tag: string): string[] {
  const style = new RegExp(`<${tag}\\b[^>]*\\sstyle="([^"]*)"`).exec(html)?.[1] ?? "";
  return style
    .split(";")
    .map((declaration) => declaration.replace(/\s+/g, "").toLowerCase())
    .filter((declaration) => /^background(-color)?:/.test(declaration));
}

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
  // 05-21 (G-05-1a): never native (384x208 since 06-07) — SSR (no window) falls back to
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

// 05-31 (G-05-P6): the renderer's output is the office and nothing else. The
// scale comes from the FULL viewport — no DOM height is reserved for the
// footer, which now overlays the office's own bottom wall row — and whatever
// remainder a non-multiple viewport leaves is the office's border colour, never
// black.
describe("App viewport fill", () => {
  it("sizes the documented OBS sources from the full viewport, with no footer allowance", () => {
    // 06-07 (D-10): the office is 384x208. 1280/384 = 3.33 -> 3 (1152x624).
    // 208 x 5 = 1040, so 1920x1080 presents at 5 with a 20px WALL_COLOR strip
    // above and below; no footer allowance is taken from either height.
    expect(displayScaleFor(1280, 720)).toBe(3);
    expect(displayScaleFor(1920, 1080)).toBe(5);
  });

  it("surrounds the canvas in the office border colour, so a remainder is never black", () => {
    expect(wrapperMarkup.toLowerCase()).toContain(`background:${WALL_COLOR.toLowerCase()}`);
  });

  it("paints the host page the same border colour, so no black frame shows before React mounts", () => {
    expect(indexHtml.toLowerCase()).toContain(`background:${WALL_COLOR.toLowerCase()}`);
  });

  // 05-36 (WR-02): an EQUALITY, not an absence check. #cccccc on WALL_COLOR is
  // 6.74:1; on the two MetroCity floor planks it is 4.40:1 and 3.21:1, both
  // below WCAG AA. The footer is position:fixed and the canvas is floored at
  // MIN_DISPLAY_SCALE, so on a small viewport the floor IS what sits behind it
  // — the backdrop has to be the footer's own, and this goes red for a missing
  // one as loudly as for a black one.
  it("backs the attribution with the office border colour, so its contrast never depends on what is underneath", () => {
    expect(backgroundDeclarations(markup, "footer")).toEqual([`background:${WALL_COLOR.toLowerCase()}`]);
  });

  // 05-36 (WR-02): the case the backdrop exists FOR, made explicit rather than
  // implied. 800x480 is below the MIN_DISPLAY_SCALE canvas floor on BOTH axes,
  // so the assertion does not depend on which axis the clamp binds on. Every
  // number it compares against is computed from the package's own exported
  // constants, so moving MIN_DISPLAY_SCALE moves this assertion with it instead
  // of silently invalidating it.
  const OVERFLOW_VIEWPORT = { w: 800, h: 480 };

  it("keeps the credit legible where the canvas overflows the viewport and scrolls under it", () => {
    // The clamp fires: the office is NOT scaled down to fit this viewport.
    expect(displayScaleFor(OVERFLOW_VIEWPORT.w, OVERFLOW_VIEWPORT.h)).toBe(MIN_DISPLAY_SCALE);

    // So the canvas cannot fit on either axis — the wrapper's overflow:auto
    // scrolls it under the position:fixed footer, which therefore CAN sit over
    // the floor, where #cccccc alone would be 4.40:1 / 3.21:1.
    expect(DEFAULT_COLS * TILE_SIZE * MIN_DISPLAY_SCALE).toBeGreaterThan(OVERFLOW_VIEWPORT.w);
    expect(DEFAULT_ROWS * TILE_SIZE * MIN_DISPLAY_SCALE).toBeGreaterThan(OVERFLOW_VIEWPORT.h);

    // And the backdrop that saves it is a static declaration on a static
    // element: it does not vary with viewport, which is the whole property.
    expect(backgroundDeclarations(markup, "footer")).toEqual([`background:${WALL_COLOR.toLowerCase()}`]);
  });
});
