import Defuddle from "defuddle";
import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { sanitize } from "../parser/sanitizer.ts";
import { cleanExtractedContent } from "./cleanup.ts";

export interface ExtractionResult {
  content: string;
  title: string;
  author: string;
  excerpt: string;
}

/**
 * Extract readable content from an HTML string using Defuddle.
 */
export function extract(html: string, url: string): Result<ExtractionResult> {
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
    return err(`Extraction failed: ${(e as Error).message}`);
  }
}
