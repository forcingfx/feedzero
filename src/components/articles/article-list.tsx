import { useMemo, useState, useEffect } from "react";
import { CheckCheck } from "lucide-react";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { isAggregatedFeedId } from "@/utils/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { ArticleItem } from "./article-item.tsx";
import type { Article } from "@/types/index.ts";

interface ArticleListProps {
  onArticleSelect?: (article: Article) => void;
}

export function ArticleList({ onArticleSelect }: ArticleListProps) {
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const articles = useArticleStore((s) => s.articles);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const selectArticle = useArticleStore((s) => s.selectArticle);
  const markAllAsRead = useArticleStore((s) => s.markAllAsRead);
  const isLoading = useArticleStore((s) => s.isLoading);
  // True for ALL_FEEDS_ID and folder-aggregated feed ids. Both render
  // articles from multiple feeds, so each article must show its own
  // feed title + favicon.
  const isAggregatedView = selectedFeedId
    ? isAggregatedFeedId(selectedFeedId)
    : false;
  const unreadCount = articles.filter((a) => !a.read).length;

  const feedsById = useMemo(
    () => Object.fromEntries(feeds.map((f) => [f.id, f])),
    [feeds],
  );

  function handleSelect(article: Article) {
    selectArticle(article);
    if (onArticleSelect) onArticleSelect(article);
  }

  if (!selectedFeedId) {
    return (
      <div className="p-2 text-muted-foreground text-sm">
        Select a feed to view articles.
      </div>
    );
  }

  return (
    <div className="relative min-h-full">
      {articles.length === 0 ? (
        isLoading ? null : (
          <div className="p-2 text-muted-foreground text-sm">
            No articles found.
          </div>
        )
      ) : (
        <ul role="listbox" aria-label="Articles" className="list-none m-0 p-0 pb-6">
          {articles.map((article) => (
            <ArticleItem
              key={article.id}
              article={article}
              isSelected={article.id === selectedArticle?.id}
              onSelect={handleSelect}
              feedTitle={
                isAggregatedView ? feedsById[article.feedId]?.title : undefined
              }
              feedSiteUrl={
                isAggregatedView ? feedsById[article.feedId]?.siteUrl : undefined
              }
            />
          ))}
        </ul>
      )}
      <MarkReadPill unreadCount={unreadCount} onMarkAll={markAllAsRead} />
    </div>
  );
}

function MarkReadPill({ unreadCount, onMarkAll }: { unreadCount: number; onMarkAll: () => void }) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (unreadCount > 0) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  if (!mounted) return null;

  return (
    <div className="sticky bottom-3 flex justify-center pointer-events-none">
      <Button
        variant="secondary"
        size="sm"
        className={`h-7 rounded-full px-3 text-xs shadow-md pointer-events-auto
          hover:shadow-lg hover:scale-105 hover:bg-primary hover:text-primary-foreground
          active:scale-95 transition-all duration-200
          ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        onClick={onMarkAll}
      >
        <CheckCheck className="size-3 mr-1.5" />
        Mark {unreadCount} read
      </Button>
    </div>
  );
}
