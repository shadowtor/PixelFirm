import { useEffect, useRef } from "react";
import { AgentStatus } from "event-schema";
import { DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE, startGameLoop, upsertCharacterFromAgent } from "pixel-office";
import { connectOfficeSocket } from "./ws-client";

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
          upsertCharacterFromAgent(agentId, agent.status);
        }
      },
      onEvent: (event) => {
        if (event.type === "agent.online" || event.type === "session.started") {
          upsertCharacterFromAgent(
            event.sourceAgentId!,
            event.type === "agent.online" ? AgentStatus.IDLE : AgentStatus.CODING,
          );
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
