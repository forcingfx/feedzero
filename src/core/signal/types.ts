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

/** Default story rows rendered per topic before the user expands it. */
export const SIGNAL_ARTICLES_PER_TOPIC = 6;

/**
 * Hard ceiling on stories stored per topic. The engine claims many
 * articles for a cluster (so leftover fragments can't form near-duplicate
 * topics — see `bleed-over guard` in frequency-engine), but the cached
 * report shouldn't carry hundreds of stories per topic when the user only
 * ever sees a handful by default. Bounds localStorage growth.
 */
export const SIGNAL_TOPIC_STORE_CAP = 30;

/** Cache TTL for a generated Signal report (24 hours). */
export const SIGNAL_REPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Window choices the engine tries, in order of preference. */
export const SIGNAL_WINDOWS: readonly WindowChoice[] = ["7d", "14d", "30d", "all"];

/**
 * Minimum share of an entity's non-initial occurrences that must be
 * capitalized for it to count as a proper noun. Distinguishes "Apple"
 * (company) from "apple" (fruit) via corpus-wide casing consensus.
 */
export const PROPER_NOUN_RATIO = 0.7;

/**
 * Per-extra-word multiplier applied to a multi-word entity's signal so a
 * compound ("Iran War") outranks its constituent ("Iran") and wins the
 * greedy claim first. The bleed-over guard then suppresses the
 * now-fragmented unigram.
 */
export const PHRASE_BOOST = 0.5;

/**
 * Jaccard overlap of significant title tokens above which two articles in
 * the same topic are treated as the same story (covered by multiple
 * outlets). Catches "same / similar" wording, not just identical titles.
 */
export const STORY_SIMILARITY = 0.6;

/**
 * Bumped whenever the cached `SignalReport` shape changes. The store
 * discards any cached report tagged with a different version so a stale
 * payload from an older build can't mis-render.
 */
export const SIGNAL_REPORT_SCHEMA_VERSION = 2;

/**
 * A group of articles from one or more feeds covering the same story.
 * Single-outlet stories are common; multi-outlet stories (feedCount ≥ 2)
 * are the "covered by N outlets" rows the user wants surfaced.
 */
export interface Story {
  /** Stable id — the most-recent member article's id. */
  id: string;
  /** Representative headline (the most-recent member's title). */
  title: string;
  /** All member article ids, ordered most-recent first. */
  articleIds: string[];
  /** Distinct feeds covering this story. */
  feedCount: number;
}

export interface Topic {
  /** Lowercased entity key that anchors the cluster (proper/compound noun). */
  term: string;
  /** The entity in its most common original casing across the corpus. */
  displayTerm: string;
  /**
   * Stories assigned to this cluster, ordered by outlet count then
   * recency. Capped at `SIGNAL_TOPIC_STORE_CAP` — the UI shows the first
   * `SIGNAL_ARTICLES_PER_TOPIC` by default and reveals the rest on an
   * "expand" toggle.
   */
  stories: Story[];
  /**
   * Total stories claimed by this cluster before storage truncation.
   * Drives the "+ N more" affordance.
   */
  totalStories: number;
  /** Total member articles across all stories in the cluster. */
  totalArticlesInCluster: number;
  /** Distinct feeds the cluster's articles came from. */
  feedCount: number;
}

export interface SignalReport {
  /** Schema version of this cached payload. See `SIGNAL_REPORT_SCHEMA_VERSION`. */
  schemaVersion: number;
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
