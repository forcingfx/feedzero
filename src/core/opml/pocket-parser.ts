import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";

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

/**
 * Detect a Pocket CSV export. Late-stage Pocket exports were CSV with a
 * `title, url, time_added, tags, status` header (order varied by tool).
 * Heuristic: a header row whose lowercased columns include both `url`
 * and `time_added` — the latter is Pocket-specific and not standard CSV.
 */
export function isPocketCsvExport(text: string): boolean {
  if (!text) return false;
  const firstLine = text.slice(0, 2048).split(/\r?\n/, 1)[0];
  if (!firstLine) return false;
  const columns = parseCsvRow(firstLine).map((c) => c.trim().toLowerCase());
  return columns.includes("url") && columns.includes("time_added");
}

/**
 * Extract unique origin URLs from a Pocket CSV export. Returns origins
 * sorted alphabetically for deterministic output.
 *
 * The CSV is best-effort: Pocket's late-stage export tool produced
 * standard RFC 4180-ish CSV with quoted fields. We handle quoted and
 * unquoted columns, embedded commas inside quotes, and skip the header.
 */
export function parsePocketCsvExport(text: string): Result<string[]> {
  if (!text || typeof text !== "string" || !text.trim()) {
    return err("Input is empty");
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) return err("Input is empty");

  const header = parseCsvRow(lines[0]).map((c) => c.trim().toLowerCase());
  const urlIdx = header.indexOf("url");
  if (urlIdx === -1) {
    return err("Pocket CSV is missing the 'url' header column");
  }

  const origins = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const href = cells[urlIdx]?.trim();
    if (!href) continue;
    const origin = toOrigin(href);
    if (origin) origins.add(origin);
  }

  if (origins.size === 0) {
    return err("No valid http(s) URLs found in Pocket CSV export");
  }

  return ok(Array.from(origins).sort());
}

/**
 * Minimal RFC 4180-ish CSV row parser: handles quoted fields, embedded
 * commas inside quotes, and the "" escape for a literal quote. Doesn't
 * span newlines because Pocket exports don't embed them — keeping it
 * line-by-line means we can stream through `split(/\r?\n/)`.
 */
function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
