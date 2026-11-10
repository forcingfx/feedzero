import type { CSSProperties } from "react";

/**
 * The mobile shell's glass bars and the space content keeps clear of them.
 *
 * The header (48 px) and the tab bar (60 px plus the home-indicator inset)
 * float over the content as translucent overlays, so scrolled content
 * shows through them. The shell publishes their heights as CSS variables;
 * each mobile scroller pads by them so its first and last rows rest clear
 * of the glass. Both default to 0 on desktop, where the variables are unset.
 */
export const MOBILE_HEADER_PX = 48;

export const MOBILE_CHROME_VARS = {
  "--chrome-top": `${MOBILE_HEADER_PX}px`,
  "--chrome-bottom": "calc(60px + env(safe-area-inset-bottom))",
} as CSSProperties;

/** Padding for a scroller that runs underneath the glass bars. */
export const CLEAR_MOBILE_CHROME = "pt-[var(--chrome-top,0px)] pb-[var(--chrome-bottom,0px)]";
