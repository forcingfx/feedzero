import { useState } from "react";
import { KeyRound, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAppStore } from "@/stores/app-store";
import { useSyncStore } from "@/stores/sync-store";
import { open } from "@/core/storage/db";
import { pullVault, importVault } from "@/core/sync/sync-service";

export function RecoveryStep() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const setStep = useOnboardingStore((s) => s.setStep);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const handleRecover = async () => {
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

    // Attempt cloud pull — if vault exists on server, import it
    const pullResult = await pullVault(trimmed);
    if (pullResult.ok) {
      await importVault(pullResult.value);
      useSyncStore.getState().restoreSync(trimmed);
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

      <DialogFooter className="flex-col gap-2 sm:flex-col">
        <Button
          size="lg"
          onClick={handleRecover}
          disabled={!passphrase.trim() || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Recovering...
            </>
          ) : (
            "Recover"
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setStep("storage-choice")}
          disabled={isLoading}
          className="w-full"
        >
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
      </DialogFooter>
    </>
  );
}
