/**
 * Frequency engine for the Signal surface.
 *
 * Pure-function, deterministic, no LLM, no Worker. Given the user's
 * stored articles and feeds, produces a ranked list of topics — terms
 * appearing across multiple feeds in the chosen recency window — with
 * the articles assigned to each.
 *
 * Algorithm:
 *  1. Pick the smallest window with enough articles (7d → 14d → 30d → all).
 *  2. Dedupe near-identical syndicated articles by normalized title.
 *  3. Tokenize title + body (HTML stripped) with light stemming and
 *     stopword + feed-noise filtering.
 *  4. Score each term by `distinctArticles * log(1 + distinctFeeds)`,
 *     keeping only terms that appear in ≥2 articles AND ≥2 feeds.
 *  5. Greedy-cluster: highest-scoring term claims every article that
 *     mentions it, up to a per-topic cap so a single dominant term
 *     can't swallow the whole page.
 *  6. Within each topic, order articles most-recent first.
 *
 * All sorts use total-ordered tiebreaks so the output is deterministic
 * for a given input — the 24h cache in the store depends on this.
 */

import { tokenize } from "./tokenize.ts";
import {
  SIGNAL_MIN_PER_WINDOW,
  SIGNAL_TOPIC_STORE_CAP,
  SIGNAL_TOPIC_TARGET,
  SIGNAL_WINDOWS,
  type SignalReport,
  type Topic,
  type WindowChoice,
} from "./types.ts";
import { ok, type Result } from "../../utils/result.ts";
import type { Article, Feed } from "../../types/index.ts";

/**
 * Optional context the engine might consume in future phases (e.g. folder
 * weighting). Currently unused but accepted at the call site so additive
 * changes don't ripple through every caller.
 */
export interface GenerateContext {
  feeds: Feed[];
}

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_MS: Record<Exclude<WindowChoice, "all">, number> = {
  "7d": 7 * DAY,
  "14d": 14 * DAY,
  "30d": 30 * DAY,
};

export function generateReport(
  articles: Article[],
  _context: GenerateContext,
  now: number,
): Result<SignalReport> {
  const corpusSize = articles.length;
  const { window, inWindow } = pickWindow(articles, now);
  const deduped = dedupeByTitle(inWindow);
  const tokenized = deduped.map((article) => ({
    article,
    tokens: new Set(allTokens(article)),
  }));

  const feedsInWindow = new Set(inWindow.map((a) => a.feedId)).size;

  const termIndex = buildIndex(tokenized);
  const ranked = scoreTerms(termIndex);
  const cap = Math.max(2, Math.ceil(deduped.length / SIGNAL_TOPIC_TARGET) + 5);
  const topics = clusterGreedy(ranked, tokenized, cap);

  return ok({
    topics,
    window,
    corpusSize,
    corpusInWindow: inWindow.length,
    feedsInWindow,
    generatedAt: now,
  });
}

interface TokenizedArticle {
  article: Article;
  tokens: Set<string>;
}

interface TermEntry {
  articleIds: Set<string>;
  feedIds: Set<string>;
}

const WORD_BOUNDARY = /[^\p{L}\p{N}]+/u;

/**
 * Pick the smallest window with enough articles to run on. Exported so
 * the store can detect cache staleness when the user's reading window
 * shifts (recent days went quiet, or the user back-imported old items).
 */
export function pickWindow(
  articles: Article[],
  now: number,
): { window: WindowChoice; inWindow: Article[] } {
  for (const candidate of SIGNAL_WINDOWS) {
    if (candidate === "all") {
      return { window: "all", inWindow: articles };
    }
    const cutoff = now - WINDOW_MS[candidate];
    const inWindow = articles.filter((a) => a.publishedAt >= cutoff);
    if (inWindow.length >= SIGNAL_MIN_PER_WINDOW) {
      return { window: candidate, inWindow };
    }
  }
  return { window: "all", inWindow: articles };
}

function dedupeByTitle(articles: Article[]): Article[] {
  const seen = new Map<string, Article>();
  for (const article of articles) {
    const key = normalizeTitle(article.title);
    if (!key) {
      seen.set(article.id, article);
      continue;
    }
    const existing = seen.get(key);
    if (!existing || article.publishedAt > existing.publishedAt) {
      seen.set(key, article);
    }
  }
  return Array.from(seen.values());
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function allTokens(article: Article): string[] {
  const titleTokens = tokenize(article.title);
  const bodyTokens = tokenize(article.content || article.summary || "");
  return titleTokens.concat(bodyTokens);
}

function buildIndex(tokenized: TokenizedArticle[]): Map<string, TermEntry> {
  const index = new Map<string, TermEntry>();
  for (const { article, tokens } of tokenized) {
    for (const term of tokens) {
      let entry = index.get(term);
      if (!entry) {
        entry = { articleIds: new Set(), feedIds: new Set() };
        index.set(term, entry);
      }
      entry.articleIds.add(article.id);
      entry.feedIds.add(article.feedId);
    }
  }
  return index;
}

interface RankedTerm {
  term: string;
  signal: number;
  articleIds: Set<string>;
  feedCount: number;
}

function scoreTerms(index: Map<string, TermEntry>): RankedTerm[] {
  const out: RankedTerm[] = [];
  for (const [term, entry] of index) {
    if (entry.articleIds.size < 2) continue;
    if (entry.feedIds.size < 2) continue;
    const signal = entry.articleIds.size * Math.log(1 + entry.feedIds.size);
    out.push({
      term,
      signal,
      articleIds: entry.articleIds,
      feedCount: entry.feedIds.size,
    });
  }
  // Total-ordered: signal desc, term asc.
  out.sort((a, b) => (b.signal - a.signal) || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return out;
}

/**
 * Recover the most common original casing of a stem from the articles
 * actually assigned to the cluster. Runs once per surfaced topic
 * (~10 per report) rather than once per indexed term — cheaper and
 * avoids the `ies → y` blind spot of a prefix-match on every term.
 */
function pickDisplayTerm(term: string, articles: Article[]): string {
  const histogram = new Map<string, number>();
  for (const article of articles) {
    const text = article.title + " " + (article.content || article.summary || "");
    for (const word of text.split(WORD_BOUNDARY)) {
      if (!word) continue;
      if (word.toLowerCase().startsWith(term)) {
        histogram.set(word, (histogram.get(word) ?? 0) + 1);
      }
    }
  }
  let best = term;
  let bestCount = 0;
  for (const [casing, count] of histogram) {
    if (count > bestCount || (count === bestCount && casing < best)) {
      best = casing;
      bestCount = count;
    }
  }
  return best;
}

function clusterGreedy(
  ranked: RankedTerm[],
  tokenized: TokenizedArticle[],
  cap: number,
): Topic[] {
  const articleById = new Map(tokenized.map((t) => [t.article.id, t]));
  const claimed = new Set<string>();
  const topics: Topic[] = [];

  for (const term of ranked) {
    if (topics.length >= SIGNAL_TOPIC_TARGET) break;
    const originalSize = term.articleIds.size;
    const candidates: Article[] = [];
    for (const articleId of term.articleIds) {
      if (claimed.has(articleId)) continue;
      const tok = articleById.get(articleId);
      if (!tok) continue;
      candidates.push(tok.article);
    }
    if (candidates.length < 2) continue;

    // Bleed-over guard: if most of this term's articles were already
    // claimed by a higher-signal cluster, this term is just a fragment
    // of that cluster (e.g. "ship" surviving after "OpenAI" claims
    // every "OpenAI ships X" article). Demand ≥50% of the term's
    // original article set survive the peel-off.
    if (candidates.length * 2 < originalSize) continue;

    // Cross-feed check on remaining candidates: the cluster only counts
    // if it still spans ≥2 feeds after greedy claiming peels off articles
    // claimed by stronger terms.
    const feedIds = new Set(candidates.map((a) => a.feedId));
    if (feedIds.size < 2) continue;

    // Most-recent first within the topic. Stable tiebreak by article id.
    candidates.sort((a, b) =>
      (b.publishedAt - a.publishedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    // Claim up to `cap` articles so a co-occurring term (e.g. "ship" in
    // "OpenAI ships X") can't pick up the leftovers and form a near-
    // duplicate cluster. Render limit is enforced separately via
    // SIGNAL_ARTICLES_PER_TOPIC when the topic is consumed.
    const claimedHere = candidates.slice(0, cap);
    for (const article of claimedHere) claimed.add(article.id);

    topics.push({
      term: term.term,
      displayTerm: pickDisplayTerm(term.term, claimedHere),
      articleIds: claimedHere.slice(0, SIGNAL_TOPIC_STORE_CAP).map((a) => a.id),
      totalArticlesInCluster: claimedHere.length,
      feedCount: feedIds.size,
    });
  }

  return topics;
}
