/**
 * Clean up extracted HTML content by removing empty elements,
 * collapsing redundant whitespace, and trimming orphaned formatting.
 * Uses DOM manipulation (not regex) for safety.
 * @param {string} html - Raw HTML from extractor
 * @returns {string} Cleaned HTML
 */
export function cleanExtractedContent(html) {
  if (!html || typeof html !== "string") return html;

  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("root");
  if (!root) return html;

  removeEmptyElements(root);
  collapseConsecutiveBrs(root);

  return root.innerHTML.trim();
}

function removeEmptyElements(root) {
  const emptiable = root.querySelectorAll("p, div, span, a");
  for (const el of emptiable) {
    // Keep elements with images or other non-text content
    if (el.querySelector("img, video, iframe, svg")) continue;
    // Remove if no visible text and no child elements with content
    if (!el.textContent.trim() && !el.querySelector("img")) {
      el.remove();
    }
  }
}

function collapseConsecutiveBrs(root) {
  const brs = root.querySelectorAll("br");
  for (const br of brs) {
    // Remove consecutive <br> tags (keep the first)
    while (br.nextSibling && br.nextSibling.nodeName === "BR") {
      br.nextSibling.remove();
    }
    // Also handle whitespace-only text nodes between <br>s
    let next = br.nextSibling;
    while (
      next &&
      next.nodeType === Node.TEXT_NODE &&
      !next.textContent.trim()
    ) {
      const afterText = next.nextSibling;
      if (afterText && afterText.nodeName === "BR") {
        next.remove();
        afterText.remove();
        next = br.nextSibling;
      } else {
        break;
      }
    }
  }
}
