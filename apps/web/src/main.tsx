import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("main.tsx: #root element not found in index.html");
}

const root = createRoot(rootElement);
const { pathname } = window.location;

// D-08: /ceo is a lazy chunk, so the office route (what OBS captures) never loads the
// dashboard's code or its Tailwind CSS. scripts/check-office-bundle.mjs enforces this.
if (pathname === "/ceo" || pathname.startsWith("/ceo/")) {
  void import("./ceo/CeoApp").then(({ CeoApp }) =>
    root.render(
      <StrictMode>
        <CeoApp />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
