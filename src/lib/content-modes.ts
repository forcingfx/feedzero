/**
 * Pure functions for computing which content view modes are available.
 */

export function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function textsSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  const snippet = shorter.slice(0, 150);
  return snippet.length > 0 && longer.slice(0, 300).includes(snippet);
}

/**
 * Whether the article summary should be shown as an inline subheading
 * above the feed content. True when both exist and are distinctly different.
 */
export function hasSummarySubheading(content: string, summary: string): boolean {
  const sc = stripHtml(content || "");
  const ss = stripHtml(summary || "");
  return sc.length > 0 && ss.length > 0 && !textsSimilar(sc, ss);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

const VISIBLE_MEDIA_SELECTOR =
  "img, video, audio, iframe, picture, svg, embed, object, source";

/**
 * Whether `html` would render anything the user can see — readable text
 * OR a visible media element (image, video, audio, iframe, embed). Used
 * by `isFeedBlurbEmpty` to decide whether the Feed view would be a blank
 * pane worth bypassing.
 *
 * Earlier this lived inline as `stripHtml(html).length > 0`, which only
 * sees text. A photo blog or podcast feed whose blurb is `<img>` or
 * `<audio>` strips to empty text but is NOT blank — the picture / player
 * IS the content, and auto-switching to extracted view throws it away.
 */
function hasVisibleBlurbContent(html: string): boolean {
  if (!html) return false;
  if (stripHtml(html).length > 0) return true;
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.querySelector(VISIBLE_MEDIA_SELECTOR) !== null;
}

/**
 * True when the feed view would render nothing — neither content nor
 * summary carries readable text or visible media. Used by the reader to
 * auto-switch to Full text so the user doesn't land on a blank pane.
 *
 * Media counts as visible content: image-only photo posts, YouTube
 * embeds, and `<audio>` podcast players are the point of the entry,
 * not a teaser to bypass.
 */
export function isFeedBlurbEmpty(content: string, summary: string): boolean {
  return !hasVisibleBlurbContent(content) && !hasVisibleBlurbContent(summary);
}

const MIN_WORDS_FOR_FULL_ARTICLE = 100;

/**
 * Whether extracted content is meaningfully richer than the feed content.
 * Requires both a minimum absolute word increase (100+) and a relative
 * increase (50%+) to filter out extractions that only added boilerplate.
 */
export function isExtractionMeaningful(feedText: string, extractedText: string): boolean {
  if (!feedText || !extractedText) return false;
  if (textsSimilar(feedText, extractedText)) return false;

  const feedWords = countWords(feedText);
  const extractedWords = countWords(extractedText);
  const wordIncrease = extractedWords - feedWords;
  const percentIncrease = feedWords > 0 ? wordIncrease / feedWords : 0;

  return wordIncrease >= 100 && percentIncrease >= 0.5;
}

interface GetAvailableModesOptions {
  content: string;
  summary: string;
  link: string;
  cachedExtraction?: string;
}

/**
 * Determine which content view modes to offer for an article.
 *
 * Rules:
 * - "feed" is always available
 * - "extracted" only if the feed lacks full content and a valid HTTP link exists.
 */
export function getAvailableModes({
  content,
  summary,
  link,
  cachedExtraction,
}: GetAvailableModesOptions): string[] {
  const strippedContent = stripHtml(content || "");
  const strippedSummary = stripHtml(summary || "");

  const hasSummary = strippedSummary.length > 0;
  const contentIsSummary =
    hasSummary && textsSimilar(strippedContent, strippedSummary);
  const hasFullContent =
    hasSummary &&
    (strippedContent.length > strippedSummary.length ||
      (contentIsSummary &&
        countWords(strippedContent) >= MIN_WORDS_FOR_FULL_ARTICLE));
  const hasExtractableLink = link?.startsWith("http");

  const modes = ["feed"];

  if (!hasFullContent && hasExtractableLink) {
    if (cachedExtraction !== undefined) {
      const strippedExtracted = stripHtml(cachedExtraction);
      if (
        isExtractionMeaningful(
          strippedContent || strippedSummary,
          strippedExtracted,
        )
      ) {
        modes.push("extracted");
      }
    } else {
      modes.push("extracted");
    }
  }

  return modes;
}
