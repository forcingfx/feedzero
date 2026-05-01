import { useState, useMemo } from "react";
import { Wand2 } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store";
import { Button } from "@/components/ui/button";
import { AutoOrganizeDialog } from "./auto-organize-dialog";

/** Feeds count threshold above which the pill becomes useful (otherwise the
 *  manual flow is faster). Picked to match the user's "many feeds" intuition. */
const FEEDS_THRESHOLD = 10;

/**
 * A discoverable entry point for the auto-organize flow.
 *
 * Renders only when (a) the user has more feeds than fits comfortably in
 * a flat list, and (b) at least one feed is still unfiled — so there's
 * actually work to do. Clicking opens the AutoOrganizeDialog.
 */
export function AutoOrganizePill() {
  const feeds = useFeedStore((s) => s.feeds);
  const [open, setOpen] = useState(false);

  const visible = useMemo(() => {
    if (feeds.length <= FEEDS_THRESHOLD) return false;
    return feeds.some((f) => !f.folderId);
  }, [feeds]);

  if (!visible) return null;

  return (
    <>
      <Button
        data-testid="auto-organize-pill"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full justify-start rounded-full h-8 px-3 text-xs"
      >
        <Wand2 className="size-3.5 mr-1.5" />
        Auto-organize feeds
      </Button>
      <AutoOrganizeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
