import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeft, Eye, Plus, Loader2, Search, X, Minus } from "lucide-react";
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
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { Feed } from "@/types/index.ts";

type BrowseTab = "featured" | "topics" | "countries";

// --- Shared feed row (works for both CatalogFeed and AwesomeFeed) ---

interface FeedRowProps {
  name: string;
  feedUrl: string;
  siteUrl: string;
  description?: string;
  tags?: string[];
  subscribed: boolean;
  subscribedFeeds: Feed[];
}

function FeedRow({
  name,
  feedUrl,
  siteUrl,
  description,
  tags,
  subscribed,
  subscribedFeeds,
}: FeedRowProps) {
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
      <div className="flex items-start gap-3 py-2">
        <FeedFavicon siteUrl={siteUrl} />
        <button
          className="flex-1 min-w-0 text-left hover:underline decoration-muted-foreground/40"
          onClick={() => setPreviewOpen(true)}
        >
          <div className="font-medium text-sm">{name}</div>
          {description && (
            <div className="text-xs text-muted-foreground">{description}</div>
          )}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => setPreviewOpen(true)}
            title="Preview feed"
          >
            <Eye className="size-3.5" />
          </Button>
          {added ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
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
              onClick={handleAdd}
            >
              <Plus className="size-3.5" />
              <span>Add</span>
            </Button>
          )}
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

function FeaturedView({ subscribedFeeds }: { subscribedFeeds: Feed[] }) {
  return (
    <div className="space-y-8">
      {feedCatalog.map((category) => (
        <FeaturedCategorySection
          key={category.id}
          category={category}
          subscribedFeeds={subscribedFeeds}
        />
      ))}
    </div>
  );
}

function FeaturedCategorySection({
  category,
  subscribedFeeds,
}: {
  category: CatalogCategory;
  subscribedFeeds: Feed[];
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
          <h2 className="text-lg font-medium">{category.name}</h2>
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
            tags={feed.tags}
            subscribed={isSubscribed(feed.feedUrl, subscribedFeeds)}
            subscribedFeeds={subscribedFeeds}
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
}: {
  title: string;
  subtitle?: string;
  feeds: AwesomeFeed[];
  subscribedFeeds: Feed[];
  onBack: () => void;
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
}: {
  section: CatalogSection;
  subscribedFeeds: Feed[];
  onBack: () => void;
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
}: {
  catalog: GeneratedCatalog;
  subscribedFeeds: Feed[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = catalog.sections.find((s) => s.id === selectedId);

  if (selected) {
    return (
      <SectionDetail
        section={selected}
        subscribedFeeds={subscribedFeeds}
        onBack={() => setSelectedId(null)}
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
}: {
  catalog: GeneratedCatalog;
  subscribedFeeds: Feed[];
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
  onSearchEverywhere,
  isEverywhere,
}: {
  results: SearchableItem[];
  subscribedFeeds: Feed[];
  query: string;
  onSearchEverywhere?: () => void;
  isEverywhere: boolean;
}) {
  if (results.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No feeds matching &ldquo;{query}&rdquo;</p>
        {!isEverywhere && onSearchEverywhere && (
          <button
            onClick={onSearchEverywhere}
            className="mt-2 text-sm underline hover:text-foreground"
          >
            Search everywhere instead
          </button>
        )}
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
              />
            ))}
          </div>
        </div>
      ))}
      {!isEverywhere && onSearchEverywhere && (
        <div className="text-center">
          <button
            onClick={onSearchEverywhere}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Search everywhere for &ldquo;{query}&rdquo;
          </button>
        </div>
      )}
    </div>
  );
}

/** Curated feed library for discovering new feeds. */
export function ExploreCatalog() {
  const feeds = useFeedStore((s) => s.feeds);
  const [activeTab, setActiveTab] = useState<BrowseTab>("featured");
  const [catalog, setCatalog] = useState<GeneratedCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEverywhere, setSearchEverywhere] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleTabChange = useCallback((tab: BrowseTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setSearchEverywhere(false);
  }, []);

  // Keyboard shortcuts for explore: / to search, 1/2/3 for tabs, Escape to clear
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape" && isInput) {
        setSearchQuery("");
        setSearchEverywhere(false);
        searchRef.current?.blur();
        return;
      }

      if (isInput) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
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
  }, [handleTabChange]);

  useEffect(() => {
    if (activeTab !== "featured" && !catalog) {
      setLoading(true);
      loadGeneratedCatalog().then((data) => {
        setCatalog(data);
        setLoading(false);
      });
    }
  }, [activeTab, catalog]);

  // Build search index when catalog is loaded
  const searchIndex = useMemo(() => {
    if (!catalog) return null;
    return buildSearchIndex(feedCatalog, catalog);
  }, [catalog]);

  // Scoped search: filter results by current tab
  const scopedResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;

    if (searchEverywhere && searchIndex) {
      return searchFeeds(searchIndex, q);
    }

    // Scoped to current tab
    if (activeTab === "featured") {
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
    }

    if (searchIndex) {
      const typeFilter =
        activeTab === "topics" ? "topic" : "country";
      const scoped = searchIndex.filter(
        (i) => i.categoryType === typeFilter || i.categoryType === "featured",
      );
      return searchFeeds(scoped, q);
    }

    return null;
  }, [searchQuery, searchEverywhere, activeTab, searchIndex]);

  function handleSearchEverywhere() {
    setSearchEverywhere(true);
    // Load catalog if not yet loaded (needed for full index)
    if (!catalog) {
      setLoading(true);
      loadGeneratedCatalog().then((data) => {
        setCatalog(data);
        setLoading(false);
      });
    }
  }

  const tabs: { id: BrowseTab; label: string }[] = [
    { id: "featured", label: "Featured" },
    { id: "topics", label: "Topics" },
    { id: "countries", label: "Countries" },
  ];

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Explore feeds</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Discover feeds from our curated library
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder={`Search ${activeTab === "featured" ? "featured" : activeTab}... (press /)`}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchEverywhere(false);
          }}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSearchEverywhere(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

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

      {isSearching && scopedResults ? (
        <SearchResultsView
          results={scopedResults}
          subscribedFeeds={feeds}
          query={searchQuery}
          onSearchEverywhere={
            !searchEverywhere ? handleSearchEverywhere : undefined
          }
          isEverywhere={searchEverywhere}
        />
      ) : (
        <>
          {activeTab === "featured" && (
            <FeaturedView subscribedFeeds={feeds} />
          )}

          {activeTab !== "featured" && loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" />
              Loading catalog...
            </div>
          )}

          {activeTab === "topics" && catalog && (
            <TopicsView catalog={catalog} subscribedFeeds={feeds} />
          )}

          {activeTab === "countries" && catalog && (
            <CountriesView catalog={catalog} subscribedFeeds={feeds} />
          )}
        </>
      )}
    </div>
  );
}
