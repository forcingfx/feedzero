import { useState, useMemo, useEffect } from "react";
import { Wand2 } from "lucide-react";
import { useFeedStore } from "@/stores/feed-store";
import { useFeatureGate } from "@/hooks/use-feature-gate";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";
import { AutoOrganizeDialog } from "./auto-organize-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const FEEDS_THRESHOLD = 10;
const REAPPEAR_GAP = 5;

/**
 * Wand icon trigger that appears inline with "New folder" when there are
 * enough unfiled feeds to organize. Clicking opens a popover.
 *
 * Behavior splits on tier:
 *  - Personal / self-hosted: "Organize now" launches the dialog.
 *  - Free hosted user: the same wand opens an "Upgrade to Personal"
 *    popover and the primary CTA routes to the Stripe Checkout deeplink.
 *    The feature is discoverable but locked — see ADR 012.
 */
export function AutoOrganizePill() {
  const feeds = useFeedStore((s) => s.feeds);
  const gate = useFeatureGate("auto-organize");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const unfiledCount = useMemo(
    () => feeds.filter((f) => !f.folderId).length,
    [feeds],
  );

  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(
    () => {
      try {
        const v = localStorage.getItem(LOCAL_STORAGE.AUTO_ORGANIZE_DISMISSED_COUNT);
        return v !== null ? parseInt(v, 10) : null;
      } catch {
        return null;
      }
    },
  );

  useEffect(() => {
    if (dismissedAtCount !== null && unfiledCount < dismissedAtCount) {
      try {
        localStorage.removeItem(LOCAL_STORAGE.AUTO_ORGANIZE_DISMISSED_COUNT);
      } catch { /* ignore */ }
      setDismissedAtCount(null);
    }
  }, [unfiledCount, dismissedAtCount]);

  const visible = useMemo(() => {
    if (unfiledCount <= FEEDS_THRESHOLD) return false;
    if (dismissedAtCount === null) return true;
    return unfiledCount >= dismissedAtCount + REAPPEAR_GAP;
  }, [unfiledCount, dismissedAtCount]);

  function handleDismiss() {
    try {
      localStorage.setItem(LOCAL_STORAGE.AUTO_ORGANIZE_DISMISSED_COUNT, String(unfiledCount));
    } catch { /* ignore */ }
    setDismissedAtCount(unfiledCount);
    setPopoverOpen(false);
  }

  if (!visible) return null;

  const showUpgrade = !gate.enabled && gate.reason === "tier-locked";

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="auto-organize-trigger"
            type="button"
            aria-label="Auto-organize feeds"
            className="rounded p-1 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400 transition-colors"
          >
            <Wand2 className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          data-testid="auto-organize-popover"
          align="end"
          className="w-64 p-3 space-y-3"
        >
          <div>
            <p className="font-medium text-sm">
              {showUpgrade
                ? `${gate.featureName} is a ${gate.requiredTierLabel} feature`
                : "Auto-organize feeds"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Group your {unfiledCount} unfiled feeds into folders automatically.
            </p>
          </div>
          <div className="flex gap-2">
            {showUpgrade ? (
              <Button
                data-testid="auto-organize-upgrade-cta"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setPopoverOpen(false);
                  gate.promptUpgrade();
                }}
              >
                Upgrade — $5/mo
              </Button>
            ) : (
              <Button
                data-testid="auto-organize-open-dialog"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setPopoverOpen(false);
                  setDialogOpen(true);
                }}
              >
                Organize now
              </Button>
            )}
            <Button
              data-testid="auto-organize-dismiss"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
            >
              Dismiss
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <AutoOrganizeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
