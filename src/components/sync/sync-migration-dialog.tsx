/**
 * SyncMigrationDialog — graceful migration off cloud sync after the paywall.
 *
 * Existing cloud-sync users who open the app post-launch hit a 401 from
 * /api/sync ("license required"). Sync store sets pendingMigration to
 * "license-required"; this dialog renders and gives the user three
 * non-destructive paths forward:
 *
 *   1. Keep reading locally — drops vault keys, switches to local-only.
 *      The cloud vault is preserved server-side for 90 days so a future
 *      subscribe can restore it (see Privacy page retention promise).
 *   2. Subscribe — Personal monthly deeplink into Stripe Checkout. We
 *      keep the existing passphrase: their vault key still works and a
 *      successful checkout re-enables sync without re-onboarding.
 *   3. Self-host — link to the docs; FOSS path retains every feature.
 *
 * Mounted once at the App level (see src/app.tsx). It is the canonical
 * surface for graceful migration off any tier-gated feature — extend
 * PendingMigration to cover new causes rather than spawning sibling
 * dialogs.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSyncStore } from "@/stores/sync-store";

const SELF_HOST_GUIDE_URL = "https://www.feedzero.app/docs/self-hosting";

export function SyncMigrationDialog() {
  const pendingMigration = useSyncStore((s) => s.pendingMigration);
  const migrateToLocalOnly = useSyncStore((s) => s.migrateToLocalOnly);
  const dismissPendingMigration = useSyncStore(
    (s) => s.dismissPendingMigration,
  );

  const open = pendingMigration === "license-required";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismissPendingMigration();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cloud sync is now a Personal feature</DialogTitle>
          <DialogDescription>
            Your reading data is safe on this device. To keep syncing across
            devices, subscribe to Personal — or self-host FeedZero for free
            and keep every feature.
          </DialogDescription>
        </DialogHeader>

        <div className="text-muted-foreground space-y-3 text-sm">
          <p>
            We&apos;ve preserved your encrypted cloud vault for{" "}
            <strong>90 days</strong>. Subscribe within that window and your
            existing passphrase will restore everything across devices.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button asChild className="w-full">
            <a href="/?subscribe=personal-monthly">
              Subscribe to Personal — $5/mo
            </a>
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await migrateToLocalOnly();
            }}
          >
            Keep reading locally
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <a
              href={SELF_HOST_GUIDE_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              Self-host instead (free, all features)
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
