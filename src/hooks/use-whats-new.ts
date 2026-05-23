/**
 * useWhatsNew — shared "navigate to the changelog feed" action.
 *
 * Lifted from app-sidebar's handleWhatsNew so the Settings → Help tab
 * can call the same flow. Behavior: if the user is already subscribed
 * to the release feed, navigate to it. Otherwise auto-subscribe (best
 * effort — silently noop on network error so the user lands at the
 * feed regardless on the next refresh) then navigate.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useFeedStore } from "@/stores/feed-store";
import { CHANGELOG_FEED_URL } from "@feedzero/core/utils/constants";

export function useWhatsNew(): () => Promise<void> {
  const navigate = useNavigate();
  const feeds = useFeedStore((s) => s.feeds);
  const addFeed = useFeedStore((s) => s.addFeed);
  const selectFeed = useFeedStore((s) => s.selectFeed);

  return useCallback(async () => {
    const existing = feeds.find((f) => f.url === CHANGELOG_FEED_URL);
    if (existing) {
      selectFeed(existing.id);
      navigate(`/feeds/${existing.id}`);
      return;
    }
    try {
      await addFeed(CHANGELOG_FEED_URL);
      const added = useFeedStore
        .getState()
        .feeds.find((f) => f.url === CHANGELOG_FEED_URL);
      if (added) {
        selectFeed(added.id);
        navigate(`/feeds/${added.id}`);
      }
    } catch {
      /* noop — best-effort subscribe */
    }
  }, [feeds, addFeed, selectFeed, navigate]);
}
