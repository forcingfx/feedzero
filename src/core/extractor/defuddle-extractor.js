import Defuddle from "defuddle";
import { ok, err } from "../../utils/result.js";
import { sanitize } from "../parser/sanitizer.js";
import { cleanExtractedContent } from "./cleanup.js";

/**
 * Extract readable content from an HTML string using Defuddle.
 * @param {string} html - Raw HTML of the page
 * @param {string} url - Original page URL (used for resolving relative links)
 * @returns {Result<{content: string, title: string, author: string, excerpt: string}>}
 */
export function extract(html, url) {
  if (!html || typeof html !== "string" || !html.trim()) {
    return err("Empty or invalid HTML input");
  }

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Set the base URL so Defuddle can resolve relative links
    const base = doc.createElement("base");
    base.href = url;
    doc.head.prepend(base);

    const defuddle = new Defuddle(doc);
    const result = defuddle.parse();

    if (!result || !result.content) {
      return err("Extraction produced no content");
    }

    return ok({
      content: sanitize(cleanExtractedContent(result.content)),
      title: result.title || "",
      author: result.author || "",
      excerpt: result.description || "",
    });
  } catch (e) {
    return err(`Extraction failed: ${e.message}`);
  }
}
