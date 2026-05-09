/**
 * Domain types for the Signal frontpage.
 *
 * One LLM call produces a Frontpage = an ordered list of top stories. The
 * store resolves each story's article ids back to full Article objects for
 * rendering. The cache layer persists the un-resolved Frontpage (just ids) so
 * the user's next visit within the TTL window doesn't re-hit the LLM.
 */

/**
 * One LLM-grouped story for the frontpage. Multiple article ids → multiple
 * outlets covering the same event; the chooser dialog lets the reader pick
 * which take to read. The list is ordered by importance: index 0 is the hero.
 */
export interface FrontpageStory {
  headline: string;
  blurb: string;
  articleIds: string[];
}

/** The full output the LLM produces. Cached for 24h. */
export interface Frontpage {
  topStories: FrontpageStory[];
}

/** How long a generated frontpage is reused before regeneration. */
export const FRONTPAGE_TTL_MS = 24 * 60 * 60 * 1000;

/** Window of recency for articles eligible to enter the frontpage. */
export const SIGNAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cap on how many articles the corpus contains before it's sent to the LLM. */
export const SIGNAL_ARTICLE_CAP = 200;

/** Target number of top stories the LLM should produce (#1 is the hero). */
export const SIGNAL_TOP_STORIES_TARGET = 10;
