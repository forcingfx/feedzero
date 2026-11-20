import type { ListTextSize } from "@feedzero/core/types";

/**
 * Font size of the article list per listTextSize preference: steps from
 * the device's own text size (`.reading-size-*` in index.css). Rows size
 * their text, icons and padding in `em`, so this one class scales a row.
 */
export const LIST_TEXT_SIZE_CLASS: Record<ListTextSize, string> = {
  small: "reading-size-small",
  medium: "reading-size-medium",
  large: "reading-size-large",
  "x-large": "reading-size-x-large",
};
