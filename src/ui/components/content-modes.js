/**
 * Pure functions for computing which content view modes are available.
 */

export function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function textsSimilar(a, b) {
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  const snippet = shorter.slice(0, 150);
  return snippet.length > 0 && longer.slice(0, 300).includes(snippet);
}

/**
 * Whether the article summary should be shown as an inline subheading
 * above the feed content. True when both exist and are distinctly different.
 *
 * @param {string} content - article.content (HTML)
 * @param {string} summary - article.summary (HTML)
 * @returns {boolean}
 */
export function hasSummarySubheading(content, summary) {
  const sc = stripHtml(content || "");
  const ss = stripHtml(summary || "");
  return sc.length > 0 && ss.length > 0 && !textsSimilar(sc, ss);
}

/** Count words in a plain-text string. */
function countWords(text) {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

const MIN_WORDS_FOR_FULL_ARTICLE = 100;

/**
 * Whether extracted content is meaningfully richer than the feed content.
 * Requires both a minimum absolute word increase (100+) and a relative
 * increase (50%+) to filter out extractions that only added boilerplate.
 *
 * @param {string} feedText - plain text of feed content (already stripped)
 * @param {string} extractedText - plain text of extracted content (already stripped)
 * @returns {boolean}
 */
export function isExtractionMeaningful(feedText, extractedText) {
  if (!feedText || !extractedText) return false;
  if (textsSimilar(feedText, extractedText)) return false;

  const feedWords = countWords(feedText);
  const extractedWords = countWords(extractedText);
  const wordIncrease = extractedWords - feedWords;
  const percentIncrease = feedWords > 0 ? wordIncrease / feedWords : 0;

  return wordIncrease >= 100 && percentIncrease >= 0.5;
}

/**
 * Determine which content view modes to offer for an article.
 *
 * Rules:
 * - "feed" is always available
 * - "extracted" only if the feed lacks full content and a valid HTTP link exists.
 *   Full content is detected when content is longer than summary, or when
 *   content equals summary (description-only feed) with 100+ words.
 *
 * @param {object} opts
 * @param {string} opts.content - article.content (HTML)
 * @param {string} opts.summary - article.summary (HTML)
 * @param {string} opts.link - article.link (URL)
 * @param {string} [opts.cachedExtraction] - cached extracted HTML, or undefined if not yet fetched
 * @returns {string[]} array of mode names
 */
export function getAvailableModes({
  content,
  summary,
  link,
  cachedExtraction,
}) {
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
