import { useState, useEffect, useMemo, useRef, useCallback, useId } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Eye, Plus, Loader2, Search, X, Minus, FileUp } from "lucide-react";
import { toast } from "sonner";
import {
  feedCatalog,
  isSubscribed,
  findSubscribedFeed,
  type CatalogCategory,
} from "@/lib/feed-catalog.ts";
import { loadGeneratedCatalog } from "@/lib/catalog-loader.ts";
import {
  buildSearchIndex,
  searchFeeds,
  type GeneratedCatalog,
  type CatalogSection,
  type AwesomeFeed,
  type SearchableItem,
} from "@/lib/catalog-search.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { FeedPreviewSheet } from "@/components/explore/feed-preview-sheet.tsx";
import { goToSettings } from "@/lib/go-to-settings.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { looksLikeUrl } from "@/lib/url-detection.ts";
import type { Feed } from "@/types/index.ts";

type BrowseTab = "featured" | "topics" | "countries";

// --- Shared feed row (works for both CatalogFeed and AwesomeFeed) ---

interface FeedRowProps {
  name: string;
  feedUrl: string;
  siteUrl: string;
  description?: string;
  subscribed: boolean;
  subscribedFeeds: Feed[];
  selectedRowId?: string | null;
  onSelectRow?: (rowId: string) => void;
}

function FeedRow({
  name,
  feedUrl,
  siteUrl,
  description,
  subscribed,
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: FeedRowProps) {
  const rowId = useId();
  const isSelected = selectedRowId === rowId;
  const rowRef = useRef<HTMLDivElement>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const addFeed = useFeedStore((s) => s.addFeed);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const added = subscribed || justAdded;

  async function handleAdd() {
    setIsAdding(true);
    const result = await addFeed(feedUrl);
    setIsAdding(false);
    if (result.ok) {
      setJustAdded(true);
      toast.success(`Added ${name}`);
    } else {
      toast.error(`Failed to add ${name}`);
    }
  }

  async function handleRemove() {
    const match = findSubscribedFeed(feedUrl, subscribedFeeds);
    if (match) {
      await removeFeed(match.id);
      setJustAdded(false);
      toast.success(`Removed ${name}`);
    }
  }

  return (
    <>
      <div
        ref={rowRef}
        role="option"
        aria-selected={isSelected}
        onClick={() => onSelectRow?.(rowId)}
        className="flex items-start gap-3 py-2 px-2 -mx-2 rounded cursor-pointer hover:bg-accent aria-selected:bg-accent transition-colors duration-150"
      >
        <FeedFavicon siteUrl={siteUrl} />
        <button
          className="flex-1 min-w-0 text-left hover:underline decoration-muted-foreground/40"
          onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
        >
          <div className="font-medium text-sm">{name}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {isSelected && <Kbd className="h-4 text-[9px] px-1">p</Kbd>}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setPreviewOpen(!previewOpen); }}
            data-action="preview"
            title="Preview feed"
          >
            <Eye className="size-3.5" />
          </Button>
          {added ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              data-action="add"
              className="text-muted-foreground hover:text-destructive"
            >
              <Minus className="size-3.5" />
              <span>Remove</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={isAdding}
              onClick={(e) => { e.stopPropagation(); handleAdd(); }}
              data-action="add"
            >
              <Plus className="size-3.5" />
              <span>Add</span>
            </Button>
          )}
          {isSelected && <Kbd className="h-4 text-[9px] px-1">Enter</Kbd>}
        </div>
      </div>
      <FeedPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        name={name}
        feedUrl={feedUrl}
        siteUrl={siteUrl}
        description={description}
        subscribed={added}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />
    </>
  );
}

// --- Featured view (existing curated categories) ---

function FeaturedView({
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: {
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}) {
  return (
    <div className="space-y-8">
      {feedCatalog.map((category) => (
        <FeaturedCategorySection
          key={category.id}
          category={category}
          subscribedFeeds={subscribedFeeds}
          selectedRowId={selectedRowId}
          onSelectRow={onSelectRow}
        />
      ))}
    </div>
  );
}

function FeaturedCategorySection({
  category,
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: {
  category: CatalogCategory;
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const addFeed = useFeedStore((s) => s.addFeed);
  const unsubscribed = category.feeds.filter(
    (f) => !isSubscribed(f.feedUrl, subscribedFeeds),
  );
  const allSubscribed = unsubscribed.length === 0;

  async function handleAddAll() {
    setIsAdding(true);
    let ok = 0;
    for (const feed of unsubscribed) {
      const r = await addFeed(feed.feedUrl);
      if (r.ok) ok++;
    }
    setIsAdding(false);
    if (ok === unsubscribed.length) toast.success(`Added all ${category.name} feeds`);
    else if (ok > 0) toast.warning(`Added ${ok} of ${unsubscribed.length} feeds`);
    else toast.error(`Failed to add ${category.name} feeds`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{category.name}</h2>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
        <Button variant="outline" size="sm" disabled={allSubscribed || isAdding} onClick={handleAddAll} className="shrink-0">
          {allSubscribed ? "All added" : isAdding ? "Adding..." : "Add all"}
        </Button>
      </div>
      <div className="divide-y">
        {category.feeds.map((feed) => (
          <FeedRow
            key={feed.feedUrl}
            name={feed.name}
            feedUrl={feed.feedUrl}
            siteUrl={feed.siteUrl}
            description={feed.description}
            subscribed={isSubscribed(feed.feedUrl, subscribedFeeds)}
            subscribedFeeds={subscribedFeeds}
            selectedRowId={selectedRowId}
            onSelectRow={onSelectRow}
          />
        ))}
      </div>
    </div>
  );
}

// --- Shared grid + detail for Topics and Countries ---

interface GridItem {
  id: string;
  label: string;
  sublabel?: string;
  feedCount: number;
}

function CategoryGrid({
  items,
  onSelect,
}: {
  items: GridItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className="rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="font-medium text-sm">
            {item.sublabel && <span className="mr-1.5">{item.sublabel}</span>}
            {item.label}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {item.feedCount} {item.feedCount === 1 ? "feed" : "feeds"}
          </div>
        </button>
      ))}
    </div>
  );
}

function CategoryDetail({
  title,
  subtitle,
  feeds,
  subscribedFeeds,
  onBack,
  selectedRowId,
  onSelectRow,
}: {
  title: string;
  subtitle?: string;
  feeds: AwesomeFeed[];
  subscribedFeeds: Feed[];
  onBack: () => void;
  selectedRowId?: string | null;
  onSelectRow?: (url: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const addFeed = useFeedStore((s) => s.addFeed);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const healthyFeeds = feeds.filter((f) => f.healthy);
  const unsubscribed = healthyFeeds.filter(
    (f) => !isSubscribed(f.feedUrl, subscribedFeeds),
  );
  const subscribed = healthyFeeds.filter((f) =>
    isSubscribed(f.feedUrl, subscribedFeeds),
  );
  const allSubscribed = unsubscribed.length === 0;
  const noneSubscribed = subscribed.length === 0;

  async function handleAddAll() {
    setIsAdding(true);
    let ok = 0;
    for (const feed of unsubscribed) {
      const r = await addFeed(feed.feedUrl);
      if (r.ok) ok++;
    }
    setIsAdding(false);
    if (ok === unsubscribed.length) toast.success(`Added all ${title} feeds`);
    else if (ok > 0) toast.warning(`Added ${ok} of ${unsubscribed.length} feeds`);
    else toast.error(`Failed to add ${title} feeds`);
  }

  async function handleRemoveAll() {
    setIsRemoving(true);
    for (const feed of subscribed) {
      const match = findSubscribedFeed(feed.feedUrl, subscribedFeeds);
      if (match) await removeFeed(match.id);
    }
    setIsRemoving(false);
    toast.success(`Removed all ${title} feeds`);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium">
          {subtitle && <span className="mr-1.5">{subtitle}</span>}
          {title}
        </h2>
        <div className="flex gap-2">
          {!noneSubscribed && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isRemoving}
              onClick={handleRemoveAll}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              {isRemoving ? "Removing..." : "Remove all"}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={allSubscribed || isAdding} onClick={handleAddAll} className="shrink-0">
            {allSubscribed ? "All added" : isAdding ? "Adding..." : "Add all"}
          </Button>
        </div>
      </div>
      <div className="divide-y">
        {healthyFeeds.map((feed) => (
          <FeedRow
            key={feed.feedUrl}
            name={feed.name}
            feedUrl={feed.feedUrl}
            siteUrl={feed.siteUrl}
            subscribed={isSubscribed(feed.feedUrl, subscribedFeeds)}
            subscribedFeeds={subscribedFeeds}
            selectedRowId={selectedRowId}
            onSelectRow={onSelectRow}
          />
        ))}
      </div>
    </div>
  );
}

// --- Topics view (section → subcategory → feeds) ---

function SectionDetail({
  section,
  subscribedFeeds,
  onBack,
  selectedRowId,
  onSelectRow,
}: {
  section: CatalogSection;
  subscribedFeeds: Feed[];
  onBack: () => void;
  selectedRowId?: string | null;
  onSelectRow?: (url: string) => void;
}) {
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const selectedSub = section.subcategories.find(
    (s) => s.id === selectedSubId,
  );

  if (selectedSub) {
    return (
      <CategoryDetail
        title={selectedSub.name}
        feeds={selectedSub.feeds}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedSubId(null)}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  // If section has only one subcategory, show feeds directly
  if (section.subcategories.length === 1) {
    return (
      <CategoryDetail
        title={section.name}
        subtitle={section.emoji}
        feeds={section.subcategories[0].feeds}
        subscribedFeeds={subscribedFeeds}
        onBack={onBack}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  const items: GridItem[] = section.subcategories.map((sub) => ({
    id: sub.id,
    label: sub.name,
    feedCount: sub.feeds.filter((f) => f.healthy).length,
  }));

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
      <h2 className="text-lg font-medium mb-4">
        <span className="mr-1.5">{section.emoji}</span>
        {section.name}
      </h2>
      <CategoryGrid items={items} onSelect={setSelectedSubId} />
    </div>
  );
}

function TopicsView({
  catalog,
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: {
  catalog: GeneratedCatalog;
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = catalog.sections.find((s) => s.id === selectedId);

  if (selected) {
    return (
      <SectionDetail
        section={selected}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedId(null)}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  const items: GridItem[] = catalog.sections.map((s) => ({
    id: s.id,
    label: s.name,
    sublabel: s.emoji,
    feedCount: s.subcategories.reduce(
      (sum, sub) => sum + sub.feeds.filter((f) => f.healthy).length,
      0,
    ),
  }));

  return <CategoryGrid items={items} onSelect={setSelectedId} />;
}

// --- Countries view ---

function CountriesView({
  catalog,
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: {
  catalog: GeneratedCatalog;
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = catalog.countries.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <CategoryDetail
        title={selected.name}
        subtitle={selected.emoji}
        feeds={selected.feeds}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedId(null)}
        selectedRowId={selectedRowId}
        onSelectRow={onSelectRow}
      />
    );
  }

  const items: GridItem[] = catalog.countries.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.emoji,
    feedCount: c.feeds.filter((f) => f.healthy).length,
  }));

  return <CategoryGrid items={items} onSelect={setSelectedId} />;
}

// --- Main explore component ---

// --- Search results view ---

function SearchResultsView({
  results,
  subscribedFeeds,
  query,
  selectedRowId,
  onSelectRow,
}: {
  results: SearchableItem[];
  subscribedFeeds: Feed[];
  query: string;
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No feeds matching &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

  // Group results by category
  const grouped = new Map<string, SearchableItem[]>();
  for (const item of results) {
    const key = item.category;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {category}
          </h3>
          <div className="divide-y">
            {items.map((item) => (
              <FeedRow
                key={item.feedUrl}
                name={item.name}
                feedUrl={item.feedUrl}
                siteUrl={item.siteUrl}
                subscribed={isSubscribed(item.feedUrl, subscribedFeeds)}
                subscribedFeeds={subscribedFeeds}
                selectedRowId={selectedRowId}
                onSelectRow={onSelectRow}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ExploreCatalogProps {
  onFeedAdded?: (feedId: string) => void;
}

/** Curated feed library for discovering new feeds. */
export function ExploreCatalog({ onFeedAdded }: ExploreCatalogProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const addFeed = useFeedStore((s) => s.addFeed);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<BrowseTab>("featured");
  const [catalog, setCatalog] = useState<GeneratedCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [selectedRowId, setSelectedFeedUrl] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleTabChange = useCallback((tab: BrowseTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setSelectedFeedUrl(null);
  }, []);

  // Focus search input when navigated here via N key or Plus button
  useEffect(() => {
    const handler = () => searchRef.current?.focus();
    document.addEventListener("feedzero:focus-explore-search", handler);
    return () =>
      document.removeEventListener("feedzero:focus-explore-search", handler);
  }, []);

  const isUrlInput = looksLikeUrl(searchQuery);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isUrlInput) return;
    const url = searchQuery.trim();
    if (!url) return;

    const toastId = toast.loading("Discovering feed…");
    setIsAddingFeed(true);
    const result = await addFeed(url);
    setIsAddingFeed(false);

    if (result.ok) {
      toast.success("Feed added", { id: toastId });
      setSearchQuery("");
      const newFeedId = useFeedStore.getState().selectedFeedId;
      if (newFeedId && onFeedAdded) onFeedAdded(newFeedId);
    } else {
      toast.error(result.error || "Failed to add feed", { id: toastId });
    }
  }

  // Keyboard shortcuts for explore
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape" && isInput) {
        setSearchQuery("");
        setSelectedFeedUrl(null);
        searchRef.current?.blur();
        return;
      }

      // ArrowDown/Tab in search input → exit search, select first feed
      if ((e.key === "ArrowDown" || e.key === "Tab") && isInput) {
        e.preventDefault();
        searchRef.current?.blur();
        const first = document.querySelector<HTMLElement>('[role="option"]');
        if (first) first.click();
        return;
      }

      if (isInput) return;

      if (e.key === "/") {
        e.preventDefault();
        setSelectedFeedUrl(null);
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        if (selectedRowId) {
          setSelectedFeedUrl(null);
        } else {
          searchRef.current?.focus();
        }
      } else if (e.key === "Enter") {
        // Add/remove the selected feed
        const selected = document.querySelector<HTMLElement>(
          '[role="option"][aria-selected="true"] [data-action="add"]',
        );
        if (selected) {
          e.preventDefault();
          selected.click();
        }
      } else if (e.key === "p") {
        // Preview the selected feed
        const selected = document.querySelector<HTMLElement>(
          '[role="option"][aria-selected="true"] [data-action="preview"]',
        );
        if (selected) {
          e.preventDefault();
          selected.click();
        }
      } else if (e.key === "1") {
        handleTabChange("featured");
      } else if (e.key === "2") {
        handleTabChange("topics");
      } else if (e.key === "3") {
        handleTabChange("countries");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleTabChange, selectedRowId]);

  // Eagerly load generated catalog for global search and Topics/Countries tabs
  useEffect(() => {
    if (!catalog) {
      setLoading(true);
      loadGeneratedCatalog().then((data) => {
        setCatalog(data);
        setLoading(false);
      });
    }
  }, [catalog]);

  // Build search index when catalog is loaded
  const searchIndex = useMemo(() => {
    if (!catalog) return null;
    return buildSearchIndex(feedCatalog, catalog);
  }, [catalog]);

  // Global search across all feeds (skip for URL inputs, wait for 3+ chars)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q || isUrlInput || q.length < 3) return null;

    if (searchIndex) {
      return searchFeeds(searchIndex, q);
    }

    // Catalog not loaded yet — search featured only as fallback
    const allFeatured = feedCatalog.flatMap((c) =>
      c.feeds.map((f) => ({
        name: f.name,
        feedUrl: f.feedUrl,
        siteUrl: f.siteUrl,
        category: c.name,
        categoryType: "featured" as const,
        searchText: `${f.name} ${c.name}`.toLowerCase(),
      })),
    );
    return searchFeeds(allFeatured, q);
  }, [searchQuery, isUrlInput, searchIndex]);

  const tabs: { id: BrowseTab; label: string }[] = [
    { id: "featured", label: "Featured" },
    { id: "topics", label: "Topics" },
    { id: "countries", label: "Countries" },
  ];

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Explore</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discover feeds from our curated library
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToSettings(navigate, "data")}
        >
          <FileUp className="mr-2 size-4" />
          Import / Export
        </Button>
      </div>

      <form onSubmit={handleUrlSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search feeds or paste a URL..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedFeedUrl(null); }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="pl-9 pr-9"
            disabled={isAddingFeed}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setSelectedFeedUrl(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : !searchFocused && (
            <Kbd className="absolute right-3 top-1/2 -translate-y-1/2">/</Kbd>
          )}
        </div>
        {isUrlInput && searchQuery.trim() ? (
          <p className="text-sm text-muted-foreground mt-2">
            Press Enter to add this feed
          </p>
        ) : searchFocused && (
          <p className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            <span><Kbd>↓</Kbd> or <Kbd>Tab</Kbd> to browse</span>
            <span><Kbd>Esc</Kbd> to clear</span>
          </p>
        )}
      </form>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selectedRowId && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground py-2">
          <span><Kbd>j</Kbd> <Kbd>k</Kbd> navigate</span>
          <span><Kbd>/</Kbd> search</span>
        </div>
      )}

      <div role="listbox" aria-label="Feeds">
        {isSearching && searchResults ? (
          <SearchResultsView
            results={searchResults}
            subscribedFeeds={feeds}
            query={searchQuery}
            selectedRowId={selectedRowId}
            onSelectRow={setSelectedFeedUrl}
          />
        ) : (
          <>
            {activeTab === "featured" && (
              <FeaturedView
                subscribedFeeds={feeds}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedFeedUrl}
              />
            )}

            {activeTab !== "featured" && loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" />
                Loading catalog...
              </div>
            )}

            {activeTab === "topics" && catalog && (
              <TopicsView
                catalog={catalog}
                subscribedFeeds={feeds}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedFeedUrl}
              />
            )}

            {activeTab === "countries" && catalog && (
              <CountriesView
                catalog={catalog}
                subscribedFeeds={feeds}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedFeedUrl}
              />
            )}
          </>
        )}
      </div>

    </div>
  );
}
