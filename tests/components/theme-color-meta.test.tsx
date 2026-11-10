/**
 * The browser chrome (Safari tab bar, Android status bar, the PWA frame)
 * takes its colour from <meta name="theme-color">. index.html ships a
 * static #ffffff, so in dark mode the chrome stayed white and flipped
 * dark whenever an overlay (the feed drawer) darkened the page edge.
 * ThemeColorMeta keeps the meta in step with the resolved theme.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { ThemeProvider, useTheme } from "next-themes";
import { ThemeColorMeta, THEME_COLOR_FALLBACK } from "@/components/theme-color-meta";

let setThemeRef: ((t: string) => void) | null = null;
function Probe() {
  const { setTheme } = useTheme();
  setThemeRef = setTheme;
  return null;
}

function mount() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ThemeColorMeta />
      <Probe />
    </ThemeProvider>,
  );
}

const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

describe("<ThemeColorMeta>", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = "#ffffff";
    document.head.appendChild(m);
  });

  it("sets the dark chrome colour when the resolved theme is dark", async () => {
    mount();
    await act(async () => setThemeRef?.("dark"));
    expect(meta()?.content).toBe(THEME_COLOR_FALLBACK.dark);
  });

  it("sets the light chrome colour when the resolved theme is light", async () => {
    mount();
    await act(async () => setThemeRef?.("light"));
    expect(meta()?.content).toBe(THEME_COLOR_FALLBACK.light);
  });

  it("reuses the single meta tag from index.html instead of adding another", async () => {
    mount();
    await act(async () => setThemeRef?.("dark"));
    expect(document.head.querySelectorAll('meta[name="theme-color"]').length).toBe(1);
  });
});
