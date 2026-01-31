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
 * Determine which content view modes to offer for an article.
 *
 * Rules:
 * - "feed" is always available
 * - "summary" only if the summary text differs from feed content
 * - "extracted" only if the feed lacks full content (content not longer than summary)
 *   and a valid HTTP link exists
 *
 * @param {object} opts
 * @param {string} opts.content - article.content (HTML)
 * @param {string} opts.summary - article.summary (HTML)
 * @param {string} opts.link - article.link (URL)
 * @param {string} [opts.cachedExtraction] - cached extracted HTML, or undefined if not yet fetched
 * @returns {string[]} array of mode names
 */
export function getAvailableModes({ content, summary, link, cachedExtraction }) {
  const strippedContent = stripHtml(content || "");
  const strippedSummary = stripHtml(summary || "");

  const hasSummary = strippedSummary.length > 0;
  const hasDistinctSummary = hasSummary && !textsSimilar(strippedContent, strippedSummary);
  const hasFullContent = hasSummary && strippedContent.length > strippedSummary.length;
  const hasExtractableLink = link?.startsWith("http");

  const modes = ["feed"];

  if (hasDistinctSummary) {
    modes.push("summary");
  }

  if (!hasFullContent && hasExtractableLink) {
    if (cachedExtraction !== undefined) {
      const strippedExtracted = stripHtml(cachedExtraction);
      if (!textsSimilar(strippedContent || strippedSummary, strippedExtracted)) {
        modes.push("extracted");
      }
    } else {
      modes.push("extracted");
    }
  }

  return modes;
}
