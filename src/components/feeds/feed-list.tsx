import { useFeedStore } from "@/stores/feed-store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { AddFeedForm } from "./add-feed-form.tsx";
import { FeedItem } from "./feed-item.tsx";

interface FeedListProps {
  onFeedSelect?: (feedId: string) => void;
}

export function FeedList({ onFeedSelect }: FeedListProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const selectedFeedId = useFeedStore((s) => s.selectedFeedId);
  const error = useFeedStore((s) => s.error);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const refreshAll = useFeedStore((s) => s.refreshAll);

  function handleSelect(feedId: string) {
    if (onFeedSelect) onFeedSelect(feedId);
  }

  return (
    <>
      <AddFeedForm />

      <div className="flex px-sm pb-sm">
        <Button
          variant="outline"
          size="xs"
          title="Refresh all feeds"
          onClick={refreshAll}
        >
          Refresh All
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-sm">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {feeds.length === 0 ? (
        <div className="p-sm text-muted-foreground text-sm">
          No feeds yet. Add one above.
        </div>
      ) : (
        <ul role="listbox" aria-label="Feeds" className="list-none m-0 p-0">
          {feeds.map((feed) => (
            <FeedItem
              key={feed.id}
              feed={feed}
              isSelected={feed.id === selectedFeedId}
              onSelect={handleSelect}
              onRemove={removeFeed}
            />
          ))}
        </ul>
      )}
    </>
  );
}
