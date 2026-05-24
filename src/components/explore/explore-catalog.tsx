import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { Loader2, Search, X, FileUp } from "lucide-react";
import { toast } from "sonner";
import { feedCatalog } from "@/lib/feed-catalog.ts";
import { loadGeneratedCatalog } from "@/lib/catalog-loader.ts";
import {
  buildSearchIndex,
  searchFeeds,
  type GeneratedCatalog,
} from "@/lib/catalog-search.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { goToSettings } from "@/lib/go-to-settings.ts";
import { upgradeToast } from "@/lib/upgrade-toast.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { looksLikeUrl } from "@/lib/url-detection.ts";
import { FeaturedTab } from "@/components/explore/featured-tab.tsx";
import { TopicsTab } from "@/components/explore/topics-tab.tsx";
import { CountriesTab } from "@/components/explore/countries-tab.tsx";
import { SearchResultsView } from "@/components/explore/search-results-view.tsx";
import { FeedFormatChip } from "@/components/explore/feed-format-chip.tsx";

/**
 * Available tabs in the explore surface. New tabs (use-case packs,
 * editorial collections, platform bridges for YouTube / Reddit) drop
 * in as additional ids + sibling tab files; the shell only needs a
 * new render branch.
 */
type BrowseTab = "featured" | "topics" | "countries";

const TAB_DESCRIPTORS: { id: BrowseTab; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "topics", label: "Topics" },
  { id: "countries", label: "Countries" },
];

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
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleTabChange = useCallback((tab: BrowseTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setSelectedRowId(null);
  }, []);

  // Focus search input when navigated here with ?focus=search (set by the
  // N keyboard shortcut and the Plus button). URL-driven instead of a
  // DOM CustomEvent — see ADR 003.
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focus") === "search") {
      searchRef.current?.focus();
    }
  }, [location.search]);

  const isUrlInput = looksLikeUrl(searchQuery);

  /**
   * Add the URL currently in the search input. Used by both Enter
   * submission (`<form onSubmit>`) and the explicit "Add feed" button
   * inside the discovery chip — same code path either way.
   */
  const submitUrl = useCallback(async () => {
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
    } else if (result.reason === "free-quota-exceeded") {
      upgradeToast(result.error, navigate, { id: toastId });
    } else {
      toast.error(result.error || "Failed to add feed", { id: toastId });
    }
  }, [isUrlInput, searchQuery, addFeed, navigate, onFeedAdded]);

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitUrl();
  }

  // Keyboard shortcuts for explore
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape" && isInput) {
        setSearchQuery("");
        setSelectedRowId(null);
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
        setSelectedRowId(null);
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        if (selectedRowId) {
          setSelectedRowId(null);
        }
      } else if (e.key === "Enter") {
        const selected = document.querySelector<HTMLElement>(
          '[role="option"][aria-selected="true"] [data-action="add"]',
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
          onClick={() => goToSettings(navigate, "sync-and-data")}
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
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedRowId(null); }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="pl-9 pr-9"
            disabled={isAddingFeed}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setSelectedRowId(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : !searchFocused && (
            <Kbd className="absolute right-3 top-1/2 -translate-y-1/2">/</Kbd>
          )}
        </div>
        {isUrlInput && searchQuery.trim() ? (
          <FeedFormatChip
            url={searchQuery.trim()}
            onAdd={submitUrl}
            isAdding={isAddingFeed}
          />
        ) : searchFocused && (
          <p className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            <span><Kbd>↓</Kbd> or <Kbd>Tab</Kbd> to browse</span>
            <span><Kbd>Esc</Kbd> to clear</span>
          </p>
        )}
      </form>

      <div className="flex gap-1 border-b">
        {TAB_DESCRIPTORS.map((tab) => (
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
            onSelectRow={setSelectedRowId}
          />
        ) : (
          <>
            {activeTab === "featured" && (
              <FeaturedTab
                subscribedFeeds={feeds}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedRowId}
              />
            )}

            {activeTab !== "featured" && loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" />
                Loading catalog...
              </div>
            )}

            {activeTab === "topics" && catalog && (
              <TopicsTab
                catalog={catalog}
                subscribedFeeds={feeds}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedRowId}
              />
            )}

            {activeTab === "countries" && catalog && (
              <CountriesTab
                catalog={catalog}
                subscribedFeeds={feeds}
                selectedRowId={selectedRowId}
                onSelectRow={setSelectedRowId}
              />
            )}
          </>
        )}
      </div>

    </div>
  );
}
