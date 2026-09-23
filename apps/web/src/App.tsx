import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MIN_DISPLAY_SCALE,
  TILE_SIZE,
  WALL_COLOR,
  displayScaleFor,
  startGameLoop,
  upsertCharacterFromAgent,
  registerTaskTitle,
  handleHandoffEvent,
} from "pixel-office";
import { emptyState } from "company-core";
import { connectOfficeSocket } from "./ws-client";
import { applyLiveEvent } from "./agent-event-mapper";

const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string;
const browserToken = import.meta.env.VITE_BROWSER_ACCESS_TOKEN as string;

// 05-21 (G-05-1a) / 05-31 (G-05-P6): the office is sized from the FULL
// viewport, with no DOM height reserved for the footer — the footer overlays
// the office's own bottom wall row instead. Reserving 24px made a 1280x720 OBS
// source floor to scale 3 (960x528) and left the rest of the frame black; at
// the full height it is scale 4 (1280x704).
function currentDisplayScale(): number {
  return typeof window === "undefined"
    ? MIN_DISPLAY_SCALE
    : displayScaleFor(window.innerWidth, window.innerHeight);
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 05-09 (CR-01): the live projection every relayed event is folded into.
  // A ref, not state — the canvas renderer is imperative, so no React
  // re-render is wanted per event.
  const projectionRef = useRef(emptyState());
  const [disconnected, setDisconnected] = useState(false);
  const [scale, setScale] = useState(currentDisplayScale);

  // Separate from the socket/game-loop effect so a resize never reconnects.
  useEffect(() => {
    const onResize = () => setScale(currentDisplayScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopGameLoop = startGameLoop(canvas);

    // Pure consumer of the Broadcast Hub — never reads git/GSD/Claude Code
    // state directly, only real AgentStatus values relayed by apps/api
    // (RESEARCH.md Anti-Pattern 1).
    const socket = connectOfficeSocket(wsBaseUrl, browserToken, {
      onSnapshot: (state) => {
        // Seed the live baseline BEFORE the upsert loop below: the first live
        // event must diff against the real connect-time projection, otherwise
        // every agent in the snapshot is re-upserted on the next event.
        projectionRef.current = state;
        for (const [agentId, agent] of Object.entries(state.agents)) {
          upsertCharacterFromAgent(agentId, agent.status, agent.name);
        }
        // 05-04 (HANDOFF-02): known task titles feed handoff dialogue
        // interpolation — the plain TaskState.title field only, never
        // payload/prompt/diff content.
        for (const [taskId, task] of Object.entries(state.tasks)) {
          if (task.title) registerTaskTitle(taskId, task.title);
        }
      },
      onEvent: (event) => {
        // 05-09 (CR-01): run company-core's own reduce over the live
        // projection and apply whatever agents it actually changed. The live
        // path and the snapshot fold path are the same code, so they cannot
        // drift.
        const { state, upserts } = applyLiveEvent(projectionRef.current, event);
        projectionRef.current = state;
        for (const upsert of upserts) {
          upsertCharacterFromAgent(upsert.agentId, upsert.status, upsert.name);
        }

        // Same guard as the snapshot path; the renderer already treats a blank
        // title as absent via titleOrNull, this only keeps the two entry points
        // agreeing (05-41, CR-01).
        if (event.type === "task.created" && event.taskId && event.payload.title) {
          registerTaskTitle(event.taskId, event.payload.title);
        }
        // 05-04 (HANDOFF-01): every relayed handoff event also reaches the
        // walk/icon/accept/return choreography engine.
        //
        // ORDERING IS LOAD-BEARING (05-09): this call MUST stay below the
        // upsert loop above. handoff-choreography.ts's
        // `if (!fromChar || !toChar) return;` guard needs both participants
        // to already have a Character, and for agent.handoff_requested it is
        // this very event's own projection upsert (the reducer sets the
        // receiver to WAITING_FOR_AGENT) that creates the receiver's.
        // Moving this above the loop re-breaks HANDOFF-01 on the live path.
        if (event.type === "agent.handoff_requested" || event.type === "agent.handoff_completed") {
          handleHandoffEvent(event);
        }
      },
    });

    // The office silently freezing is indistinguishable from an idle company —
    // a dropped socket must say so on screen (05-09 must_haves).
    const markDisconnected = () => setDisconnected(true);
    socket.addEventListener("close", markDisconnected);
    socket.addEventListener("error", markDisconnected);

    return () => {
      stopGameLoop();
      socket.removeEventListener("close", markDisconnected);
      socket.removeEventListener("error", markDisconnected);
      socket.close();
    };
  }, []);

  return (
    <>
      {/* 05-31 (G-05-P6): full-viewport surround in the office's own border
          colour, so a viewport that is not an exact multiple of 320x176 shows
          a WALL_COLOR strip continuous with the office border rather than
          black. margin:auto centres the canvas when it fits; overflow:auto
          scrolls instead of clipping below MIN_DISPLAY_SCALE. */}
      <div style={{ position: "fixed", inset: 0, display: "flex", overflow: "auto", background: WALL_COLOR }}>
        <canvas
          id="office-canvas"
          ref={canvasRef}
          width={DEFAULT_COLS * TILE_SIZE * scale}
          height={DEFAULT_ROWS * TILE_SIZE * scale}
          // No CSS width/height: the CSS box must equal the backing store.
          style={{ display: "block", margin: "auto", imageRendering: "pixelated" }}
        />
      </div>
      {disconnected && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            padding: "4px 8px",
            fontSize: "11px",
            fontFamily: "monospace",
            color: "#ffffff",
            background: "rgba(153, 0, 0, 0.85)",
          }}
        >
          Disconnected from the office feed — what you see is the last known state, not live.
        </div>
      )}
      {/* OFFICE-02: attribution must be visible in the running app, not only
          recorded in references/ASSET-LICENSES.md — always-on, never gated
          behind a menu/modal.

          05-12 (WR-09): the credit stays; the licence claim does not. The
          MetroCity PACK is CC0 at its publisher's own itch.io listing (cited
          in ASSET-LICENSES.md §1), but that the file this renderer actually
          draws IS that pack's art rests on a credit line in the fork's README,
          which §4's own rule calls insufficient. A footer is too small to
          carry that distinction honestly, so it credits and points at the
          audit rather than asserting a licence over the bytes we ship.
          05-26: the office art (MetroCity Interior, ASSET-LICENSES §1a) is
          credited alongside the character pack — still credit-only, because
          §1's hair layer is.
          05-31 (G-05-P6): the black rgba(0,0,0,0.6) strip is gone.
          05-36 (WR-02): it was replaced by a WALL_COLOR backdrop rather than by
          nothing. WALL_COLOR is the same value the surround uses, so no black
          strip returns — but the footer now carries its own contrast instead of
          inheriting whatever is behind it. That matters because 05-31's "never
          over the floor" claim held only while the canvas fitted the viewport:
          MIN_DISPLAY_SCALE floors the canvas at 960x528 while this footer is
          position:fixed, so on a smaller viewport the wrapper's overflow:auto
          scrolls the canvas UNDER the footer and the footer does sit over the
          floor. Measured: #cccccc is 6.74:1 on WALL_COLOR, but 4.40:1 on floor
          plank #7d4e13 and 3.21:1 on #926429 — both below WCAG AA. The
          sentence is unchanged. */}
      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "4px 8px",
          fontSize: "11px",
          fontFamily: "monospace",
          color: "#cccccc",
          background: WALL_COLOR,
        }}
      >
        Pixel office renderer forked from pixel-agents-hq/pixel-agents (MIT) · character and
        office sprites: MetroCity packs by JIK-A-4 · full audit: references/ASSET-LICENSES.md
      </footer>
    </>
  );
}
