/**
 * Rule-based topic matcher: assign each feed to the topic whose keywords
 * have the strongest weighted match against the feed's metadata and recent
 * article titles.
 *
 * Pure, framework-agnostic, runs entirely in the browser. No data leaves
 * the device — the user's whole feed corpus is the only input.
 */
import type { Article, Feed } from "../../../packages/core/src/types";

export interface Topic {
  /** Stable id used as the result key. */
  id: string;
  /** Human-readable label shown in the UI; also used as the folder name. */
  name: string;
  /** Lowercased keywords matched as whole tokens against feed text. */
  keywords: string[];
}

/**
 * Default topic taxonomy. The user can add, remove, rename, or extend
 * keywords before running the matcher. Keep ids stable (lowercase, no
 * spaces) so that re-runs with a saved taxonomy still match.
 */
export const DEFAULT_TAXONOMY: Topic[] = [
  {
    id: "tech",
    name: "Tech",
    keywords: [
      "tech",
      "software",
      "programming",
      "developer",
      "dev",
      "code",
      "coding",
      "hacker",
      "github",
      "javascript",
      "typescript",
      "python",
      "rust",
      "linux",
      "open source",
      "ai",
      "ml",
      "computer",
      "engineering",
      "engineer",
    ],
  },
  {
    id: "news",
    name: "News",
    keywords: [
      "news",
      "world",
      "politics",
      "political",
      "breaking",
      "headlines",
      "daily",
      "herald",
      "times",
      "post",
      "journal",
      "press",
      "reporter",
      "election",
      "government",
    ],
  },
  {
    id: "business",
    name: "Business",
    keywords: [
      "business",
      "finance",
      "financial",
      "market",
      "markets",
      "economic",
      "economy",
      "startup",
      "startups",
      "vc",
      "investor",
      "investing",
      "stocks",
      "money",
      "bloomberg",
      "founders",
      "founder",
    ],
  },
  {
    id: "science",
    name: "Science",
    keywords: [
      "science",
      "scientific",
      "research",
      "study",
      "studies",
      "quantum",
      "physics",
      "biology",
      "chemistry",
      "medical",
      "medicine",
      "neuroscience",
      "academic",
      "researchers",
      "experiment",
    ],
  },
  {
    id: "culture",
    name: "Culture",
    keywords: [
      "culture",
      "art",
      "arts",
      "music",
      "film",
      "films",
      "movie",
      "movies",
      "cinema",
      "book",
      "books",
      "literature",
      "novel",
      "essay",
      "essays",
      "review",
    ],
  },
  {
    id: "sports",
    name: "Sports",
    keywords: [
      "sport",
      "sports",
      "football",
      "basketball",
      "soccer",
      "baseball",
      "tennis",
      "golf",
      "racing",
      "f1",
      "olympics",
      "league",
      "championship",
      "wimbledon",
    ],
  },
  {
    id: "gaming",
    name: "Gaming",
    keywords: [
      "game",
      "games",
      "gaming",
      "gamer",
      "esport",
      "esports",
      "console",
      "playstation",
      "xbox",
      "nintendo",
      "indie",
      "rpg",
      "fps",
    ],
  },
  {
    id: "food",
    name: "Food",
    keywords: [
      "food",
      "recipe",
      "recipes",
      "cooking",
      "cook",
      "kitchen",
      "restaurant",
      "chef",
      "baking",
      "wine",
      "coffee",
    ],
  },
  {
    id: "lifestyle",
    name: "Lifestyle",
    keywords: [
      "lifestyle",
      "fashion",
      "style",
      "travel",
      "design",
      "home",
      "decor",
      "wellness",
      "fitness",
      "yoga",
    ],
  },
  {
    id: "privacy",
    name: "Privacy & Security",
    keywords: [
      "privacy",
      "security",
      "encryption",
      "cybersecurity",
      "infosec",
      "surveillance",
      "censorship",
      "vpn",
      "tor",
      "cryptography",
    ],
  },
];

/**
 * Sentinel id returned for feeds that don't pass the match threshold.
 * The UI surfaces these as "Uncategorized" — typically left at the top
 * level rather than dumped into a folder.
 */
export const UNCATEGORIZED_ID = "uncategorized";

/**
 * Recent-article titles factor in heavily — they describe what a feed
 * is *currently* publishing, not just what it claims to be. This many
 * articles per feed is sampled (head of the loaded list, ordered newest
 * first).
 */
const RECENT_ARTICLE_SAMPLE = 20;

/**
 * Title hits count more than description hits, which count more than
 * URL or article-title hits. Keeps obvious topic words in titles
 * decisive while still letting article evidence break ties.
 */
const WEIGHTS = {
  title: 3,
  description: 2,
  url: 1,
  articles: 1,
} as const;

/**
 * Minimum total score required to assign a topic. Below this, the feed
 * is left uncategorized rather than mis-filed under a weak match.
 */
const MIN_SCORE = 2;

/**
 * Tokenize a string into lowercased word tokens (alphanum runs, ≥ 2 chars).
 * Multi-word keywords like "open source" are matched separately against
 * the original lowercased text — token-only matching can't see them.
 */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length >= 2,
  );
}

/** Count whole-token hits for a single keyword in a token list. */
function countTokenHits(tokens: Set<string>, keyword: string): number {
  if (keyword.includes(" ")) return 0; // multi-word handled separately
  return tokens.has(keyword) ? 1 : 0;
}

/** Count occurrences of a multi-word keyword in lowercased text. */
function countPhraseHits(text: string, keyword: string): number {
  if (!keyword.includes(" ")) return 0;
  const lower = text.toLowerCase();
  const needle = keyword.toLowerCase();
  let count = 0;
  let idx = lower.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = lower.indexOf(needle, idx + needle.length);
  }
  return count;
}

/** Score a single field (title/description/etc) against a topic's keywords. */
function scoreField(text: string, topic: Topic): number {
  if (!text) return 0;
  const tokens = new Set(tokenize(text));
  let score = 0;
  for (const kw of topic.keywords) {
    if (kw.includes(" ")) {
      score += countPhraseHits(text, kw);
    } else {
      score += countTokenHits(tokens, kw);
    }
  }
  return score;
}

/**
 * Score one feed against one topic by weighting each evidence source.
 * Pure: identical inputs always produce identical outputs.
 */
function scoreFeedForTopic(
  feed: Feed,
  recentTitles: string[],
  topic: Topic,
): number {
  const titleScore = scoreField(feed.title, topic) * WEIGHTS.title;
  const descScore = scoreField(feed.description, topic) * WEIGHTS.description;
  const urlScore = scoreField(feed.url, topic) * WEIGHTS.url;
  const articleScore =
    scoreField(recentTitles.join(" "), topic) * WEIGHTS.articles;
  return titleScore + descScore + urlScore + articleScore;
}

/**
 * Match every feed in the list to its best-fitting topic.
 *
 * @param feeds The feeds to classify.
 * @param articlesByFeedId Recent articles per feed (used to score on
 *   evidence the feed metadata alone may not provide).
 * @param taxonomy Topics to match against; usually DEFAULT_TAXONOMY or
 *   a user-customised version.
 * @returns Map of feedId → topic id (or UNCATEGORIZED_ID if no topic
 *   reached the threshold).
 */
export function matchFeedsToTopics(
  feeds: Feed[],
  articlesByFeedId: Record<string, Article[]>,
  taxonomy: Topic[],
): Map<string, string> {
  const result = new Map<string, string>();

  for (const feed of feeds) {
    const recentTitles = (articlesByFeedId[feed.id] ?? [])
      .slice(0, RECENT_ARTICLE_SAMPLE)
      .map((a) => a.title);

    let bestTopicId = UNCATEGORIZED_ID;
    let bestScore = MIN_SCORE - 1; // anything ≥ MIN_SCORE wins

    for (const topic of taxonomy) {
      const score = scoreFeedForTopic(feed, recentTitles, topic);
      if (score > bestScore) {
        bestScore = score;
        bestTopicId = topic.id;
      }
    }

    result.set(feed.id, bestScore >= MIN_SCORE ? bestTopicId : UNCATEGORIZED_ID);
  }

  return result;
}
