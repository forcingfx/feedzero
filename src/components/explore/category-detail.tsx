import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { isSubscribed, findSubscribedFeed } from "@/lib/feed-catalog.ts";
import type { AwesomeFeed } from "@/lib/catalog-search.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { upgradeToast } from "@/lib/upgrade-toast.ts";
import { Button } from "@/components/ui/button.tsx";
import { FeedRow } from "@/components/explore/feed-row.tsx";
import type { Feed } from "@feedzero/core/types";

interface CategoryDetailProps {
  title: string;
  subtitle?: string;
  feeds: AwesomeFeed[];
  subscribedFeeds: Feed[];
  onBack: () => void;
  selectedRowId?: string | null;
  onSelectRow?: (url: string) => void;
}

/**
 * Detail page for a single category — list of feeds with add-all /
 * remove-all bulk actions. Used by Topics subcategories, Countries,
 * and any future tab that drills into a list (use-case packs, etc).
 */
export function CategoryDetail({
  title,
  subtitle,
  feeds,
  subscribedFeeds,
  onBack,
  selectedRowId,
  onSelectRow,
}: CategoryDetailProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const addFeed = useFeedStore((s) => s.addFeed);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const navigate = useNavigate();
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
    let quotaError: string | null = null;
    for (const feed of unsubscribed) {
      const r = await addFeed(feed.feedUrl);
      if (r.ok) {
        ok++;
      } else if (r.reason === "free-quota-exceeded") {
        // Global quota — abort the loop and surface the upgrade affordance.
        quotaError = r.error;
        break;
      }
    }
    setIsAdding(false);
    if (quotaError) upgradeToast(quotaError, navigate);
    else if (ok === unsubscribed.length) toast.success(`Added all ${title} feeds`);
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
