import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useAppStore } from "@/stores/app-store.ts";
import { isAggregatedFeedId } from "@/utils/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { ArticleItem } from "./article-item.tsx";
import { ArticleGroupSummaryRow } from "./article-group-summary-row.tsx";
import { ArticleListControls } from "./article-list-controls.tsx";
import { groupArticles } from "@/lib/group-articles.ts";
import type { Article } from "@/types/index.ts";

/**
 * Flat list-entry shape: every row the virtualizer renders is either a
 * real article (a normal ArticleItem) or a summary row (the "+N more
 * from <feed>" / "Collapse" toggle). Keeping these uniform-shape lets
 * the virtualizer treat all rows identically.
 */
type FlatEntry =
  | { kind: "article"; article: Article }
  | {
      kind: "summary";
      groupId: string;
      feedId: string;
      hiddenCount: number;
      open: boolean;
    };

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
  const isRefreshing = useFeedStore((s) => s.isRefreshingAll);
  const feeds = useFeedStore((s) => s.feeds);
  const articles = useArticleStore((s) => s.articles);
  const selectedArticle = useArticleStore((s) => s.selectedArticle);
  const selectArticle = useArticleStore((s) => s.selectArticle);
  const markAllAsRead = useArticleStore((s) => s.markAllAsRead);
  const isLoading = useArticleStore((s) => s.isLoading);
  const articleSortMode = useArticleStore((s) => s.articleSortMode);
  const setArticleSortMode = useArticleStore((s) => s.setArticleSortMode);
  const groupArticleFloods = useAppStore((s) => s.groupArticleFloods);
  const scrollRef = useRef<HTMLDivElement>(null);

  // True for ALL_FEEDS_ID and folder-aggregated feed ids. Both render
  // articles from multiple feeds, so each article must show its own
  // feed title + favicon. Grouping is also gated on this — single-feed
  // views never collapse floods.
  const isAggregatedView = selectedFeedId
    ? isAggregatedFeedId(selectedFeedId)
    : false;

  // Per-feed expand state for flood groups. Keyed by stable group id so a
  // re-render with the same group (e.g. after a read flip) preserves the
  // user's choice. Switching feeds replaces the entries entirely, which
  // resets back to all-collapsed via the empty initial Set.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Walk the sorted articles through groupArticles(), then flatten each
  // group into a sequence the virtualizer can iterate as uniform rows.
  // Collapsed group → [topArticle, summaryRow]. Expanded group →
  // [allArticles, collapseSummaryRow]. The summary row is interactive
  // but NOT role="option", so keyboard nav (j/k) walks article → article
  // and skips summaries.
  //
  // Grouping is gated on aggregated views ONLY (/feeds/all + folder
  // views). In a single-feed view the user has already chosen to focus
  // on that source, so collapsing floods would just hide content they
  // explicitly asked to see.
  const entries: FlatEntry[] = useMemo(() => {
    if (!groupArticleFloods || !isAggregatedView) {
      return articles.map((article) => ({
        kind: "article" as const,
        article,
      }));
    }
    const out: FlatEntry[] = [];
    for (const grouped of groupArticles(articles)) {
      if (grouped.kind === "article") {
        out.push({ kind: "article", article: grouped.article });
        continue;
      }
      const isOpen = expandedGroups.has(grouped.id);
      if (isOpen) {
        for (const article of grouped.articles) {
          out.push({ kind: "article", article });
        }
        out.push({
          kind: "summary",
          groupId: grouped.id,
          feedId: grouped.feedId,
          hiddenCount: grouped.articles.length - 1,
          open: true,
        });
      } else {
        out.push({ kind: "article", article: grouped.articles[0]! });
        out.push({
          kind: "summary",
          groupId: grouped.id,
          feedId: grouped.feedId,
          hiddenCount: grouped.articles.length - 1,
          open: false,
        });
      }
    }
    return out;
  }, [articles, groupArticleFloods, isAggregatedView, expandedGroups]);

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
    estimateSize: () => ESTIMATED_ITEM_SIZE,
    overscan: OVERSCAN,
    getItemKey: (index) => {
      const entry = entries[index];
      if (!entry) return index;
      // Summary rows get a deterministic key per (group, open-state) so
      // the virtualizer remounts when toggling — otherwise React would
      // reuse the same node and the label/icon swap would still happen,
      // but a fresh remount is cheaper than the alternative of fighting
      // memoisation.
      return entry.kind === "summary"
        ? `summary:${entry.groupId}:${entry.open ? "open" : "closed"}`
        : entry.article.id;
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
    const index = entriesRef.current.findIndex(
      (entry) => entry.kind === "article" && entry.article.id === selectedId,
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
    // Show the blank placeholder only during the initial silent load. Once a
    // load settles with nothing — or while a user-initiated refresh runs — the
    // empty state with its refresh affordance stays put so the user has a
    // prominent way to pull this feed/folder/filter again.
    const showBlank = isLoading && !isRefreshing;
    return (
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {showBlank ? null : <EmptyArticleList feedId={selectedFeedId} />}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto relative">
      <ArticleListControls
        sortMode={articleSortMode}
        onSortChange={setArticleSortMode}
      />
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
          // Always pass the source feed's title to the summary row so it
          // can render "+N more from <Feed>" regardless of view mode —
          // per-feed views skip the title on ArticleItem (redundant) but
          // the summary row benefits from it as the dominant
          // disambiguator.
          const summaryFeedTitle = feedsById[feedId]?.title;
          const itemFeedTitle = isAggregatedView ? summaryFeedTitle : undefined;
          const itemFeedSiteUrl = isAggregatedView
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
                  feedTitle={itemFeedTitle}
                  feedSiteUrl={itemFeedSiteUrl}
                />
              ) : (
                <ArticleGroupSummaryRow
                  open={entry.open}
                  hiddenCount={entry.hiddenCount}
                  feedTitle={summaryFeedTitle}
                  onToggle={() => toggleGroup(entry.groupId)}
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

/**
 * Empty-list state. An empty feed is most often a feed that just hasn't been
 * fetched yet (or one whose cache was cleared), so the primary action is to
 * refresh — scoped to whatever the user is viewing via `refreshView`.
 */
function EmptyArticleList({ feedId }: { feedId: string }) {
  const refreshView = useFeedStore((s) => s.refreshView);
  const isRefreshing = useFeedStore((s) => s.isRefreshingAll);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">
        No articles here yet.
      </p>
      <Button
        data-testid="empty-refresh"
        variant="secondary"
        size="sm"
        disabled={isRefreshing}
        onClick={() => void refreshView(feedId)}
      >
        <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </Button>
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
