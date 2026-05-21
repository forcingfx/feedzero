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

/** Default article rows rendered per topic before the user expands it. */
export const SIGNAL_ARTICLES_PER_TOPIC = 6;

/**
 * Hard ceiling on articles stored per topic. The engine claims many
 * articles for a cluster (so leftover fragments can't form near-duplicate
 * topics — see `bleed-over guard` in frequency-engine), but the cached
 * report shouldn't carry hundreds of ids per topic when the user only
 * ever sees 6 by default. Bounds localStorage growth.
 */
export const SIGNAL_TOPIC_STORE_CAP = 30;

/** Cache TTL for a generated Signal report (24 hours). */
export const SIGNAL_REPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Window choices the engine tries, in order of preference. */
export const SIGNAL_WINDOWS: readonly WindowChoice[] = ["7d", "14d", "30d", "all"];

export interface Topic {
  /** Lowercased + stemmed term that anchors the cluster. */
  term: string;
  /** The term in its most common original casing across the corpus. */
  displayTerm: string;
  /**
   * Articles assigned to this cluster, ordered most-recent first.
   * Capped at `SIGNAL_TOPIC_STORE_CAP` — the UI shows the first
   * `SIGNAL_ARTICLES_PER_TOPIC` by default and reveals the rest on
   * an "expand" toggle.
   */
  articleIds: string[];
  /**
   * Total articles claimed by this cluster before storage truncation.
   * Drives the "+ N more" affordance and the topic's article count.
   */
  totalArticlesInCluster: number;
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
