/**
 * Signal domain types shared by the frequency engine, the store, and the
 * page. Pure data — no React, no DOM, no Result wrapping (callers use
 * `Result<SignalReport>` at the boundary).
 */

export type WindowChoice = "7d" | "14d" | "30d" | "all";

/**
 * Below this corpus size, the Signal surface stays locked. The "noise to
 * filter" framing only makes sense once the user has a corpus worth
 * ranking — under ~100 articles cross-feed clusters are mostly luck.
 */
export const SIGNAL_CORPUS_GATE = 100;

/** Minimum articles inside the chosen window before we run the engine. */
export const SIGNAL_MIN_PER_WINDOW = 50;

/** Maximum topics surfaced on the Signal page. */
export const SIGNAL_TOPIC_TARGET = 10;

/** Maximum article rows rendered per topic. */
export const SIGNAL_ARTICLES_PER_TOPIC = 6;

/** Cache TTL for a generated Signal report (24 hours). */
export const SIGNAL_REPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Window choices the engine tries, in order of preference. */
export const SIGNAL_WINDOWS: readonly WindowChoice[] = ["7d", "14d", "30d", "all"];

export interface Topic {
  /** Lowercased + stemmed term that anchors the cluster. */
  term: string;
  /** The term in its most common original casing across the corpus. */
  displayTerm: string;
  /** Articles assigned to this cluster, ordered most-recent first. */
  articleIds: string[];
  /** Distinct feeds the cluster's articles came from. */
  feedCount: number;
}

export interface SignalReport {
  topics: Topic[];
  window: WindowChoice;
  /** Total articles in the user's store at generation time. */
  corpusSize: number;
  /** Articles falling inside the chosen window. */
  corpusInWindow: number;
  /** Distinct feeds contributing articles to the chosen window. */
  feedsInWindow: number;
  /** Unix epoch ms when this report was generated. */
  generatedAt: number;
}
