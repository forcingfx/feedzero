/**
 * Story grouping for the Signal frequency engine.
 *
 * Within a single topic, multiple articles often cover the same event —
 * either byte-identical syndication (collapsed earlier by exact-title
 * grouping) or independent reporting with similar headlines. This module
 * merges a topic's representative articles into stories so the UI can show
 * "covered by N outlets" instead of repeating the same event as separate
 * rows.
 *
 * Runs per topic over a small set (≤ the per-topic claim cap), so the
 * O(n²) similarity comparison is cheap.
 */

import { tokenize } from "./tokenize.ts";
import { STORY_SIMILARITY, type Story } from "./types.ts";
import type { Article } from "../../types/index.ts";

interface StoryAccumulator {
  members: Article[];
  titleTokens: Set<string>;
}

/**
 * Group a topic's representative articles into stories. `members` maps a
 * representative article id to all articles sharing its exact title
 * (including cross-feed syndicated copies) so the outlet count reflects
 * every feed that ran the story.
 */
export function groupIntoStories(
  reps: Article[],
  members: Map<string, Article[]>,
): Story[] {
  const groups: StoryAccumulator[] = [];

  for (const rep of reps) {
    const tokens = new Set(tokenize(rep.title));
    const match = groups.find((g) => jaccard(tokens, g.titleTokens) >= STORY_SIMILARITY);
    const repMembers = members.get(rep.id) ?? [rep];
    if (match) {
      match.members.push(...repMembers);
      for (const t of tokens) match.titleTokens.add(t);
    } else {
      groups.push({ members: [...repMembers], titleTokens: tokens });
    }
  }

  const built = groups.map((g) => toStory(g.members));
  // Outlet count first (multi-feed stories lead), then recency, then id.
  built.sort(
    (a, b) =>
      b.story.feedCount - a.story.feedCount ||
      b.headTime - a.headTime ||
      (a.story.id < b.story.id ? -1 : a.story.id > b.story.id ? 1 : 0),
  );
  return built.map((b) => b.story);
}

function toStory(members: Article[]): { story: Story; headTime: number } {
  const ordered = [...members].sort(
    (a, b) =>
      b.publishedAt - a.publishedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const feedCount = new Set(ordered.map((a) => a.feedId)).size;
  const head = ordered[0];
  return {
    story: {
      id: head.id,
      title: head.title,
      articleIds: ordered.map((a) => a.id),
      feedCount,
    },
    headTime: head.publishedAt,
  };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
