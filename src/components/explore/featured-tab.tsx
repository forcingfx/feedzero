import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  feedCatalog,
  isSubscribed,
  type CatalogCategory,
} from "@/lib/feed-catalog.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { upgradeToast } from "@/lib/upgrade-toast.ts";
import { Button } from "@/components/ui/button.tsx";
import { FeedRow } from "@/components/explore/feed-row.tsx";
import type { Feed } from "@feedzero/core/types";

interface FeaturedTabProps {
  subscribedFeeds: Feed[];
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}

/**
 * The curated landing tab — a flat list of hand-picked category
 * sections defined in `src/lib/feed-catalog.ts`. New use-case packs
 * and editorial collections should ship as additional sibling tabs
 * (use-cases-tab, feed-packs-tab) rather than expanding this one.
 */
export function FeaturedTab({
  subscribedFeeds,
  selectedRowId,
  onSelectRow,
}: FeaturedTabProps) {
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
  const navigate = useNavigate();
  const unsubscribed = category.feeds.filter(
    (f) => !isSubscribed(f.feedUrl, subscribedFeeds),
  );
  const allSubscribed = unsubscribed.length === 0;

  async function handleAddAll() {
    setIsAdding(true);
    let ok = 0;
    let quotaError: string | null = null;
    for (const feed of unsubscribed) {
      const r = await addFeed(feed.feedUrl);
      if (r.ok) {
        ok++;
      } else if (r.reason === "free-quota-exceeded") {
        // Global quota — abort the loop and route to upgrade.
        quotaError = r.error;
        break;
      }
    }
    setIsAdding(false);
    if (quotaError) upgradeToast(quotaError, navigate);
    else if (ok === unsubscribed.length) toast.success(`Added all ${category.name} feeds`);
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
