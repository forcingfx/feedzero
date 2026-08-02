/**
 * Expanded hit areas for visually-compact controls (Apple HIG: 44pt
 * minimum effective tap target). The control keeps its rendered size;
 * an invisible ::after pseudo-element absorbs nearby taps.
 *
 * Sizing math: a h-7 (28px) control + `-inset-2` (2 × 8px) = 44px.
 */

/** All-direction expansion — for isolated round buttons (star, share). */
export const TAP_TARGET_EXPAND =
  "relative after:absolute after:-inset-2 after:content-['']";

/**
 * Vertical-only expansion — for buttons inside a horizontal group
 * (segmented controls, pill rows) where sideways growth would overlap
 * the neighbouring segment and bias taps to the later sibling.
 */
export const TAP_TARGET_EXPAND_Y =
  "relative after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']";
