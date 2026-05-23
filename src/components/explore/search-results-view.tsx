import { isSubscribed } from "@/lib/feed-catalog.ts";
import type { SearchableItem } from "@/lib/catalog-search.ts";
import { FeedRow } from "@/components/explore/feed-row.tsx";
import type { Feed } from "@feedzero/core/types";

interface SearchResultsViewProps {
  results: SearchableItem[];
  subscribedFeeds: Feed[];
  query: string;
  selectedRowId: string | null;
  onSelectRow: (url: string) => void;
}

/**
 * Search hit list. Groups results by their source category (Featured,
 * a topic name, a country name). Used when the explore search input
 * has 3+ chars that don't look like a URL.
 */
export function SearchResultsView({
  results,
  subscribedFeeds,
  query,
  selectedRowId,
  onSelectRow,
}: SearchResultsViewProps) {
  if (results.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No feeds matching &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

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
