import type { CSSProperties } from "react";

/**
 * The mobile shell's floating chrome and the space content keeps clear
 * of it.
 *
 * There is no header bar: the top clearance is the status bar's safe area
 * and nothing else. The floating tab-bar capsule (56 px, inset above the
 * home indicator) is a translucent overlay, so scrolled content shows
 * through it. The shell publishes both clearances as CSS variables; each
 * mobile scroller pads by them so its first and last rows rest clear.
 * Both default to 0 on desktop, where the variables are unset.
 */
export const MOBILE_CHROME_VARS = {
  "--chrome-top": "env(safe-area-inset-top)",
  // Floating capsule: 56 px tall, 8 px above the home indicator, 8 px of air above it.
  "--chrome-bottom": "calc(72px + env(safe-area-inset-bottom))",
} as CSSProperties;

/**
 * Height of the phone list's title block (view name + unread count). The
 * article list's virtualizer needs it as a number: the rows start this
 * far down the scroller.
 */
export const MOBILE_LIST_TITLE_PX = 68;

/** Padding for a scroller that runs underneath the glass bars. */
export const CLEAR_MOBILE_CHROME = "pt-[var(--chrome-top,0px)] pb-[var(--chrome-bottom,0px)]";
