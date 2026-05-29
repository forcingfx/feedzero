/**
 * Recovery screen shown when `restore()` returns "invalid-keys" — i.e.
 * stored derived keys exist locally but cannot decrypt the IndexedDB
 * contents. This used to silently trigger `destroy()` which deleted
 * both the local DB AND the server-side vault (issue #117). Now we
 * surface an explicit choice instead.
 *
 * Two paths:
 *   - "Restore from cloud" — enter passphrase, call
 *     `switchToExistingCloud("replace")`. The `applyCloudVault` helper
 *     (sync-store.ts) handles the close/delete/open/import dance that
 *     guarantees on-disk ciphertext matches the new keys.
 *   - "Wipe and start over" — explicit AlertDialog confirmation, then
 *     `resetApp()`. This is the only sanctioned caller of `destroy()`
 *     and acknowledges the user is choosing to delete the cloud vault.
 *
 * Neither path is automatic. The whole point of #117's fix is that the
 * user makes the call when the canary fails — never the boot code.
 */
import { useState } from "react";
import { KeyRound, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
} from "@/components/ui/alert-dialog";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";

export function InvalidKeysScreen() {
  const clearRecoveryMode = useAppStore((s) => s.clearRecoveryMode);
  const resetApp = useAppStore((s) => s.resetApp);
  const switchToExistingCloud = useSyncStore((s) => s.switchToExistingCloud);

  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  async function handleRestore(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = passphrase.trim();
    if (!trimmed) {
      setError("Enter your 4-word passphrase.");
      return;
    }
    setError(null);
    setIsWorking(true);
    const result = await switchToExistingCloud(trimmed, "replace");
    setIsWorking(false);
    if (!result.ok) {
      setError(
        result.error.includes("No cloud vault")
          ? "No vault found for that passphrase. Double-check every word."
          : result.error,
      );
      return;
    }
    // applyCloudVault has already populated the DB and refreshed the
    // in-memory stores. The boot FSM transitions
    // needs-recovery → ready on `recovery-cleared`, which flips
    // isDbReady (the legacy mirror) as a derived effect — no
    // separate setState needed.
    clearRecoveryMode();
  }

  async function handleWipe() {
    setIsWorking(true);
    await resetApp();
    setIsWorking(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold">Can't open your local data</h1>
        <p className="text-sm text-muted-foreground">
          Your stored keys couldn't decrypt the local FeedZero database on this
          device. Your cloud vault is untouched — restore from it with your
          passphrase, or wipe this device and start over.
        </p>
      </div>

      <form onSubmit={handleRestore} className="space-y-3">
        <label htmlFor="recovery-passphrase" className="text-sm font-medium">
          Restore from cloud
        </label>
        <div className="flex gap-2">
          <Input
            id="recovery-passphrase"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="four word passphrase"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(null);
            }}
            disabled={isWorking}
            className={error ? "border-destructive" : ""}
          />
          <Button type="submit" disabled={!passphrase.trim() || isWorking}>
            {isWorking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="mr-2 size-4" />
                Restore
              </>
            )}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>

      <div className="border-t pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full"
              disabled={isWorking}
            >
              Wipe this device and start over
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Wipe FeedZero on this device?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes your local database AND your cloud vault. Any data
                only stored in the cloud will be permanently lost. This can't be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleWipe}
                disabled={isWorking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Wipe everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
