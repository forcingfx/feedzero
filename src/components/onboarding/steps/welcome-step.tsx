import { Plus, BookOpen, ShieldCheck } from "lucide-react";
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

const FEATURES = [
  {
    number: 1,
    icon: Plus,
    text: "Add your favorite RSS feeds",
  },
  {
    number: 2,
    icon: BookOpen,
    text: "Read distraction-free, no algorithms",
  },
  {
    number: 3,
    icon: ShieldCheck,
    text: "What you read is your business. Fully end-to-end encrypted.",
  },
] as const;

export function WelcomeStep() {
  const setStep = useOnboardingStore((s) => s.setStep);

  return (
    <>
      <div className="flex justify-center py-4">
        <BrandMark className="size-16" />
      </div>

      <DialogHeader className="text-center sm:text-center">
        <DialogTitle className="text-xl">Welcome to FeedZero</DialogTitle>
        <DialogDescription>Your feeds, your privacy.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {FEATURES.map(({ number, icon: Icon, text }) => (
          <div key={number} className="flex items-center gap-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {number}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Icon className="size-4 text-muted-foreground" />
              <span>{text}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
        <strong>Alpha:</strong> FeedZero is in early development. Your data is
        stored locally and encrypted, but may be lost during updates. Cloud
        sync is experimental.
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Coming from Pocket, Omnivore, or TT-RSS? Import your export after
        setup.
      </p>

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
    </>
  );
}
