/**
 * IDF-weighted prompt matcher.
 *
 * Pure, deterministic. Given a free-text briefing prompt and the user's
 * article corpus, returns the top-K most-relevant articles ranked by
 * inverse-document-frequency–weighted overlap. Reuses the existing
 * `tokenize()` from the Signal frequency engine so the briefing matcher
 * speaks the same vocabulary the rest of the app does (same stopwords,
 * same stem rules, same feed-noise filters).
 *
 * Why IDF: a prompt like "EU AI Act enforcement" has one rare term
 * ("enforcement") and three common ones ("eu", "ai", "act"). A naive
 * count-matching scheme would over-reward articles that mention "eu"
 * twice; IDF weights each term by how rare it is in the corpus, so the
 * rarest discriminating term ("enforcement") dominates the ranking.
 *
 * Set-based per article: a chatty article that says "AI" five times
 * contributes the same to its score as one that says it once. A
 * term-frequency scheme would let a single noisy article dominate.
 *
 * The matcher is the cheap pre-filter that runs every refresh; the
 * top-K articles it returns are what gets handed to the LLM. The LLM
 * never sees the full corpus.
 */

import type { Article } from "@feedzero/core/types";
import {
  FEED_NOISE,
  STOPWORDS,
  lightStem,
  stripHtml,
} from "../signal/tokenize";

const DEFAULT_TOP_K = 30;

const NON_WORD = /[^\p{L}\p{N}]+/u;
const NUMERIC = /^\d+$/;
/**
 * Briefing-matcher minimum token length. Two chars (not three like the
 * Signal frequency engine) so the matcher can match high-signal short
 * proper nouns the user is overwhelmingly likely to type in a
 * briefing prompt: "EU", "AI", "UK", "US", "UN", "IP". The stopword
 * list still catches "is", "as", "in", etc.
 */
const MIN_LEN_BRIEFING = 2;

/**
 * Lowercase, strip HTML, light-stem, filter stopwords + feed noise,
 * keeping 2-char tokens. Used for both prompt and article body so the
 * two sides agree on what counts as a term.
 */
function tokenizeForBriefing(input: string): string[] {
  if (!input) return [];
  const plain = stripHtml(input).toLowerCase();
  if (!plain.trim()) return [];
  const out: string[] = [];
  for (const token of plain.split(NON_WORD)) {
    if (token.length < MIN_LEN_BRIEFING) continue;
    if (NUMERIC.test(token)) continue;
    if (STOPWORDS.has(token)) continue;
    if (FEED_NOISE.has(token)) continue;
    const stem = lightStem(token);
    if (stem.length < MIN_LEN_BRIEFING) continue;
    if (STOPWORDS.has(stem)) continue;
    if (FEED_NOISE.has(stem)) continue;
    out.push(stem);
  }
  return out;
}

export interface MatchedArticle {
  article: Article;
  score: number;
  matchedTerms: string[];
}

export interface MatchOptions {
  /** Maximum results to return (default 30). */
  topK?: number;
  /** Minimum number of distinct prompt terms an article must match (default 1). */
  minMatches?: number;
}

/**
 * Rank `articles` by relevance to `prompt` and return the top-K. The
 * returned list is sorted by score descending, with `publishedAt`
 * descending as the tiebreak so equally-scored articles surface
 * freshest-first.
 */
export function matchArticles(
  prompt: string,
  articles: Article[],
  options?: MatchOptions,
): MatchedArticle[] {
  const promptTerms = uniq(tokenizeForBriefing(prompt));
  if (promptTerms.length === 0) return [];

  const articleTerms = articles.map((article) => ({
    article,
    terms: new Set(
      tokenizeForBriefing(
        `${article.title} ${article.summary} ${article.content}`,
      ),
    ),
  }));

  const docFreq = new Map<string, number>();
  for (const term of promptTerms) {
    let df = 0;
    for (const { terms } of articleTerms) {
      if (terms.has(term)) df += 1;
    }
    docFreq.set(term, df);
  }

  const N = articleTerms.length || 1;
  const minMatches = options?.minMatches ?? 1;
  const matched: MatchedArticle[] = [];

  for (const { article, terms } of articleTerms) {
    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of promptTerms) {
      if (!terms.has(term)) continue;
      const df = docFreq.get(term) ?? 1;
      // Add-1 smoothing keeps a term that hits every article contributing
      // a small positive amount (so 1-term matches still rank higher
      // than 0-term matches).
      score += Math.log(1 + N / df);
      matchedTerms.push(term);
    }
    if (matchedTerms.length >= minMatches) {
      matched.push({ article, score, matchedTerms });
    }
  }

  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.article.publishedAt ?? 0) - (a.article.publishedAt ?? 0);
  });

  return matched.slice(0, options?.topK ?? DEFAULT_TOP_K);
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
