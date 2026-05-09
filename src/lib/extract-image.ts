import type { Article } from "../types";

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i;
const DIM_ATTR_RE = /\b(width|height)\s*=\s*(?:"|')?(\d+)/gi;
/** Below this on EXPLICIT width/height we treat the image as too small. */
const MIN_DIMENSION = 300;
const THUMB_URL_PATTERNS = [
  /\/thumb(s)?\//i,
  /\/small\//i,
  /\/icon(s)?\//i,
  /[_-]thumb(?:nail)?\b/i,
  /[_-]small\b/i,
  /[_-]icon\b/i,
  /[_-]\d{1,3}x\d{1,3}\b/i,
];

/**
 * Pull a usable HTTPS image URL from an article's content (preferred) or
 * summary fallback. Filters tracking pixels, low-resolution thumbnails, and
 * URLs whose shape signals they aren't a hero image. Returns null rather than
 * displaying a low-quality image.
 */
export function extractImage(article: Article): string | null {
  return findImage(article.content) ?? findImage(article.summary);
}

function findImage(html: string): string | null {
  if (!html) return null;
  IMG_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_TAG_RE.exec(html)) !== null) {
    const tag = match[0];
    const src = extractSrc(tag);
    if (!src) continue;
    if (!src.startsWith("https://")) continue;
    if (matchesThumbnailUrl(src)) continue;
    if (hasSmallExplicitDimension(tag)) continue;
    return src;
  }
  return null;
}

function extractSrc(tag: string): string | null {
  const m = tag.match(SRC_ATTR_RE);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? "").trim();
  return decodeEntities(raw);
}

function matchesThumbnailUrl(url: string): boolean {
  return THUMB_URL_PATTERNS.some((re) => re.test(url));
}

function hasSmallExplicitDimension(tag: string): boolean {
  DIM_ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIM_ATTR_RE.exec(tag)) !== null) {
    const value = parseInt(match[2], 10);
    if (Number.isFinite(value) && value > 0 && value < MIN_DIMENSION) return true;
  }
  return false;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITY_MAP[m] ?? m);
}
