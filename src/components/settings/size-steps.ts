import type { ReaderTextSize } from "@feedzero/core/types";

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
