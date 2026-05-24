/**
 * Resolve LLM-suggested feed candidates through the existing
 * `discoverFeed` cascade.
 *
 * The briefing client returns `SuggestedFeed[]` with `discoveryStatus:
 * "pending"` — the model can suggest any URL (site, feed, social) but
 * we don't trust it. Each candidate runs through `discoverFeed` to
 * (a) confirm a real feed exists at that URL and (b) pick up the
 * resolved feed URL + title for the UI. Hallucinated or dead URLs
 * surface as `"unreachable"` and the UI mutes the subscribe button.
 *
 * Idempotent: a suggestion that's already resolved (e.g. from a cached
 * report being re-rendered) is passed through unchanged.
 *
 * Run in parallel — each candidate is an independent network call.
 */

import type { SuggestedFeed } from "@feedzero/core/types";
import { discoverFeed } from "@/core/discovery/discovery";

export interface ResolveOptions {
  /**
   * Whether to enable bridge resolution (YouTube/Reddit/Mastodon/GitHub
   * → native feed URLs). Passed straight through to discoverFeed; the
   * caller has already resolved the tier gate.
   */
  bridgesEnabled?: boolean;
}

export async function resolveSuggestedFeeds(
  suggestions: SuggestedFeed[],
  options?: ResolveOptions,
): Promise<SuggestedFeed[]> {
  return Promise.all(suggestions.map((s) => resolveOne(s, options)));
}

async function resolveOne(
  suggestion: SuggestedFeed,
  options?: ResolveOptions,
): Promise<SuggestedFeed> {
  if (suggestion.discoveryStatus !== "pending") return suggestion;

  try {
    const result = await discoverFeed(suggestion.candidateUrl, {
      bridges: options?.bridgesEnabled,
    });
    if (!result.ok) {
      return { ...suggestion, discoveryStatus: "unreachable" };
    }
    return {
      ...suggestion,
      discoveryStatus: "resolved",
      resolvedFeedUrl: result.value.feedUrl,
      resolvedTitle: result.value.feed.title,
    };
  } catch {
    return { ...suggestion, discoveryStatus: "unreachable" };
  }
}
