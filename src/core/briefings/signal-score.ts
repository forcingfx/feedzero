/**
 * Signal Score — how strong is the corpus backing a briefing.
 *
 * Pure, deterministic, no LLM. Same family of formula as the Signal
 * frequency engine's `scoreTerms()` — cross-feed corroboration matters
 * more than raw article count, and recency gives a small but real
 * bonus so a stale topic doesn't keep scoring high after coverage dies.
 *
 * Calibration anchors (locked by tests in signal-score.test.ts):
 *   - 1 article, 1 feed                          → below BRIEFING_MIN_SCORE (weak)
 *   - 10 articles across 5 feeds, all recent     → moderate band (30–69)
 *   - 30 articles across 10 feeds, all recent    → strong band (70–100)
 *
 * The score gates the LLM call: a corpus below `BRIEFING_MIN_SCORE` is
 * not corroborated enough to produce a confident briefing, so the
 * service short-circuits to a "not enough evidence" splash before
 * paying for inference. That's where the "show suggested feeds to
 * strengthen the briefing" affordance lives.
 */

import type { MatchedArticle } from "./prompt-matcher";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 14;
const RECENCY_BONUS_CAP = 0.5;
const NORMALIZATION_SCALE = 35;

/**
 * Minimum signal score required to proceed with an LLM call. Below this
 * the service short-circuits to a "not enough evidence" splash and the
 * suggested-feeds affordance, before paying for inference.
 */
export const BRIEFING_MIN_SCORE = 15;

export type ScoreBand = "weak" | "moderate" | "strong";

export interface SignalScoreInput {
  matches: MatchedArticle[];
  /** Override "now" for deterministic tests; defaults to `Date.now()`. */
  now?: number;
}

/**
 * Compute the 0–100 signal score for a set of matched articles.
 *
 * Formula:
 *   raw   = articleCount * log(1 + distinctFeeds) * (1 + recencyBonus)
 *   score = round(100 * (1 - exp(-raw / 35)))
 *
 * The exponential normalization gives a smooth curve that asymptotes to
 * 100, so adding more articles past the "strong" anchor produces
 * diminishing returns rather than score inflation.
 */
export function computeSignalScore(input: SignalScoreInput): number {
  if (input.matches.length === 0) return 0;

  const now = input.now ?? Date.now();
  const cutoff = now - RECENT_WINDOW_DAYS * DAY_MS;

  const feedIds = new Set<string>();
  let recent = 0;
  for (const m of input.matches) {
    feedIds.add(m.article.feedId);
    if (m.article.publishedAt >= cutoff) recent += 1;
  }

  const recencyBonus = RECENCY_BONUS_CAP * (recent / input.matches.length);
  const raw =
    input.matches.length * Math.log(1 + feedIds.size) * (1 + recencyBonus);

  const normalized = 100 * (1 - Math.exp(-raw / NORMALIZATION_SCALE));
  return Math.round(Math.max(0, Math.min(100, normalized)));
}

/** Human-readable band for the gauge UI. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "strong";
  if (score >= 30) return "moderate";
  return "weak";
}
