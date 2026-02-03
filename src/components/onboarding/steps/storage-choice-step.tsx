import { useState } from "react";
import { Smartphone, Lock, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";

type StorageOption = "local" | "sync" | null;

export function StorageChoiceStep() {
  const [selected, setSelected] = useState<StorageOption>(null);
  const chooseStorageMode = useOnboardingStore((s) => s.chooseStorageMode);
  const setStep = useOnboardingStore((s) => s.setStep);

  const handleContinue = () => {
    if (selected) {
      chooseStorageMode(selected);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Where should we store your data?</DialogTitle>
        <DialogDescription>
          Choose how you want to manage your feeds and reading data.
        </DialogDescription>
      </DialogHeader>

      <div
        className="flex flex-col gap-3"
        role="radiogroup"
        aria-label="Storage options"
      >
        {/* Local only option */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
            selected === "local"
              ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-300"
              : "border-border hover:border-amber-200 hover:bg-amber-50/30"
          }`}
        >
          <input
            type="radio"
            name="storage-option"
            value="local"
            checked={selected === "local"}
            onChange={() => setSelected("local")}
            className="sr-only"
            aria-label="Local only"
          />
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Smartphone className="size-5" />
          </div>
          <div className="flex-1">
            <span className="font-medium">Local only</span>
            <p className="text-xs text-muted-foreground">
              Quick start, single device
            </p>
          </div>
          <div
            className={`mt-1 size-4 shrink-0 rounded-full border-2 ${
              selected === "local"
                ? "border-amber-500 bg-amber-500"
                : "border-muted-foreground/30"
            }`}
          >
            {selected === "local" && (
              <div className="flex h-full items-center justify-center">
                <div className="size-1.5 rounded-full bg-white" />
              </div>
            )}
          </div>
        </label>

        {/* Sync option */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
            selected === "sync"
              ? "border-green-300 bg-green-50/50 ring-1 ring-green-300"
              : "border-border hover:border-green-200 hover:bg-green-50/30"
          }`}
        >
          <input
            type="radio"
            name="storage-option"
            value="sync"
            checked={selected === "sync"}
            onChange={() => setSelected("sync")}
            className="sr-only"
            aria-label="Sync across devices"
          />
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Lock className="size-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Sync across devices</span>
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-700">
                Secure
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Zero-knowledge encryption · No account needed
            </p>
          </div>
          <div
            className={`mt-1 size-4 shrink-0 rounded-full border-2 ${
              selected === "sync"
                ? "border-green-500 bg-green-500"
                : "border-muted-foreground/30"
            }`}
          >
            {selected === "sync" && (
              <div className="flex h-full items-center justify-center">
                <div className="size-1.5 rounded-full bg-white" />
              </div>
            )}
          </div>
        </label>
      </div>

      {/* Browser warning - only shown when local is selected */}
      {selected === "local" && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            Your data lives in this browser. Clearing browser data or cookies
            will delete your feeds permanently.
          </span>
        </div>
      )}

      <DialogFooter className="flex-col gap-3 sm:flex-col">
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={!selected}
          className="w-full"
        >
          Continue
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStep("recovery")}
          className="text-muted-foreground"
        >
          <KeyRound className="mr-2 size-4" />I have a recovery key
        </Button>
      </DialogFooter>
    </>
  );
}
