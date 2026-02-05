import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { Rss } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useIsDesktop } from "@/hooks/use-media-query.ts";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { useSidebar } from "@/components/ui/sidebar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty.tsx";
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
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { HeaderBreadcrumbs } from "@/components/layout/header-breadcrumbs.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { ArticleList } from "@/components/articles/article-list.tsx";
import { ReaderPanel } from "@/components/reader/reader-panel.tsx";

/**
 * Listens for the feedzero:toggle-sidebar event and toggles the sidebar.
 * Must be rendered inside SidebarProvider.
 */
function SidebarKeyboardToggle() {
  const { toggleSidebar } = useSidebar();
  useEffect(() => {
    const handler = () => toggleSidebar();
    document.addEventListener("feedzero:toggle-sidebar", handler);
    return () =>
      document.removeEventListener("feedzero:toggle-sidebar", handler);
  }, [toggleSidebar]);
  return null;
}

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
  const feeds = useFeedStore((s) => s.feeds);
  const selectFeed = useFeedStore((s) => s.selectFeed);
  const loadArticles = useArticleStore((s) => s.loadArticles);
  const articles = useArticleStore((s) => s.articles);
  const selectArticle = useArticleStore((s) => s.selectArticle);

  // Track whether user explicitly navigated back (to suppress auto-select)
  const skipAutoSelectRef = useRef(false);

  useEffect(() => {
    if (feedId) {
      selectFeed(feedId);
      selectArticle(null);
      loadArticles(feedId);
    }
  }, [feedId, selectFeed, selectArticle, loadArticles]);

  useEffect(() => {
    if (articleId && articles.length > 0) {
      const article = articles.find((a) => a.id === articleId);
      if (article) selectArticle(article);
    }
  }, [articleId, articles, selectArticle]);

  // Auto-select first article when switching to a feed with no article selected
  // Skip if user explicitly navigated back (they want to see the article list)
  useEffect(() => {
    if (skipAutoSelectRef.current) {
      return;
    }
    if (feedId && articles.length > 0 && !articleId) {
      navigate(`/feeds/${feedId}/articles/${articles[0].id}`, {
        replace: true,
      });
    }
  }, [feedId, articles, articleId, navigate]);

  // Reset skip flag when user navigates to an article (either by clicking or auto-select)
  useEffect(() => {
    if (articleId) {
      skipAutoSelectRef.current = false;
    }
  }, [articleId]);

  function handleFeedSelect(id: string) {
    selectFeed(id);
    selectArticle(null); // Clear immediately before navigation
    navigate(`/feeds/${id}`); // Navigate without articleId
  }

  function handleArticleSelect(article: { id: string }) {
    if (feedId) {
      navigate(`/feeds/${feedId}/articles/${article.id}`);
    }
  }

  function handleBack() {
    skipAutoSelectRef.current = true;
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
        <SidebarKeyboardToggle />
        <AppSidebar onFeedSelect={handleFeedSelect} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <Kbd>[</Kbd>
            <HeaderBreadcrumbs fallback={feedId ? "Articles" : "Feeds"} />
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
    <SidebarProvider className="h-svh overflow-hidden">
      <SidebarKeyboardToggle />
      <AppSidebar onFeedSelect={handleFeedSelect} />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-10 shrink-0 items-center border-b px-2 gap-2">
          <SidebarTrigger />
          <Kbd>[</Kbd>
          <HeaderBreadcrumbs />
        </header>
        {feeds.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Rss />
                </EmptyMedia>
                <EmptyTitle>Get started with FeedZero</EmptyTitle>
                <EmptyDescription>
                  Add your first feed using the sidebar
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            className="flex-1 min-h-0"
          >
            <ResizablePanel
              defaultSize="40%"
              minSize="300px"
              className="overflow-hidden"
            >
              <ScrollArea className="h-full">
                <ArticleList onArticleSelect={handleArticleSelect} />
              </ScrollArea>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              defaultSize="60%"
              minSize="300px"
              className="overflow-hidden"
            >
              <ScrollArea className="h-full">
                <ReaderPanel />
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
