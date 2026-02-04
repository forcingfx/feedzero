import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useSyncStore } from "@/stores/sync-store";
import { LOCAL_STORAGE } from "@/utils/constants";
import { WelcomeStep } from "./steps/welcome-step";
import { StorageChoiceStep } from "./steps/storage-choice-step";
import { PassphraseDisplayStep } from "./steps/passphrase-display-step";
import { PassphraseConfirmStep } from "./steps/passphrase-confirm-step";
import { RecoveryStep } from "./steps/recovery-step";

function InitializingStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Setting up your data...</p>
    </div>
  );
}

export function OnboardingModal() {
  const hasCompleted = useAppStore((s) => s.hasCompletedOnboarding);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const initialize = useAppStore((s) => s.initialize);
  const step = useOnboardingStore((s) => s.step);
  const storageMode = useOnboardingStore((s) => s.storageMode);
  const generatedPassphrase = useOnboardingStore((s) => s.generatedPassphrase);
  const enableSync = useSyncStore((s) => s.enableSync);

  const isOpen = hasCompleted === false;

  useEffect(() => {
    if (step === "initializing" && generatedPassphrase) {
      initialize(generatedPassphrase).then(async () => {
        if (storageMode === "sync") {
          await enableSync(generatedPassphrase);
        } else {
          localStorage.setItem(
            LOCAL_STORAGE.SYNC_PASSPHRASE,
            generatedPassphrase,
          );
          localStorage.setItem(LOCAL_STORAGE.STORAGE_MODE, "local");
        }
        completeOnboarding();
      });
    }
  }, [
    step,
    generatedPassphrase,
    storageMode,
    initialize,
    enableSync,
    completeOnboarding,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        {step === "welcome" && <WelcomeStep />}
        {step === "storage-choice" && <StorageChoiceStep />}
        {step === "passphrase-display" && <PassphraseDisplayStep />}
        {step === "passphrase-confirm" && <PassphraseConfirmStep />}
        {step === "initializing" && <InitializingStep />}
        {step === "recovery" && <RecoveryStep />}
      </DialogContent>
    </Dialog>
  );
}
