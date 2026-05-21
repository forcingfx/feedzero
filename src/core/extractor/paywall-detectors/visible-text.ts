/**
 * Crude visible-text length for a paywall heuristic. Strips scripts, styles,
 * and tag markup; collapses whitespace. We never render the result — only
 * its length matters. The detectors use this to flag a stub article (a page
 * that fetched OK but whose body is tiny because the bulk is behind a gate).
 *
 * NOT a sanitizer. The output is a `number`, never HTML; the only consumer
 * is `length < THRESHOLD` in default-detector.ts. We tolerate whitespace
 * variants in closing tags (`</script >`, `</style\n>`) only because
 * CodeQL's `js/bad-tag-filter` flags the strict form, and because real
 * publisher HTML occasionally serves them. If a stray `<script>` slips
 * through it would *inflate* visible length, making the page less likely
 * to be flagged as paywalled — the opposite of an XSS-style vulnerability.
 *
 * We avoid DOMParser here because detectors must stay sync and dependency-free.
 */
export function visibleTextLength(html: string): number {
  const stripped = html
    .replace(/<script\b[^<]*(?:(?!<\/script\s*>)<[^<]*)*<\/script\s*>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style\s*>)<[^<]*)*<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length;
}
