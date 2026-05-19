import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";

/**
 * Parser for Pocket's HTML export (the file you get from
 * getpocket.com/export). The export is a flat list of *saved articles*,
 * but FeedZero is an RSS reader — we don't want 5,000 individual article
 * subscriptions, we want feed subscriptions to the *sites* the user
 * cared about.
 *
 * So this parser extracts every saved article href, derives the origin
 * (scheme://host), dedupes, and returns the origin list. The import
 * pipeline then runs each origin through addFeedFlow, which already
 * has feed-discovery built in.
 *
 * Pocket's shutdown (2025-11-12) made this format historically frozen,
 * which is convenient: we don't need to chase format changes.
 */

/**
 * Detect a Pocket HTML export. Heuristic: the file contains anchors with
 * a `time_added` attribute — a Pocket-specific marker. We also accept the
 * historical title marker as a secondary signal.
 */
export function isPocketExport(text: string): boolean {
  if (!text) return false;
  const head = text.slice(0, 4096).toLowerCase();
  if (head.includes("<title>pocket export</title>")) return true;
  // The time_added attribute appears on every saved-link anchor in a
  // Pocket export and is not standard HTML — strong signal of the format.
  return /<a[^>]+time_added=/i.test(text);
}

/**
 * Extract unique origin URLs (scheme://host) from a Pocket HTML export.
 * Returns origins sorted alphabetically for deterministic output.
 */
export function parsePocketExport(html: string): Result<string[]> {
  if (!html || typeof html !== "string" || !html.trim()) {
    return err("Input is empty");
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch (e) {
    return err(`Failed to parse Pocket export: ${(e as Error).message}`);
  }

  const anchors = doc.querySelectorAll("a[href]");
  if (anchors.length === 0) {
    return err("No saved links found in Pocket export");
  }

  const origins = new Set<string>();
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute("href")?.trim();
    if (!href) continue;
    const origin = toOrigin(href);
    if (origin) origins.add(origin);
  }

  if (origins.size === 0) {
    return err("No valid http(s) links found in Pocket export");
  }

  return ok(Array.from(origins).sort());
}

/**
 * Reduce a URL to scheme://host. Returns null for invalid URLs or non-http(s)
 * schemes (mailto:, javascript:, data:, etc.).
 */
function toOrigin(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
