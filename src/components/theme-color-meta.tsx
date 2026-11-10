import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Hex twins of `--background` in index.css, for browsers that cannot
 * resolve the page's computed background (and for tests). Keep in step
 * with the `:root` and `.dark` tokens.
 */
export const THEME_COLOR_FALLBACK = {
  light: "#fefdfb",
  dark: "#0d0c13",
} as const;

/**
 * Keeps <meta name="theme-color"> in step with the resolved theme.
 *
 * The browser chrome (Safari's bars, Android's status bar, the PWA frame)
 * is painted from that meta. index.html ships a static light value, so
 * in dark mode the chrome stayed light and flipped dark whenever the feed
 * drawer's overlay darkened the page edge behind it. Painting the chrome
 * the app's own background colour removes the flip: the overlay darkens
 * dark, not light.
 *
 * Renders nothing; mount once inside ThemeProvider.
 */
export function ThemeColorMeta(): null {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
    const meta = ensureThemeColorMeta();
    meta.content = pageBackground() ?? THEME_COLOR_FALLBACK[resolvedTheme];
  }, [resolvedTheme]);

  return null;
}

function ensureThemeColorMeta(): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (existing) return existing;
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
  return meta;
}

/**
 * The body's painted background as `rgb(…)`, or null. Engines that keep
 * the token's own notation (`oklch(…)`) and test DOMs (empty, transparent)
 * fall through to the hex twin: every theme-color parser reads hex and
 * rgb, not every one reads oklch.
 */
function pageBackground(): string | null {
  const color = getComputedStyle(document.body).backgroundColor;
  if (!/^rgb\(/.test(color) || color === "rgba(0, 0, 0, 0)") return null;
  return color;
}
