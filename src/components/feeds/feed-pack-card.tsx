import { useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { upgradeToast } from "@/lib/upgrade-toast.ts";
import type { FeedPack } from "@/lib/feed-packs.ts";

interface FeedPackCardProps {
  pack: FeedPack;
  onComplete?: () => void;
}

export function FeedPackCard({ pack, onComplete }: FeedPackCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const addFeed = useFeedStore((s) => s.addFeed);
  const navigate = useNavigate();

  async function handleAdd() {
    setIsAdding(true);
    const toastId = toast.loading(`Adding ${pack.name}…`);

    let successCount = 0;
    let quotaError: string | null = null;
    for (const source of pack.sources) {
      const result = await addFeed(source.feedUrl);
      if (result.ok) {
        successCount++;
      } else if (result.reason === "free-quota-exceeded") {
        // The quota is global — every remaining source in this pack will
        // also be refused. Stop the loop and let the user upgrade.
        quotaError = result.error;
        break;
      }
    }

    if (quotaError) {
      upgradeToast(quotaError, navigate, { id: toastId });
    } else if (successCount === pack.sources.length) {
      toast.success(`Added ${successCount} feeds`, { id: toastId });
    } else if (successCount > 0) {
      toast.success(
        `Added ${successCount} of ${pack.sources.length} feeds`,
        { id: toastId },
      );
    } else {
      toast.error("Could not add feeds", { id: toastId });
    }

    setIsAdding(false);
    setAdded(successCount > 0);
    if (successCount > 0 && onComplete) onComplete();
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">{pack.name}</h3>
          <p className="text-xs text-muted-foreground">{pack.description}</p>
        </div>
        <Button
          size="sm"
          variant={added ? "secondary" : "default"}
          disabled={isAdding || added}
          onClick={handleAdd}
        >
          {isAdding ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : added ? (
            "Added"
          ) : (
            <>
              <Plus className="size-3.5 mr-1" />
              Add all
            </>
          )}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        {pack.sources.map((source) => (
          <div
            key={source.feedUrl}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <FeedFavicon siteUrl={source.siteUrl} className="size-3.5" />
            {source.name}
          </div>
        ))}
      </div>
    </div>
  );
}
