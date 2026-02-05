import { useState, useRef, useEffect } from "react";
import { Smartphone, Lock, AlertTriangle, KeyRound, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";

type StorageOption = "local" | "sync" | "recovery" | null;

export function StorageChoiceStep() {
  const [selected, setSelected] = useState<StorageOption>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);
  const chooseStorageMode = useOnboardingStore((s) => s.chooseStorageMode);
  const setStep = useOnboardingStore((s) => s.setStep);

  // Focus first option on mount so Tab works immediately
  useEffect(() => {
    firstOptionRef.current?.focus();
  }, []);

  const handleContinue = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (selected === "recovery") {
      setStep("recovery");
    } else if (selected) {
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

      <form onSubmit={handleContinue}>
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
              ref={firstOptionRef}
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

          {/* Recovery option */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
              selected === "recovery"
                ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-300"
                : "border-border hover:border-blue-200 hover:bg-blue-50/30"
            }`}
          >
            <input
              type="radio"
              name="storage-option"
              value="recovery"
              checked={selected === "recovery"}
              onChange={() => setSelected("recovery")}
              className="sr-only"
              aria-label="I already have a passphrase"
            />
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <KeyRound className="size-5" />
            </div>
            <div className="flex-1">
              <span className="font-medium">I already have a passphrase</span>
              <p className="text-xs text-muted-foreground">
                Restore from another device
              </p>
            </div>
            <div
              className={`mt-1 size-4 shrink-0 rounded-full border-2 ${
                selected === "recovery"
                  ? "border-blue-500 bg-blue-500"
                  : "border-muted-foreground/30"
              }`}
            >
              {selected === "recovery" && (
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

        {/* Recovery info - only shown when recovery is selected */}
        {selected === "recovery" && (
          <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-700">
            <Info className="size-4 shrink-0 mt-0.5" />
            <span>
              Enter your 4-word secret key to restore your feeds from another
              device.
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-4">
          <Kbd>Tab</Kbd> navigate options
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="submit"
            size="lg"
            disabled={!selected}
            className="w-full"
          >
            Continue
            <Kbd className="ml-2">Enter</Kbd>
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
