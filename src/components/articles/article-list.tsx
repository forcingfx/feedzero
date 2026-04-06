import { useMemo } from "react";
import { CheckCheck } from "lucide-react";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
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
  const loadMore = useArticleStore((s) => s.loadMore);
  const hasMore = useArticleStore((s) => s.hasMore);
  const isLoading = useArticleStore((s) => s.isLoading);
  const isGlobalView = selectedFeedId === ALL_FEEDS_ID;
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
    <div className="relative h-full">
      {articles.length === 0 ? (
        isLoading ? null : (
          <div className="p-2 text-muted-foreground text-sm">
            No articles found.
          </div>
        )
      ) : (
        <ul role="listbox" aria-label="Articles" className="list-none m-0 p-0">
          {articles.map((article) => (
            <ArticleItem
              key={article.id}
              article={article}
              isSelected={article.id === selectedArticle?.id}
              onSelect={handleSelect}
              feedTitle={
                isGlobalView ? feedsById[article.feedId]?.title : undefined
              }
              feedSiteUrl={
                isGlobalView ? feedsById[article.feedId]?.siteUrl : undefined
              }
            />
          ))}
          {hasMore && (
            <li className="p-3 text-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={loadMore}
              >
                Load more articles
              </Button>
            </li>
          )}
        </ul>
      )}
      {unreadCount > 0 && (
        <div className="sticky bottom-3 flex justify-center pointer-events-none">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 rounded-full px-3 text-xs shadow-md pointer-events-auto"
            onClick={markAllAsRead}
          >
            <CheckCheck className="size-3 mr-1.5" />
            Mark {unreadCount} read
          </Button>
        </div>
      )}
    </div>
  );
}
