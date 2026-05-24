import { useEffect } from "react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useBriefingStore } from "@/stores/briefing-store.ts";
import type { Article } from "@feedzero/core/types";

/**
 * After each refreshAll() cycle, walks every saved briefing and updates
 * its `staleArticleCount` so the sidebar can show a "refresh available"
 * dot. Crucially, this hook does NOT call the LLM — auto-refresh is
 * cheap-and-local, the cost-bearing LLM call only fires when the user
 * clicks "Refresh briefing" themselves. That's how a BYO-key feature
 * stays under the user's explicit control.
 *
 * Mounted once in AppLayout next to `useAutoRefresh`. Subscribes to
 * `feed-store.lastRefreshAllAt` so it fires whenever any refresh
 * completes (timer-driven, focus-triggered, or manual).
 */
export function useBriefingAutoRefresh() {
  useEffect(() => {
    // Diff lastRefreshAllAt against the previous value so the briefing
    // scan only fires when a refresh actually completed (any other
    // state change in feed-store no-ops). Manual diff because v5
    // Zustand's plain `subscribe` doesn't take a selector — wiring
    // `subscribeWithSelector` for one consumer would be overkill.
    let last = useFeedStore.getState().lastRefreshAllAt;
    const unsubscribe = useFeedStore.subscribe((state) => {
      if (state.lastRefreshAllAt === last) return;
      last = state.lastRefreshAllAt;
      if (last === null) return;
      void useBriefingStore.getState().refreshStaleCounts(collectAllArticles());
    });
    return unsubscribe;
  }, []);
}

function collectAllArticles(): Article[] {
  const grouped = useArticleStore.getState().articlesByFeedId;
  const out: Article[] = [];
  for (const list of Object.values(grouped)) out.push(...list);
  return out;
}
