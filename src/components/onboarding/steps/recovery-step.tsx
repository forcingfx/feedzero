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
import { open, getSalt } from "@/core/storage/db";
import { pullVault, importVault } from "@/core/sync/sync-service";
import { deriveAndStoreKeys } from "@/core/storage/key-material";
import { deriveVaultId, deriveVaultKey } from "@/core/sync/vault-crypto";

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
    const result = await open(trimmed);

    if (!result.ok) {
      setError("Could not open database. Please check your passphrase.");
      setIsLoading(false);
      return;
    }

    // Store derived keys, remove raw passphrase from persistence
    const saltResult = await getSalt();
    const salt = saltResult.ok ? saltResult.value : undefined;
    await deriveAndStoreKeys(trimmed, salt, { includeVaultKeys: true });

    // Attempt cloud pull — if vault exists on server, import it
    const [vaultIdResult, vaultKeyResult] = await Promise.all([
      deriveVaultId(trimmed),
      deriveVaultKey(trimmed),
    ]);
    if (vaultIdResult.ok && vaultKeyResult.ok) {
      const credentials = {
        vaultId: vaultIdResult.value,
        vaultKey: vaultKeyResult.value,
      };
      const pullResult = await pullVault(credentials);
      if (pullResult.ok) {
        await importVault(pullResult.value);
        useSyncStore.getState().restoreSync(credentials);
      }
    }

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
