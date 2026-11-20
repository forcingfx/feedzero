import type { ReaderLineHeight, ReaderTextSize, ReaderWidth } from "@feedzero/core/types";

/**
 * Option lists for the reading controls, shared by Settings, the reader's
 * Aa menu and the list's view options, so a choice never has two names.
 */

/**
 * The four reading sizes as the reader sees them: steps around the
 * device's own text size, smallest first. Shared by every size stepper
 * (Settings, the reader's Aa menu, the list's view options) so the same
 * size never has two names.
 */
export const SIZE_STEPS: readonly { value: ReaderTextSize; label: string }[] = [
  { value: "small", label: "Smaller" },
  { value: "medium", label: "Default" },
  { value: "large", label: "Larger" },
  { value: "x-large", label: "Largest" },
];

export const LINE_HEIGHTS: readonly { value: ReaderLineHeight; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

export const READER_WIDTHS: readonly { value: ReaderWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];
