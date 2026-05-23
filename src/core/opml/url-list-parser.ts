import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";

/**
 * Parse a plain text list of URLs (one per line).
 * Skips empty lines and comment lines starting with #.
 * Auto-prefixes URLs without protocol with https://.
 * Returns deduplicated list of valid URLs.
 */
export function parseUrlList(text: string): Result<string[]> {
  if (!text || typeof text !== "string" || !text.trim()) {
    return err("Input is empty");
  }

  const lines = text.split(/\r?\n/);
  const urls = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Try to parse as URL
    const url = normalizeUrl(trimmed);
    if (url) {
      urls.add(url);
    }
  }

  if (urls.size === 0) {
    return err("No valid URLs found");
  }

  return ok(Array.from(urls));
}

/**
 * Normalize a URL string, adding https:// if no protocol present.
 * Returns null if the string is not a valid URL.
 */
function normalizeUrl(input: string): string | null {
  let urlString = input;

  // Add https:// if no protocol
  if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
    urlString = `https://${urlString}`;
  }

  try {
    const url = new URL(urlString);
    // Only accept http/https protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Detect if the input text is OPML format (XML) vs plain URL list.
 */
export function isOpmlFormat(text: string): boolean {
  if (!text) {
    return false;
  }

  const trimmed = text.trim();
  return trimmed.startsWith("<?xml") || trimmed.includes("<opml");
}
