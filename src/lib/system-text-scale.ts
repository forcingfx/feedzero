/**
 * Follows the device's text size.
 *
 * The stylesheet sizes everything from one root value multiplied by
 * `--system-text-scale`. This module measures that scale and publishes
 * it. A scale of 1 means the person has changed nothing.
 *
 * Two probes, because platforms expose the setting differently:
 * - `font-size: medium` resolves to the browser's default font size, the
 *   setting desktop browsers and Firefox for Android expose.
 * - `font: -apple-system-body` resolves to the Dynamic Type body size on
 *   iPhone and iPad, where the browser default never moves.
 *
 * Nothing leaves the device: this reads two computed styles and writes
 * one CSS variable.
 */

/** CSS variable the stylesheet multiplies its root sizes by. */
export const SYSTEM_TEXT_SCALE_VAR = "--system-text-scale";

/** Font size every browser ships as its default. */
const BROWSER_DEFAULT_PX = 16;
/** Dynamic Type's body size at the default setting on iOS and iPadOS. */
const APPLE_DEFAULT_BODY_PX = 17;

/**
 * Past 2x the fixed chrome (tab bar, pills) stops fitting a phone, and
 * below 0.75x text is unreadable, so the app follows the device within
 * that range.
 */
const MIN_SCALE = 0.75;
const MAX_SCALE = 2;

export interface SystemTextSizes {
  /** Computed size of `font-size: medium`. */
  browserDefaultPx: number;
  /** Computed size of `font: -apple-system-body`, or null off Apple touch devices. */
  appleBodyPx: number | null;
}

/** The device's text size relative to its platform default, clamped. */
export function computeSystemTextScale({ browserDefaultPx, appleBodyPx }: SystemTextSizes): number {
  const raw =
    appleBodyPx !== null
      ? appleBodyPx / APPLE_DEFAULT_BODY_PX
      : browserDefaultPx / BROWSER_DEFAULT_PX;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Dynamic Type is only meaningful on iPhone and iPad. Safari on a Mac
 * accepts the same keyword but resolves it to 13px, which would shrink
 * the whole app there.
 */
function supportsDynamicType(): boolean {
  return (
    typeof CSS !== "undefined" &&
    CSS.supports?.("font", "-apple-system-body") === true &&
    navigator.maxTouchPoints > 0
  );
}

function probeFontSizePx(style: string): number {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;${style}`;
  document.body.appendChild(probe);
  const px = Number.parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return px;
}

/** Read the device's current text sizes from the live document. */
export function measureSystemTextSizes(): SystemTextSizes {
  return {
    browserDefaultPx: probeFontSizePx("font-size:medium;"),
    appleBodyPx: supportsDynamicType() ? probeFontSizePx("font:-apple-system-body;") : null,
  };
}

/** Measure the device's text scale and publish it for the stylesheet. */
export function applySystemTextScale(measure: () => SystemTextSizes = measureSystemTextSizes): void {
  const scale = computeSystemTextScale(measure());
  document.documentElement.style.setProperty(SYSTEM_TEXT_SCALE_VAR, String(scale));
}

/**
 * Apply the scale now and again whenever the app comes back to the
 * foreground: changing the text size means leaving for the device's
 * settings, so returning is when a new value shows up. Returns a cleanup.
 */
export function followSystemTextScale(): () => void {
  applySystemTextScale();
  const reapply = () => {
    if (document.visibilityState === "visible") applySystemTextScale();
  };
  document.addEventListener("visibilitychange", reapply);
  window.addEventListener("pageshow", reapply);
  return () => {
    document.removeEventListener("visibilitychange", reapply);
    window.removeEventListener("pageshow", reapply);
  };
}
