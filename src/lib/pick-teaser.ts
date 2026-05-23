import { decodeEntities } from "./decode-entities.ts";
import type { Article } from "@feedzero/core/types";

/**
 * Pick the best plain-text teaser for an article preview surface.
 *
 * Precedence:
 *   1. Feed-provided `content` or `summary` — usually a hand-written
 *      blurb the publisher meant to be a preview.
 *   2. First sentence(s) of `extractedContent`, capped to `charLimit` —
 *      a graceful fallback when the feed didn't ship a blurb but the
 *      background prefetch grabbed the full body. Better an excerpted
 *      lede than "No preview available."
 *
 * Returns `""` when nothing is available; callers render their own
 * empty-state copy.
 */
export function pickTeaser(article: Article, charLimit: number): string {
  const fromBlurb = toPlainText(article.content) || toPlainText(article.summary);
  if (fromBlurb) return fromBlurb;
  const body = toPlainText(article.extractedContent);
  if (!body) return "";
  return clipToSentences(body, charLimit);
}

function toPlainText(html: string | undefined): string {
  if (!html) return "";
  const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return decodeEntities(stripped);
}

const SENTENCE_BREAK = /(?<=[.!?])\s+/u;

/**
 * Pack whole sentences into a budget. If even the first sentence blows
 * the budget, hard-truncate with an ellipsis — a clipped lede beats
 * nothing.
 */
function clipToSentences(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const sentences = text.split(SENTENCE_BREAK);
  let acc = "";
  for (const s of sentences) {
    const candidate = acc ? `${acc} ${s}` : s;
    if (candidate.length > limit) break;
    acc = candidate;
  }
  if (acc) return acc;
  return text.slice(0, limit).trimEnd() + "…";
}
