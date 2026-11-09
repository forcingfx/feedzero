import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { BrandMark } from "@/components/brand/brand-mark";

/**
 * One headline, one line, one action (audit 2026-Q4, finding 6). The
 * three-step feature list, the alpha banner and the import hint each have
 * a home elsewhere: the app itself, a muted footnote, and Explore.
 */
export function WelcomeStep() {
  const setStep = useOnboardingStore((s) => s.setStep);

  return (
    <>
      <div className="flex justify-center py-4">
        <BrandMark className="size-16" />
      </div>

      <DialogHeader className="text-center sm:text-center">
        <DialogTitle className="text-xl">Welcome to FeedZero</DialogTitle>
        <DialogDescription>
          Fast, private reading. Your feeds stay on this device unless you
          turn on sync.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter className="sm:justify-center sm:flex-col sm:gap-2">
        <Button size="lg" onClick={() => setStep("storage-choice")} autoFocus>
          Get Started
          <Kbd className="ml-2">Enter</Kbd>
        </Button>
        <button
          type="button"
          onClick={() => setStep("recovery")}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Already have a FeedZero passphrase? Restore from cloud
        </button>
      </DialogFooter>

      <p className="text-center text-xs text-muted-foreground">
        Alpha software. Keep a backup: cloud sync or an OPML export.
      </p>
    </>
  );
}
