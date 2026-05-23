import { useState, useRef, useId } from "react";
import { useNavigate } from "react-router";
import { Eye, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { findSubscribedFeed } from "@/lib/feed-catalog.ts";
import { upgradeToast } from "@/lib/upgrade-toast.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { FeedFavicon } from "@/components/feeds/feed-favicon.tsx";
import { FeedPreviewSheet } from "@/components/explore/feed-preview-sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import type { Feed } from "@feedzero/core/types";

export interface FeedRowProps {
  name: string;
  feedUrl: string;
  siteUrl: string;
  description?: string;
  subscribed: boolean;
  subscribedFeeds: Feed[];
  selectedRowId?: string | null;
  onSelectRow?: (rowId: string) => void;
}

/**
 * One feed in any catalog tab — featured, topics, countries, future
 * use-case packs and platform bridges. Owns its own add/remove + preview
 * state. The `subscribedFeeds` list is passed in so each row can
 * recognise the user's existing subscriptions without an extra store
 * read per render.
 */
export function FeedRow({
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
  const navigate = useNavigate();
  const added = subscribed || justAdded;

  async function handleAdd() {
    setIsAdding(true);
    const result = await addFeed(feedUrl);
    setIsAdding(false);
    if (result.ok) {
      setJustAdded(true);
      toast.success(`Added ${name}`);
    } else if (result.reason === "free-quota-exceeded") {
      upgradeToast(result.error, navigate);
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
