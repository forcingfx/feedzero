import { useState } from "react";
import { KeyRound, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";
import { initFresh } from "@/core/storage/key-manager";
import { pullVault, importVault } from "@/core/sync/sync-service";

export function RecoveryStep() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const setStep = useOnboardingStore((s) => s.setStep);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const handleRecover = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passphrase.trim()) return;

    setIsLoading(true);
    setError(null);

    const trimmed = passphrase.trim();

    // 1. Pull vault FIRST — before any destructive operations.
    //    This ensures the vault data is safely in memory before we
    //    touch local state or risk deleting the server vault.
    const pullResult = await pullVault(trimmed);
    if (!pullResult.ok) {
      setError("Could not find a vault for this passphrase. Please check and try again.");
      setIsLoading(false);
      return;
    }

    // 2. Now that vault data is safely in hand, initialize local DB.
    //    skipServerCleanup prevents deleting the vault we just pulled from.
    const initResult = await initFresh(trimmed, { sync: true, skipServerCleanup: true });
    if (!initResult.ok) {
      setError("Could not initialize. Please check your passphrase.");
      setIsLoading(false);
      return;
    }

    const credentials = initResult.value.credentials;

    // 3. Import the pulled vault data and restore sync state.
    //    `initFresh` already opened a fresh DB with passphrase-derived
    //    keys AND wrote those keys to localStorage. `importVault` runs
    //    encryption against the same in-memory keys, so on-disk
    //    ciphertext matches what `restore()` will use on next session.
    //    No separate "rekey" step needed — see #117 for the bug the
    //    old extra rekey call masked.
    if (credentials) {
      await importVault(pullResult.value);
      useSyncStore.getState().restoreSync(credentials);
    }

    useAppStore.setState({ isDbReady: true });
    completeOnboarding();
  };

  return (
    <>
      <DialogHeader>
        <div className="flex justify-center py-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="size-6 text-primary" />
          </div>
        </div>
        <DialogTitle className="text-center">
          Enter your recovery key
        </DialogTitle>
        <DialogDescription className="text-center">
          Enter the 4-word passphrase you saved when you first set up FeedZero.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleRecover}>
        <div className="space-y-4">
          <Input
            type="text"
            placeholder="Enter your 4-word passphrase"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(null);
            }}
            className={error ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-col">
          <Button
            type="submit"
            size="lg"
            disabled={!passphrase.trim() || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Recovering...
              </>
            ) : (
              <>
                Recover
                <Kbd className="ml-2">Enter</Kbd>
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep("storage-choice")}
            disabled={isLoading}
            className="w-full"
          >
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
