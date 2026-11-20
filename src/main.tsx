import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { App } from "./app.tsx";
import { ThemeBridge } from "./components/theme-bridge.tsx";
import { ThemeColorMeta } from "./components/theme-color-meta.tsx";
import { registerServiceWorker } from "./lib/register-service-worker.ts";
import { followSystemTextScale } from "./lib/system-text-scale.ts";
import "./index.css";

// Before the first render, so text never starts at one size and jumps.
followSystemTextScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* `attribute="class"` matches src/index.css `.dark { ... }`.
        `defaultTheme="system"` honors the user's OS preference until
        they explicitly pick light/dark from Settings → Reading.
        `<ThemeBridge>` syncs the vault's preferences.theme into
        next-themes after the DB hydrates (ADR 022 follow-up). */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeBridge />
      <ThemeColorMeta />
      <App />
    </ThemeProvider>
  </StrictMode>,
);

void registerServiceWorker();
