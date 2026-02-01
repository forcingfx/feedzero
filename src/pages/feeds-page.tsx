import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";

/**
 * Main page component.
 * Desktop: sidebar (feeds) + article list + reader pane.
 * Mobile: sidebar collapses to offcanvas, single panel navigation.
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

  useEffect(() => {
    if (feedId) {
      selectFeed(feedId);
      loadArticles(feedId);
    }
  }, [feedId, selectFeed, loadArticles]);

  useEffect(() => {
    if (articleId && articles.length > 0) {
      const article = articles.find((a) => a.id === articleId);
      if (article) selectArticle(article);
    }
  }, [articleId, articles, selectArticle]);

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

  // Mobile: sidebar is offcanvas, show one content panel at a time
  if (!isDesktop) {
    return (
      <SidebarProvider defaultOpen={false}>
        <AppSidebar onFeedSelect={handleFeedSelect} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <span className="text-sm font-medium truncate">
              {articleId ? "Article" : feedId ? "Articles" : "Feeds"}
            </span>
          </header>
          <main role="main" className="flex-1 flex flex-col min-h-0">
            {(articleId || feedId) && (
              <Button
                variant="link"
                size="sm"
                onClick={handleBack}
                className="justify-start"
              >
                ← Back
              </Button>
            )}
            <div className="flex-1 overflow-y-auto">
              {articleId && feedId ? (
                <ReaderPanel />
              ) : feedId ? (
                <ArticleList onArticleSelect={handleArticleSelect} />
              ) : (
                <div className="p-4 text-muted-foreground text-sm">
                  Open the sidebar to select a feed.
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Desktop: sidebar + article list + reader pane
  return (
    <SidebarProvider>
      <AppSidebar onFeedSelect={handleFeedSelect} />
      <SidebarInset>
        <ResizablePanelGroup direction="horizontal" className="h-full min-h-0">
          <ResizablePanel defaultSize="40%" minSize="300px">
            <ScrollArea className="h-full">
              <ArticleList onArticleSelect={handleArticleSelect} />
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="60%" minSize="300px">
            <ScrollArea className="h-full">
              <ReaderPanel />
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  );
}
