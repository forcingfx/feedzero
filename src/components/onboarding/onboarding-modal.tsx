import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAppStore } from "@/stores/app-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { WelcomeStep } from "./steps/welcome-step";
import { StorageChoiceStep } from "./steps/storage-choice-step";
import { PassphraseDisplayStep } from "./steps/passphrase-display-step";
import { PassphraseConfirmStep } from "./steps/passphrase-confirm-step";

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
  const generatedPassphrase = useOnboardingStore((s) => s.generatedPassphrase);

  const isOpen = !hasCompleted;

  useEffect(() => {
    if (step === "initializing" && generatedPassphrase) {
      initialize(generatedPassphrase).then(() => {
        completeOnboarding();
      });
    }
  }, [step, generatedPassphrase, initialize, completeOnboarding]);

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        {step === "welcome" && <WelcomeStep />}
        {step === "storage-choice" && <StorageChoiceStep />}
        {step === "passphrase-display" && <PassphraseDisplayStep />}
        {step === "passphrase-confirm" && <PassphraseConfirmStep />}
        {step === "initializing" && <InitializingStep />}
      </DialogContent>
    </Dialog>
  );
}
