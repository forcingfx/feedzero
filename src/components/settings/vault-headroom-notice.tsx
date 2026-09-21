import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useSyncStore } from "@/stores/sync-store";
import { useArticleStore } from "@/stores/article-store";
import { measureVaultHeadroom } from "@/core/sync/vault-headroom";

/**
 * How much of the sync size limit this vault uses, measured from the
 * last push, plus the one action that gives space back.
 *
 * A vault that outgrows the limit stops syncing, and until this existed
 * the first a user knew of it was a failed push. The readout is silent
 * while there is room and speaks up before the wall, not at it.
 *
 * Nothing here leaves the device: the size comes from the bytes this
 * browser last sent, and the warning is drawn locally. Measuring vault
 * sizes server-side would be exactly the per-user telemetry the product
 * promises not to collect.
 */
export function VaultHeadroomNotice() {
  const lastPushBytes = useSyncStore((s) => s.lastPushBytes);
  const releaseOfflineCopies = useArticleStore((s) => s.releaseOfflineCopies);
  const [releasing, setReleasing] = useState(false);

  if (lastPushBytes === null) return null;

  const headroom = measureVaultHeadroom(lastPushBytes);
  const alarming = headroom.level !== "ok";

  async function handleRelease() {
    setReleasing(true);
    const result = await releaseOfflineCopies();
    setReleasing(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.value === 0) {
      toast("Nothing to remove — every saved copy is one FeedZero keeps up to date.");
      return;
    }
    toast.success(
      `Removed offline copies from ${result.value} ${
        result.value === 1 ? "article" : "articles"
      }. The size updates after the next sync.`,
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>Encrypted vault</span>
        <span className="tabular-nums">
          {headroom.usedLabel} of {headroom.limitLabel}
        </span>
      </div>

      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            alarming ? "bg-amber-500" : "bg-muted-foreground/40"
          }`}
          style={{ width: `${Math.max(headroom.percentUsed, 2)}%` }}
        />
      </div>

      {alarming && (
        <div
          role="status"
          className="space-y-2 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-3.5 shrink-0 translate-y-0.5 text-amber-600 dark:text-amber-500" />
            <p>
              {headroom.level === "full"
                ? "This vault is too large to sync in one upload, so pushes are failing."
                : "This vault is approaching the size limit for a single upload."}{" "}
              Saved offline full text is usually most of it. Unstarring an
              article releases its copy, and the button below clears the copies
              FeedZero is no longer keeping up to date.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={releasing}
              >
                {releasing ? "Freeing up space…" : "Free up space"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove saved offline copies?</AlertDialogTitle>
                <AlertDialogDescription>
                  This clears the full text saved for articles you have not
                  starred, in feeds you have not set to prefetch. The articles
                  themselves stay, along with every copy you starred. You can
                  still fetch full text on demand while you are online.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRelease}>
                  Remove offline copies
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
