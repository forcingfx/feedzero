import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { App } from "./app.tsx";
import { ThemeBridge } from "./components/theme-bridge.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* `attribute="class"` matches src/index.css `.dark { ... }`.
        `defaultTheme="system"` honors the user's OS preference until
        they explicitly pick light/dark from Settings → Reading.
        `<ThemeBridge>` syncs the vault's preferences.theme into
        next-themes after the DB hydrates (ADR 022 follow-up). */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeBridge />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
