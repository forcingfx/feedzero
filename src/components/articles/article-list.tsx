import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { ArticleItem } from "./article-item.tsx";
import type { Article } from "@/types/index.ts";

interface ArticleListProps {
  onArticleSelect?: (article: Article) => void;
}

export function ArticleList({ onArticleSelect }: ArticleListProps) {
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const refreshSingleFeed = useFeedStore((s) => s.refreshSingleFeed);
  const articles = useArticleStore((s) => s.articles);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const selectArticle = useArticleStore((s) => s.selectArticle);

  function handleSelect(article: Article) {
    selectArticle(article);
    if (onArticleSelect) onArticleSelect(article);
  }

  if (!selectedFeedId) {
    return (
      <div className="p-sm text-muted-foreground text-sm">
        Select a feed to view articles.
      </div>
    );
  }

  return (
    <>
      <div className="flex px-sm py-xs">
        <Button
          variant="outline"
          size="xs"
          title="Refresh this feed"
          onClick={() => refreshSingleFeed(selectedFeedId)}
        >
          Refresh
        </Button>
      </div>

      {articles.length === 0 ? (
        <div className="p-sm text-muted-foreground text-sm">
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
            />
          ))}
        </ul>
      )}
    </>
  );
}
