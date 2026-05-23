/** Boilerplate patterns: case-insensitive exact matches for short standalone elements. */
const BOILERPLATE_EXACT = new Set([
  "share",
  "save",
  "comments",
  "comment",
  "print",
  "close",
  "read more",
  "read full article",
  "continue reading",
  "continue reading...",
  "continue reading\u2026",
  "read more...",
  "read more\u2026",
]);

/** Boilerplate regex patterns for date lines embedded by publishers. */
const BOILERPLATE_REGEX = /^published\s+(on\s+)?\d/i;

/** Maximum character length for an element to be considered boilerplate. */
const BOILERPLATE_MAX_LENGTH = 80;

/** Minimum dimension (px) — images with both width AND height below this are removed. */
const TINY_IMAGE_THRESHOLD = 120;

/**
 * Normalize text for comparison: lowercase, collapse whitespace, trim.
 */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Clean up extracted HTML content by removing empty elements,
 * collapsing redundant whitespace, and trimming orphaned formatting.
 * Uses DOM manipulation (not regex) for safety.
 */
export function cleanExtractedContent(html: string): string {
  if (!html || typeof html !== "string") return html;

  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("root");
  if (!root) return html;

  removeEmptyElements(root);
  collapseConsecutiveBrs(root);
  lazyLoadImages(root);

  return root.innerHTML.trim();
}

/**
 * Annotate every `<img>` in the extracted HTML with native lazy-loading
 * and async decoding when the publisher didn't already specify them.
 * Long-form articles routinely embed dozens of images; loading them
 * eagerly on the first paint of the reader pane is wasted bytes
 * (most are below the fold), wasted main-thread time (decoding),
 * and a real-world memory hit on mobile. Standard HTML attributes —
 * already in the DOMPurify allowlist — so no new sanitization rule
 * is needed.
 */
function lazyLoadImages(root: HTMLElement): void {
  const images = root.querySelectorAll("img");
  for (const img of images) {
    if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
    if (!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
  }
}

/**
 * Clean feed content by stripping publisher boilerplate, duplicate titles,
 * and tiny thumbnail images. Called at parse time before storage.
 */
export function cleanFeedContent(
  html: string,
  articleTitle?: string,
): string {
  if (!html || typeof html !== "string") return html;

  // Skip DOMParser round-trip for plain text (no HTML tags) to avoid
  // entity re-encoding (e.g., bare & becoming &amp;)
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("root");
  if (!root) return html;

  if (articleTitle) removeDuplicateTitle(root, articleTitle);
  removeBoilerplate(root);
  removeTinyImages(root);
  removeEmptyElements(root);
  collapseConsecutiveBrs(root);

  return root.innerHTML.trim();
}

/**
 * Remove the first heading if it duplicates the article title.
 * Only removes when it's the very first child element in the content.
 */
function removeDuplicateTitle(root: HTMLElement, articleTitle: string): void {
  const normalizedTitle = normalizeText(articleTitle);
  if (!normalizedTitle) return;

  // Find the first element child (skip whitespace text nodes)
  const firstElement = root.querySelector(":scope > *");
  if (!firstElement) return;

  if (!/^H[1-6]$/.test(firstElement.tagName)) return;

  const headingText = normalizeText(firstElement.textContent || "");
  if (headingText === normalizedTitle) {
    firstElement.remove();
  }
}

/**
 * Remove standalone short elements that match common publisher boilerplate
 * (Share, Save, Comments, Read full article, Published On..., etc.).
 */
function removeBoilerplate(root: HTMLElement): void {
  const candidates = root.querySelectorAll("p, div, span, a");
  for (const el of candidates) {
    // Skip elements containing media
    if (el.querySelector("img, video, iframe, svg")) continue;

    const text = (el.textContent || "").trim();
    if (text.length > BOILERPLATE_MAX_LENGTH) continue;

    const normalized = normalizeText(text);
    if (BOILERPLATE_EXACT.has(normalized) || BOILERPLATE_REGEX.test(normalized)) {
      el.remove();
    }
  }
}

/**
 * Remove images where both width and height attributes are present
 * and both are below the tiny image threshold. Cleans up empty parent
 * figures left behind.
 */
function removeTinyImages(root: HTMLElement): void {
  const images = root.querySelectorAll("img");
  for (const img of images) {
    const widthAttr = img.getAttribute("width");
    const heightAttr = img.getAttribute("height");

    // Only remove when both dimensions are explicitly specified and tiny
    if (!widthAttr || !heightAttr) continue;

    const width = parseInt(widthAttr, 10);
    const height = parseInt(heightAttr, 10);
    if (isNaN(width) || isNaN(height)) continue;

    if (width < TINY_IMAGE_THRESHOLD && height < TINY_IMAGE_THRESHOLD) {
      const parent = img.parentElement;
      img.remove();

      // Clean up empty parent figure
      if (
        parent &&
        parent.tagName === "FIGURE" &&
        !parent.textContent?.trim() &&
        !parent.querySelector("img, video, iframe")
      ) {
        parent.remove();
      }
    }
  }
}

function removeEmptyElements(root: HTMLElement): void {
  const emptiable = root.querySelectorAll("p, div, span, a");
  for (const el of emptiable) {
    // Keep elements with images or other non-text content
    if (el.querySelector("img, video, iframe, svg")) continue;
    // Remove if no visible text and no child elements with content
    if (!el.textContent?.trim() && !el.querySelector("img")) {
      el.remove();
    }
  }
}

function collapseConsecutiveBrs(root: HTMLElement): void {
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
      !next.textContent?.trim()
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
