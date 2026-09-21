import { AlertTriangle } from "lucide-react";
import { useSyncStore } from "@/stores/sync-store";
import { measureVaultHeadroom } from "@/core/sync/vault-headroom";

/**
 * How much of the sync size limit this vault uses, measured from the
 * last push.
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
  if (lastPushBytes === null) return null;

  const headroom = measureVaultHeadroom(lastPushBytes);
  const alarming = headroom.level !== "ok";

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
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs"
        >
          <AlertTriangle className="size-3.5 shrink-0 translate-y-0.5 text-amber-600 dark:text-amber-500" />
          <p>
            {headroom.level === "full"
              ? "This vault is too large to sync in one upload, so pushes are failing."
              : "This vault is approaching the size limit for a single upload."}{" "}
            Saved offline full text is usually most of it, and today the only
            way to release that space is to remove a feed you no longer read,
            which also removes its articles. Reading on this device is
            unaffected either way.
          </p>
        </div>
      )}
    </div>
  );
}
