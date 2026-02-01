import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { Button } from "@/components/ui/button.tsx";
import { Header } from "@/components/layout/header.tsx";
import { Panel } from "@/components/layout/panel.tsx";
import { FeedList } from "@/components/feeds/feed-list.tsx";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";

/**
 * Main page component. On desktop, renders all 3 panels.
 * On mobile, renders only the panel matching the current route depth.
 *
 * Routes:
 *   /feeds                              → feed list
 *   /feeds/:feedId                      → article list (+ feed list on desktop)
 *   /feeds/:feedId/articles/:articleId  → reader (+ all panels on desktop)
 */
export function FeedsPage() {
  const { feedId, articleId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  useKeyboardNav();
  const selectFeed = useFeedStore((s) => s.selectFeed);
  const loadArticles = useArticleStore((s) => s.loadArticles);
  const articles = useArticleStore((s) => s.articles);
  const selectArticle = useArticleStore((s) => s.selectArticle);

  // Sync URL params → store
  useEffect(() => {
    if (feedId) {
      selectFeed(feedId);
      loadArticles(feedId);
    }
  }, [feedId, selectFeed, loadArticles]);

  // Sync articleId from URL → store
  useEffect(() => {
    if (articleId && articles.length > 0) {
      const article = articles.find((a) => a.id === articleId);
      if (article) selectArticle(article);
    }
  }, [articleId, articles, selectArticle]);

  // Navigation handlers that components use to change URLs
  function handleFeedSelect(id: string) {
    selectFeed(id);
    navigate(`/feeds/${id}`);
  }

  function handleArticleSelect(article: { id: string }) {
    if (feedId) {
      navigate(`/feeds/${feedId}/articles/${article.id}`);
    }
  }

  function handleBack() {
    if (articleId) {
      navigate(`/feeds/${feedId}`);
    } else if (feedId) {
      navigate("/feeds");
    }
  }

  // Mobile: show one panel based on route depth
  if (!isDesktop) {
    if (articleId && feedId) {
      return (
        <>
          <Header />
          <main role="main" className="flex-1 flex flex-col min-h-0">
            <Button variant="link" size="sm" onClick={handleBack}>
              ← Back
            </Button>
            <div className="flex-1 overflow-y-auto">
              <ReaderPanel />
            </div>
          </main>
        </>
      );
    }
    if (feedId) {
      return (
        <>
          <Header />
          <main role="main" className="flex-1 flex flex-col min-h-0">
            <Button variant="link" size="sm" onClick={handleBack}>
              ← Back
            </Button>
            <div className="flex-1 overflow-y-auto">
              <ArticleList onArticleSelect={handleArticleSelect} />
            </div>
          </main>
        </>
      );
    }
    return (
      <>
        <Header />
        <main role="main" className="flex-1 flex flex-col min-h-0">
          <FeedList onFeedSelect={handleFeedSelect} />
        </main>
      </>
    );
  }

  // Desktop: 3-panel grid
  return (
    <>
      <Header />
      <main role="main">
        <Panel>
          <FeedList onFeedSelect={handleFeedSelect} />
        </Panel>
        <Panel>
          <ArticleList onArticleSelect={handleArticleSelect} />
        </Panel>
        <Panel>
          <ReaderPanel />
        </Panel>
      </main>
    </>
  );
}
