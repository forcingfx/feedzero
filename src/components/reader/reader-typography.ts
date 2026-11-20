import type { ReaderLineHeight, ReaderTextSize, ReaderWidth } from "@feedzero/core/types";
import { cn } from "@/lib/utils.ts";

/**
 * Typography of the reading column, shared by the reader and by the
 * preview in Settings → Reading. One builder for both is what keeps the
 * preview accurate: a size the reader gains is a size the preview shows.
 */

/**
 * Body scale per readerTextSize preference. Headings keep their absolute
 * sizes from ArticleContent — the preference tunes reading comfort of
 * body copy, not the whole hierarchy.
 */
const TEXT_SIZE_CLASS: Record<ReaderTextSize, string> = {
  small: "text-sm",
  medium: "",
  large: "text-lg",
  "x-large": "text-xl",
};

/**
 * Reading measure per readerWidth preference. "medium" is the historical
 * 45rem column. This is the ONLY place the measure is set — ArticleContent
 * deliberately carries no max-width of its own, so headings and prose can
 * never end up at two different widths.
 */
const READER_WIDTH_CLASS: Record<ReaderWidth, string> = {
  narrow: "max-w-150",
  medium: "max-w-180",
  wide: "max-w-240",
  full: "max-w-none",
};

/**
 * Line spacing per readerLineHeight preference. Like the measure, it is
 * set only on the column: ArticleContent carries no leading of its own.
 */
const LINE_HEIGHT_CLASS: Record<ReaderLineHeight, string> = {
  compact: "leading-normal",
  normal: "leading-relaxed",
  relaxed: "leading-loose",
};

/** Classes of the article title, above the body in the reading column. */
export const READER_TITLE_CLASS = "text-2xl font-semibold tracking-tight mb-2 break-words";

/**
 * The same measures in pixels, for surfaces that describe a width in
 * words. `null` is "no limit". A test holds this to READER_WIDTH_CLASS.
 */
export const READER_WIDTH_PX: Record<ReaderWidth, number | null> = {
  narrow: 600,
  medium: 720,
  wide: 960,
  full: null,
};

export interface ReaderTypography {
  textSize: ReaderTextSize;
  width: ReaderWidth;
  lineHeight: ReaderLineHeight;
}

/** Text size and line spacing of article text, without a measure. */
export function readerTextClass({
  textSize,
  lineHeight,
}: Pick<ReaderTypography, "textSize" | "lineHeight">): string {
  return cn(TEXT_SIZE_CLASS[textSize], LINE_HEIGHT_CLASS[lineHeight]);
}

/** Classes for the centred reading column under the given preferences. */
export function readerColumnClass({ textSize, width, lineHeight }: ReaderTypography): string {
  return cn("mx-auto", READER_WIDTH_CLASS[width], readerTextClass({ textSize, lineHeight }));
}
