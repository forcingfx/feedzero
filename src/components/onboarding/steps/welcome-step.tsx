import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";

export function WelcomeStep() {
  const setStep = useOnboardingStore((s) => s.setStep);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Welcome to FeedZero</DialogTitle>
        <DialogDescription>Your feeds, your privacy.</DialogDescription>
      </DialogHeader>

      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>No tracking or analytics</li>
        <li>Everything encrypted locally</li>
        <li>No account required</li>
      </ul>

      <DialogFooter>
        <Button onClick={() => setStep("storage-choice")}>Get Started</Button>
      </DialogFooter>
    </>
  );
}
