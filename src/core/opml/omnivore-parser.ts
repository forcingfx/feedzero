import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";

/**
 * Parser for Omnivore's "Export Library" JSON. Omnivore shipped a ZIP
 * containing a top-level `metadata.json` index (an array of article
 * objects) plus per-article JSON + markdown content under `content/`.
 *
 * Like the Pocket parser, FeedZero doesn't import individual articles
 * as subscriptions — it extracts the unique source origins and runs
 * each through addFeedFlow, which discovers an RSS feed per site.
 *
 * Omnivore shut down 2024-11-15, so the format is historically frozen.
 */

interface OmnivoreEntry {
  url?: unknown;
  originalUrl?: unknown;
  savedAt?: unknown;
}

/**
 * Detect an Omnivore export. Heuristic: JSON parses to either an array
 * of objects or a single object, where at least one object has both a
 * URL field (`url` or `originalUrl`) and a `savedAt` field. The
 * `savedAt` field is what distinguishes an Omnivore export from a
 * generic JSON array of links — plain URL arrays don't carry it.
 */
export function isOmnivoreExport(text: string): boolean {
  if (!text || typeof text !== "string" || !text.trim()) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  const entries = toEntries(parsed);
  return entries.some(
    (e) => e !== null && typeof e === "object" && "savedAt" in e && !!pickUrl(e),
  );
}

/**
 * Extract unique origin URLs from an Omnivore export. Returns origins
 * sorted alphabetically for deterministic output.
 */
export function parseOmnivoreExport(text: string): Result<string[]> {
  if (!text || typeof text !== "string" || !text.trim()) {
    return err("Input is empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return err(`Failed to parse Omnivore JSON: ${(e as Error).message}`);
  }

  const entries = toEntries(parsed);
  const origins = new Set<string>();
  for (const entry of entries) {
    const href = pickUrl(entry);
    if (!href) continue;
    const origin = toOrigin(href);
    if (origin) origins.add(origin);
  }

  if (origins.size === 0) {
    return err("No valid http(s) URL fields found in Omnivore export");
  }

  return ok(Array.from(origins).sort());
}

function toEntries(parsed: unknown): OmnivoreEntry[] {
  if (Array.isArray(parsed)) return parsed as OmnivoreEntry[];
  if (parsed !== null && typeof parsed === "object")
    return [parsed as OmnivoreEntry];
  return [];
}

function pickUrl(entry: OmnivoreEntry): string | null {
  if (typeof entry.url === "string" && entry.url.trim()) return entry.url;
  if (typeof entry.originalUrl === "string" && entry.originalUrl.trim())
    return entry.originalUrl;
  return null;
}

function toOrigin(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}
