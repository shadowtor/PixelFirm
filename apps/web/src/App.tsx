import { useEffect, useRef } from "react";
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TILE_SIZE,
  startGameLoop,
  upsertCharacterFromAgent,
  registerTaskTitle,
  handleHandoffEvent,
} from "pixel-office";
import { connectOfficeSocket } from "./ws-client";
import { deriveCharacterUpsertFromStatusEvent } from "./agent-event-mapper";

const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL as string;
const browserToken = import.meta.env.VITE_BROWSER_ACCESS_TOKEN as string;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopGameLoop = startGameLoop(canvas);

    // Pure consumer of the Broadcast Hub — never reads git/GSD/Claude Code
    // state directly, only real AgentStatus values relayed by apps/api
    // (RESEARCH.md Anti-Pattern 1).
    const socket = connectOfficeSocket(wsBaseUrl, browserToken, {
      onSnapshot: (state) => {
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
        const upsert = deriveCharacterUpsertFromStatusEvent(event);
        if (upsert) upsertCharacterFromAgent(upsert.agentId, upsert.status, upsert.name);
        if (event.type === "task.created" && event.taskId) {
          registerTaskTitle(event.taskId, event.payload.title);
        }
        // 05-04 (HANDOFF-01): every relayed handoff event now also reaches
        // the walk/icon/accept/return choreography engine, in addition to
        // whatever AgentStatus-driven pose the reducer separately derives.
        if (event.type === "agent.handoff_requested" || event.type === "agent.handoff_completed") {
          handleHandoffEvent(event);
        }
      },
    });

    return () => {
      stopGameLoop();
      socket.close();
    };
  }, []);

  return (
    <>
      <canvas
        id="office-canvas"
        ref={canvasRef}
        width={DEFAULT_COLS * TILE_SIZE}
        height={DEFAULT_ROWS * TILE_SIZE}
      />
      {/* OFFICE-02: attribution must be visible in the running app, not only
          recorded in references/ASSET-LICENSES.md — always-on, never gated
          behind a menu/modal. */}
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
        sprites: MetroCity pack (CC0) · full audit: references/ASSET-LICENSES.md
      </footer>
    </>
  );
}
