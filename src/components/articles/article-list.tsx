import { useMemo } from "react";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { ALL_FEEDS_ID } from "@/utils/constants.ts";
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
  const isGlobalView = selectedFeedId === ALL_FEEDS_ID;

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
    <>
      {articles.length === 0 ? (
        <div className="p-2 text-muted-foreground text-sm">
          No articles found.
        </div>
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
        </ul>
      )}
    </>
  );
}
