/**
 * Crude visible-text length for a paywall heuristic. Strips scripts, styles,
 * and tag markup; collapses whitespace. We never render the result — only
 * its length matters. The detectors use this to flag a stub article (a page
 * that fetched OK but whose body is tiny because the bulk is behind a gate).
 *
 * We avoid DOMParser here because detectors must stay sync and dependency-free.
 * A noisy heuristic is fine — the goal is "obviously too short", not perfect
 * word counting.
 */
export function visibleTextLength(html: string): number {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length;
}
