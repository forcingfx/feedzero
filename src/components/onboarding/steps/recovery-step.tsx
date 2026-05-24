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
import { initFresh, updateStoredVaultKey } from "@/core/storage/key-manager";
import {
  checkVaultExists,
  importVault,
  recoverVault,
  upgradeVaultKdf,
} from "@/core/sync/sync-service";

type Phase = "idle" | "checking" | "restoring";

export function RecoveryStep() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const setStep = useOnboardingStore((s) => s.setStep);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const isLoading = phase !== "idle";

  const handleRecover = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passphrase.trim()) return;

    setError(null);
    const trimmed = passphrase.trim();

    // 1. HEAD-based existence check (ADR 014 A8). Lets a wrong passphrase
    //    fail fast with a clear message before we run the full PBKDF2 +
    //    GET + decrypt path, AND lets the UI distinguish "checking" from
    //    "restoring" so the user sees progress instead of a 2-second
    //    opaque spinner.
    setPhase("checking");
    const existsResult = await checkVaultExists(trimmed);
    if (!existsResult.ok) {
      setError(existsResult.error);
      setPhase("idle");
      return;
    }
    if (!existsResult.value) {
      setError(
        "No vault matched that passphrase. Double-check spelling and word " +
          "order — every word counts.",
      );
      setPhase("idle");
      return;
    }

    // 2. Pull + decrypt the cloud envelope using the KDF it was stamped
    //    with. `recoverVault` reads `envelope.kdf` so an Argon2id vault
    //    written by another device decrypts here even though this
    //    machine has never seen the spec — without that the wrong key
    //    would silently fail to decrypt and the user would think their
    //    passphrase was wrong.
    setPhase("restoring");
    const recoverResult = await recoverVault(trimmed);
    if (!recoverResult.ok) {
      setError("Could not find a vault for this passphrase. Please check and try again.");
      setPhase("idle");
      return;
    }
    const { vault, credentials: recoveredCredentials } = recoverResult.value;

    // 3. Initialize a fresh local DB. Pass the recovered KDF spec so
    //    `initFresh` derives a vault key that matches what's encrypting
    //    the cloud envelope — otherwise the next push would re-encrypt
    //    the cloud vault with a key from a different KDF, and the next
    //    device's recovery would silently fail to decrypt.
    const initResult = await initFresh(trimmed, {
      sync: true,
      skipServerCleanup: true,
      vaultKdfSpec: recoveredCredentials.kdfSpec,
    });
    if (!initResult.ok) {
      setError("Could not initialize. Please check your passphrase.");
      setPhase("idle");
      return;
    }

    let credentials = initResult.value.credentials;

    // 4. Import the pulled vault data and restore sync state.
    //    `initFresh` already opened a fresh DB with passphrase-derived
    //    keys AND wrote those keys to localStorage. `importVault` runs
    //    encryption against the same in-memory keys, so on-disk
    //    ciphertext matches what `restore()` will use on next session.
    //    No separate "rekey" step needed — see #117 for the bug the
    //    old extra rekey call masked.
    if (credentials) {
      await importVault(vault);

      // 5. Auto-upgrade the cloud envelope's KDF if it's still on the
      //    legacy PBKDF2 spec. The decision per CLAUDE.md / migration
      //    discussion: existing users get bumped to Argon2id the first
      //    time they type their passphrase on a fresh device. Best-
      //    effort — a push failure leaves the cloud at legacy, the
      //    user keeps working with their PBKDF2 credentials, and the
      //    next recovery attempt re-runs the upgrade.
      const upgraded = await upgradeVaultKdf(trimmed, credentials, vault);
      if (upgraded.ok && upgraded.value !== credentials) {
        await updateStoredVaultKey(upgraded.value);
        credentials = upgraded.value;
      }

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
            {phase === "checking" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Checking…
              </>
            ) : phase === "restoring" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Found your vault — restoring…
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
