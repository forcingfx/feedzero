import { Plus, AlertCircle, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeedStore } from "@/stores/feed-store";
import { toast } from "sonner";
import type { SuggestedFeed } from "@feedzero/core/types";

interface Props {
  suggestions: SuggestedFeed[];
}

/**
 * Renders the "Suggested feeds" list under a briefing. Each row:
 * resolved title (from discoverFeed) + the model's rationale + a
 * Subscribe button. Unreachable suggestions are visually muted with a
 * tooltip explaining why; the user can still inspect them but can't
 * subscribe.
 *
 * Subscribing routes through the existing feed-store.addFeed() so the
 * Pro/quota path, dedup, and toast feedback are unchanged.
 */
export function SuggestedFeedsList({ suggestions }: Props) {
  const addFeed = useFeedStore((s) => s.addFeed);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        The model didn&apos;t surface any web-search-verified feeds for
        this briefing.
      </p>
    );
  }

  async function handleSubscribe(suggestion: SuggestedFeed) {
    const url = suggestion.resolvedFeedUrl ?? suggestion.candidateUrl;
    setSubscribing(url);
    const result = await addFeed(url);
    setSubscribing(null);
    if (result.ok) {
      toast.success(`Subscribed to ${suggestion.resolvedTitle ?? url}`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <ul className="space-y-2">
      {suggestions.map((s, i) => {
        const isUnreachable = s.discoveryStatus === "unreachable";
        const isResolved = s.discoveryStatus === "resolved";
        const url = s.resolvedFeedUrl ?? s.candidateUrl;
        return (
          <li
            key={`${s.candidateUrl}-${i}`}
            className={
              "flex items-start gap-3 rounded-lg border p-3 " +
              (isUnreachable
                ? "border-border bg-muted/40 opacity-60"
                : "border-border bg-card")
            }
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-sm font-medium">
                  {s.resolvedTitle ?? s.candidateUrl}
                </p>
                {isUnreachable ? (
                  <span
                    className="flex shrink-0 items-baseline gap-1 text-xs text-muted-foreground"
                    title="FeedZero couldn't reach this URL or find a feed at it."
                  >
                    <AlertCircle className="size-3" />
                    Couldn&apos;t reach
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{s.rationale}</p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-baseline gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                {url}
              </a>
            </div>
            <Button
              variant={isResolved ? "default" : "outline"}
              size="sm"
              disabled={!isResolved || subscribing === url}
              onClick={() => void handleSubscribe(s)}
            >
              <Plus className="size-4" />
              Subscribe
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
