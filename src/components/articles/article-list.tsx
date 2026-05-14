import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { CheckCheck } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import { isAggregatedFeedId } from "@/utils/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { ArticleItem } from "./article-item.tsx";
import { ArticleGroupStack } from "./article-group-stack.tsx";
import { groupArticles, type ArticleListEntry } from "@/lib/group-articles.ts";
import type { Article } from "@/types/index.ts";

interface ArticleListProps {
  onArticleSelect?: (article: Article) => void;
}

/**
 * Fallback height used before a row has been measured. Tuned to the current
 * ArticleItem layout (title + single metadata row + vertical padding). The
 * virtualizer re-measures on mount, so accuracy only matters to avoid an
 * initial scrollbar jump.
 */
const ESTIMATED_ITEM_SIZE = 72;

/**
 * Rows rendered above and below the visible viewport. Large enough that
 * keyboard nav (j/k) can advance several steps before the next target leaves
 * the rendered range, so `moveArticle` in use-keyboard-nav.ts can keep
 * clicking the next [role="option"] without coordinating with the virtualizer.
 */
const OVERSCAN = 8;

/**
 * Returns true when the row for `articleId` is in the DOM and lies fully
 * within the scroll container's viewport. If the row hasn't been rendered
 * (e.g. selection restored from URL before the virtualizer mounts it), the
 * caller must treat the item as not visible and scroll to it.
 */
function isItemVisible(scrollEl: HTMLElement, articleId: string): boolean {
  const itemEl = scrollEl.querySelector<HTMLElement>(
    `[data-id="${CSS.escape(articleId)}"]`,
  );
  if (!itemEl) return false;
  const item = itemEl.getBoundingClientRect();
  const container = scrollEl.getBoundingClientRect();
  return item.top >= container.top && item.bottom <= container.bottom;
}

export function ArticleList({ onArticleSelect }: ArticleListProps) {
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const feeds = useFeedStore((s) => s.feeds);
  const articles = useArticleStore((s) => s.articles);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const selectArticle = useArticleStore((s) => s.selectArticle);
  const markAllAsRead = useArticleStore((s) => s.markAllAsRead);
  const isLoading = useArticleStore((s) => s.isLoading);
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const scrollRef = useRef<HTMLDivElement>(null);

  // When grouping is enabled, walk the (sorted) articles list and fold same-
  // feed flood runs into ArticleGroup entries. When disabled, every article
  // is wrapped in a no-op ArticleEntry so the virtualizer can iterate one
  // shape regardless of the toggle state.
  const entries: ArticleListEntry[] = useMemo(
    () =>
      groupArticleFloods
        ? groupArticles(articles)
        : articles.map((article) => ({ kind: "article", article })),
    [articles, groupArticleFloods],
  );

  // True for ALL_FEEDS_ID and folder-aggregated feed ids. Both render
  // articles from multiple feeds, so each article must show its own
  // feed title + favicon.
  const isAggregatedView = selectedFeedId
    ? isAggregatedFeedId(selectedFeedId)
    : false;

  const unreadCount = useMemo(() => {
    let count = 0;
    for (const a of articles) if (!a.read) count++;
    return count;
  }, [articles]);

  const feedsById = useMemo(
    () => Object.fromEntries(feeds.map((f) => [f.id, f])),
    [feeds],
  );

  // Stable across renders as long as selectArticle (from Zustand) and
  // onArticleSelect (from props) are stable. Passing a stable handler into
  // memoized ArticleItem lets React skip re-rendering items whose props did
  // not change — critical when the list has thousands of entries.
  const handleSelect = useCallback(
    (article: Article) => {
      selectArticle(article);
      if (onArticleSelect) onArticleSelect(article);
    },
    [selectArticle, onArticleSelect],
  );

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    // Estimates only matter until measureElement reports the real height.
    // A collapsed group is a single ArticleItem plus a few ghost-card
    // pixels, so the singleton estimate is close enough to avoid a
    // perceptible scrollbar jump on first paint.
    estimateSize: () => ESTIMATED_ITEM_SIZE,
    overscan: OVERSCAN,
    getItemKey: (index) => {
      const entry = entries[index];
      if (!entry) return index;
      return entry.kind === "group" ? entry.id : entry.article.id;
    },
  });

  // Keep the selected article in view, but only when the user can't already
  // see it. Selection changes flow in from many places — clicks, keyboard
  // nav, URL restoration, external store mutations during sync push or
  // auto-mark-as-read. A flag set in the click handler protects only one of
  // those paths; any other path would re-fire the effect and re-anchor the
  // virtualizer to the new selection, scrolling the user's viewport even
  // when the new article is already visible. Checking visibility before
  // scrolling is the invariant that holds across every call site.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const selectedId = selectedArticle?.id;
  useEffect(() => {
    if (!selectedId) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    if (isItemVisible(scrollEl, selectedId)) return;
    // For grouped entries, treat the group's row as the scroll target when
    // any of its members is the selection — the user must expand the stack
    // to actually see the inner article. Avoids hiding the selection
    // entirely off-screen during flood collapses.
    const index = entriesRef.current.findIndex((entry) =>
      entry.kind === "article"
        ? entry.article.id === selectedId
        : entry.articles.some((a) => a.id === selectedId),
    );
    if (index !== -1) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedId, virtualizer]);

  // Empty/loading states render inside the scroll wrapper so the panel
  // layout stays consistent whether or not there are articles — callers
  // (feeds-page) can rely on ArticleList always owning a scrollable region.
  if (!selectedFeedId) {
    return (
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div className="p-2 text-muted-foreground text-sm">
          Select a feed to view articles.
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return isLoading ? (
      <div ref={scrollRef} className="h-full overflow-y-auto" />
    ) : (
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div className="p-2 text-muted-foreground text-sm">
          No articles found.
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto relative">
      <ul
        role="listbox"
        aria-label="Articles"
        // pb-12 reserves space at the end of the list so the sticky "Mark N
        // read" pill (h-7 + bottom-3 = ~40px) cannot overlap the last article
        // when the user scrolls to the bottom. See GitLab #11.
        className="list-none m-0 p-0 pb-12 relative"
        style={{ height: totalSize }}
      >
        {virtualItems.map((virtualItem) => {
          const entry = entries[virtualItem.index];
          if (!entry) return null;
          const feedId =
            entry.kind === "article" ? entry.article.feedId : entry.feedId;
          const feedTitle = isAggregatedView
            ? feedsById[feedId]?.title
            : undefined;
          const feedSiteUrl = isAggregatedView
            ? feedsById[feedId]?.siteUrl
            : undefined;
          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {entry.kind === "article" ? (
                <ArticleItem
                  article={entry.article}
                  isSelected={entry.article.id === selectedArticle?.id}
                  onSelect={handleSelect}
                  feedTitle={feedTitle}
                  feedSiteUrl={feedSiteUrl}
                />
              ) : (
                <ArticleGroupStack
                  group={entry}
                  selectedArticleId={selectedArticle?.id}
                  onSelect={handleSelect}
                  feedTitle={feedTitle}
                  feedSiteUrl={feedSiteUrl}
                />
              )}
            </div>
          );
        })}
      </ul>
      <MarkReadPill unreadCount={unreadCount} onMarkAll={markAllAsRead} />
    </div>
  );
}

function MarkReadPill({
  unreadCount,
  onMarkAll,
}: {
  unreadCount: number;
  onMarkAll: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (unreadCount > 0) {
      setMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
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
