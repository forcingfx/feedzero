import { FAVICON_PROBE_TIMEOUT_MS, FAVICON_USER_AGENT } from "./favicon-http.ts";

const WELL_KNOWN_PATHS = [
  "/favicon.ico",
  "/favicon.png",
  "/apple-touch-icon.png",
];

const ICON_LINK_RE =
  /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi;
const HREF_RE = /href=["']([^"']+)["']/i;
const SIZES_RE = /sizes=["']([^"']+)["']/i;

/**
 * Resolve the best favicon URL for a given site origin.
 *
 * Strategy (in order):
 * 1. HEAD well-known paths (/favicon.ico, /favicon.png, /apple-touch-icon.png)
 * 2. Fetch HTML and parse <link rel="icon"> tags, prefer largest
 * 3. Fall back to DuckDuckGo icon service
 */
export async function resolveIconUrl(origin: string): Promise<string> {
  const wellKnown = await tryWellKnownPaths(origin);
  if (wellKnown) return wellKnown;

  const htmlIcon = await tryHtmlParsing(origin);
  if (htmlIcon) return htmlIcon;

  return duckDuckGoFallback(origin);
}

async function tryWellKnownPaths(origin: string): Promise<string | null> {
  for (const path of WELL_KNOWN_PATHS) {
    const url = origin + path;
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": FAVICON_USER_AGENT },
        signal: AbortSignal.timeout(FAVICON_PROBE_TIMEOUT_MS),
      });
      if (res.ok && isImageResponse(res)) return url;
    } catch {
      // timeout or network error — try next
    }
  }
  return null;
}

/** Minimum favicon size in bytes — smaller icons are likely placeholders. */
const MIN_ICON_BYTES = 500;

function isImageResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  const cl = res.headers.get("content-length");
  if (!ct.startsWith("image/")) return false;
  // Reject tiny icons (e.g., WordPress 198-byte placeholder favicon.ico)
  if (cl && parseInt(cl) < MIN_ICON_BYTES) return false;
  return true;
}

async function tryHtmlParsing(origin: string): Promise<string | null> {
  try {
    const res = await fetch(origin, {
      headers: { "User-Agent": FAVICON_USER_AGENT },
      signal: AbortSignal.timeout(FAVICON_PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const html = await res.text();
    return pickBestIcon(html, origin);
  } catch {
    return null;
  }
}

interface IconCandidate {
  href: string;
  size: number;
}

function pickBestIcon(html: string, origin: string): string | null {
  const candidates: IconCandidate[] = [];

  let match;
  while ((match = ICON_LINK_RE.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = HREF_RE.exec(tag);
    if (!hrefMatch) continue;

    const rawHref = hrefMatch[1];
    const href = resolveUrl(rawHref, origin);
    if (!href) continue;

    const sizesMatch = SIZES_RE.exec(tag);
    const size = sizesMatch ? parseSize(sizesMatch[1]) : 0;
    candidates.push({ href, size });
  }

  if (candidates.length === 0) return null;

  // Prefer largest icon (better quality at small display sizes)
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].href;
}

function parseSize(sizes: string): number {
  // "192x192" → 192, "any" → 0
  const match = /(\d+)x(\d+)/.exec(sizes);
  return match ? parseInt(match[1]) : 0;
}

function resolveUrl(href: string, origin: string): string | null {
  try {
    return new URL(href, origin).href;
  } catch {
    return null;
  }
}

function duckDuckGoFallback(origin: string): string {
  const host = new URL(origin).host;
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}
