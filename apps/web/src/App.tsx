import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  MIN_DISPLAY_SCALE,
  TILE_SIZE,
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

// 05-21 (G-05-1a): the fixed attribution footer's height, rounded up — at
// 1920x1080 the office is 1920x1056 (scale 6) with the footer underneath.
const FOOTER_RESERVE_PX = 24;

function currentDisplayScale(): number {
  return typeof window === "undefined"
    ? MIN_DISPLAY_SCALE
    : displayScaleFor(window.innerWidth, window.innerHeight - FOOTER_RESERVE_PX);
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

        if (event.type === "task.created" && event.taskId) {
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
      <canvas
        id="office-canvas"
        ref={canvasRef}
        width={DEFAULT_COLS * TILE_SIZE * scale}
        height={DEFAULT_ROWS * TILE_SIZE * scale}
        // No CSS width/height: the CSS box must equal the backing store.
        style={{ display: "block", imageRendering: "pixelated" }}
      />
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
          audit rather than asserting a licence over the bytes we ship. */}
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
          background: "rgba(0, 0, 0, 0.6)",
        }}
      >
        Pixel office renderer forked from pixel-agents-hq/pixel-agents (MIT) · character
        sprites: MetroCity pack by JIK-A-4 · full audit: references/ASSET-LICENSES.md
      </footer>
    </>
  );
}
