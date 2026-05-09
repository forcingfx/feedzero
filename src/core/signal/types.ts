/**
 * Domain types for the Signal frontpage.
 *
 * One LLM call produces a Frontpage = { topStories, swimlanes }. The store
 * resolves the article ids back to full Article objects for rendering. The
 * cache layer persists the un-resolved Frontpage (just ids) so the user's
 * next visit within the TTL window doesn't re-hit the LLM.
 */

/**
 * One LLM-grouped story for the top masonry. Multiple article ids → multiple
 * outlets covering the same event; the chooser dialog lets the reader pick
 * which take to read.
 */
export interface FrontpageStory {
  headline: string;
  blurb: string;
  articleIds: string[];
}

/**
 * A topical lane of articles. The LLM picks the topic (e.g. "Iran War", "Apple
 * M5 launch") and the articles that fit. Distinct from FrontpageStory in that
 * each article in a swimlane is shown as its own card — no LLM-rewritten
 * headline. The swimlane title is the editorial framing.
 */
export interface Swimlane {
  title: string;
  /** Optional one-sentence framing. Rendered subtly under the title. */
  description?: string;
  articleIds: string[];
}

/**
 * The full output the LLM produces. Cached for 24h.
 */
export interface Frontpage {
  topStories: FrontpageStory[];
  swimlanes: Swimlane[];
}

/** How long a generated frontpage is reused before regeneration. */
export const FRONTPAGE_TTL_MS = 24 * 60 * 60 * 1000;

/** Window of recency for articles eligible to enter the frontpage. */
export const SIGNAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cap on how many articles the corpus contains before it's sent to the LLM. */
export const SIGNAL_ARTICLE_CAP = 200;

/** Target number of top stories the LLM should produce. */
export const SIGNAL_TOP_STORIES_TARGET = 6;

/** Target number of swimlanes the LLM should produce. */
export const SIGNAL_SWIMLANES_TARGET = 4;
