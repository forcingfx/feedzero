/**
 * Frequency engine for the Signal surface.
 *
 * Pure-function, deterministic, no LLM, no Worker. Given the user's
 * stored articles and feeds, produces a ranked list of topics — proper
 * nouns and compound nouns appearing across multiple feeds in the chosen
 * recency window — with the stories (multi-outlet article groups) assigned
 * to each.
 *
 * Algorithm:
 *  1. Pick the smallest window with enough articles (7d → 14d → 30d → all).
 *  2. Group byte-identical syndicated articles by normalized title, keeping
 *     a representative per story plus its cross-feed members.
 *  3. Extract named entities (proper/compound nouns) from each
 *     representative via capitalization consensus — no common nouns.
 *  4. Score each entity by `distinctArticles * log(1 + distinctFeeds)`,
 *     boosted for multi-word compounds, keeping only entities in ≥2
 *     articles AND ≥2 feeds.
 *  5. Greedy-cluster: highest-scoring entity claims every representative
 *     that mentions it, up to a per-topic cap so a single dominant entity
 *     can't swallow the page.
 *  6. Within each topic, merge representatives into stories (same/similar
 *     headline) so the UI can show "covered by N outlets".
 *
 * All sorts use total-ordered tiebreaks so the output is deterministic for
 * a given input — the 24h cache in the store depends on this.
 */

import { buildLexicon, extractEntities } from "./entities.ts";
import { groupIntoStories } from "./stories.ts";
import {
  PHRASE_BOOST,
  SIGNAL_MIN_PER_WINDOW,
  SIGNAL_REPORT_SCHEMA_VERSION,
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
  const { reps, members } = groupExactDuplicates(inWindow);

  const lexicon = buildLexicon(reps);
  const tokenized = reps.map((article) => ({
    article,
    occurrences: extractEntities(article, lexicon),
  }));

  const feedsInWindow = new Set(inWindow.map((a) => a.feedId)).size;

  const termIndex = buildIndex(tokenized);
  const ranked = scoreTerms(termIndex);
  const cap = Math.max(2, Math.ceil(reps.length / SIGNAL_TOPIC_TARGET) + 5);
  const topics = clusterGreedy(ranked, tokenized, members, cap);

  return ok({
    schemaVersion: SIGNAL_REPORT_SCHEMA_VERSION,
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
  occurrences: ReturnType<typeof extractEntities>;
}

interface TermEntry {
  articleIds: Set<string>;
  feedIds: Set<string>;
  words: number;
  casings: Map<string, number>;
}

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

/**
 * Group byte-identical syndicated articles by normalized title. Returns a
 * representative (most recent) per story for scoring/clustering, plus a
 * map from the representative's id to every member sharing its title — so
 * a topic can later show how many outlets ran the story.
 */
function groupExactDuplicates(articles: Article[]): {
  reps: Article[];
  members: Map<string, Article[]>;
} {
  const byKey = new Map<string, Article[]>();
  const standalone: Article[] = [];
  for (const article of articles) {
    const key = normalizeTitle(article.title);
    if (!key) {
      standalone.push(article);
      continue;
    }
    const group = byKey.get(key);
    if (group) group.push(article);
    else byKey.set(key, [article]);
  }

  const reps: Article[] = [];
  const members = new Map<string, Article[]>();
  for (const group of byKey.values()) {
    const rep = mostRecent(group);
    reps.push(rep);
    members.set(rep.id, group);
  }
  for (const article of standalone) {
    reps.push(article);
    members.set(article.id, [article]);
  }
  return { reps, members };
}

function mostRecent(group: Article[]): Article {
  return group.reduce((best, a) =>
    a.publishedAt > best.publishedAt ||
    (a.publishedAt === best.publishedAt && a.id < best.id)
      ? a
      : best,
  );
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildIndex(tokenized: TokenizedArticle[]): Map<string, TermEntry> {
  const index = new Map<string, TermEntry>();
  for (const { article, occurrences } of tokenized) {
    const seen = new Set<string>();
    for (const occ of occurrences) {
      let entry = index.get(occ.key);
      if (!entry) {
        entry = { articleIds: new Set(), feedIds: new Set(), words: occ.words, casings: new Map() };
        index.set(occ.key, entry);
      }
      entry.casings.set(occ.display, (entry.casings.get(occ.display) ?? 0) + 1);
      if (!seen.has(occ.key)) {
        entry.articleIds.add(article.id);
        entry.feedIds.add(article.feedId);
        seen.add(occ.key);
      }
    }
  }
  return index;
}

interface RankedTerm {
  term: string;
  displayTerm: string;
  signal: number;
  articleIds: Set<string>;
  feedCount: number;
}

function scoreTerms(index: Map<string, TermEntry>): RankedTerm[] {
  const out: RankedTerm[] = [];
  for (const [term, entry] of index) {
    if (entry.articleIds.size < 2) continue;
    if (entry.feedIds.size < 2) continue;
    const base = entry.articleIds.size * Math.log(1 + entry.feedIds.size);
    const signal = base * (1 + PHRASE_BOOST * (entry.words - 1));
    out.push({
      term,
      displayTerm: pickDisplay(entry.casings, term),
      signal,
      articleIds: entry.articleIds,
      feedCount: entry.feedIds.size,
    });
  }
  // Total-ordered: signal desc, term asc.
  out.sort((a, b) => (b.signal - a.signal) || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return out;
}

function pickDisplay(casings: Map<string, number>, fallback: string): string {
  let best = fallback;
  let bestCount = -1;
  for (const [casing, count] of casings) {
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
  members: Map<string, Article[]>,
  cap: number,
): Topic[] {
  const articleById = new Map(tokenized.map((t) => [t.article.id, t.article]));
  const claimed = new Set<string>();
  const topics: Topic[] = [];

  for (const term of ranked) {
    if (topics.length >= SIGNAL_TOPIC_TARGET) break;
    const originalSize = term.articleIds.size;
    const candidates: Article[] = [];
    for (const articleId of term.articleIds) {
      if (claimed.has(articleId)) continue;
      const article = articleById.get(articleId);
      if (!article) continue;
      candidates.push(article);
    }
    if (candidates.length < 2) continue;

    // Bleed-over guard: if most of this entity's articles were already
    // claimed by a higher-signal cluster (typically the compound that
    // contains it — "Iran War" claiming the "Iran" articles), this entity
    // is a fragment, not its own topic. Demand ≥50% survive the peel-off.
    if (candidates.length * 2 < originalSize) continue;

    const feedIds = new Set(candidates.map((a) => a.feedId));
    if (feedIds.size < 2) continue;

    // Claim representatives most-recent first so the per-topic cap keeps
    // the freshest stories. Stable tiebreak by id.
    candidates.sort((a, b) =>
      (b.publishedAt - a.publishedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const claimedHere = candidates.slice(0, cap);
    for (const article of claimedHere) claimed.add(article.id);

    const stories = groupIntoStories(claimedHere, members);
    const allMembers = stories.reduce((n, s) => n + s.articleIds.length, 0);
    const topicFeeds = new Set<string>();
    for (const article of claimedHere) {
      for (const m of members.get(article.id) ?? [article]) topicFeeds.add(m.feedId);
    }

    topics.push({
      term: term.term,
      displayTerm: term.displayTerm,
      stories: stories.slice(0, SIGNAL_TOPIC_STORE_CAP),
      totalStories: stories.length,
      totalArticlesInCluster: allMembers,
      feedCount: topicFeeds.size,
    });
  }

  return topics;
}
