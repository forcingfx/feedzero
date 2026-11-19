import { decodeEntities } from "./decode-entities.ts";
import type { Article } from "@feedzero/core/types";

/** Longest preview a row keeps; two clamped lines never show more. */
const PREVIEW_CHAR_LIMIT = 280;

/**
 * How much markup to read before giving up. A feed that ships whole
 * articles in `content` would otherwise have every visible row strip
 * tags from tens of kilobytes on each render.
 */
const SOURCE_CHAR_LIMIT = 4000;

/**
 * Plain-text opening lines of an article for its list row, or `""` when
 * there is nothing worth showing.
 *
 * The summary comes first because it is the publisher's own blurb; the
 * body and then the fetched full text stand in when a feed ships none.
 * Text that only repeats the title is dropped: a second copy of the
 * headline tells the reader nothing.
 */
export function articleListPreview(article: Article): string {
  const text =
    toPlainText(article.summary) ||
    toPlainText(article.content) ||
    toPlainText(article.extractedContent);
  if (!text || text === decodeEntities(article.title).trim()) return "";
  if (text.length <= PREVIEW_CHAR_LIMIT) return text;
  return `${text.slice(0, PREVIEW_CHAR_LIMIT).trimEnd()}…`;
}

function toPlainText(html: string | undefined): string {
  if (!html) return "";
  const stripped = html
    .slice(0, SOURCE_CHAR_LIMIT)
    .replace(/<[^>]*>/g, " ")
    // A tag the slice cut in half has no closing bracket to match.
    .replace(/<[^>]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return decodeEntities(stripped);
}
