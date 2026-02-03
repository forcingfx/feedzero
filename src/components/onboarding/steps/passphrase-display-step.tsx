import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/stores/onboarding-store";

export function PassphraseDisplayStep() {
  const passphrase = useOnboardingStore((s) => s.generatedPassphrase);
  const setStep = useOnboardingStore((s) => s.setStep);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [passphrase]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Your Secret Key</DialogTitle>
        <DialogDescription>
          Save this somewhere safe. It's the only way to access your synced
          data.
        </DialogDescription>
      </DialogHeader>

      <div className="relative rounded-md border bg-muted p-4">
        <p className="text-center font-mono text-lg tracking-wide select-all">
          {passphrase}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-7"
          onClick={handleCopy}
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={saved}
          onCheckedChange={(v) => setSaved(v === true)}
          aria-label="I've saved my secret key"
        />
        I've saved my secret key
      </label>

      <DialogFooter>
        <Button
          onClick={() => setStep("passphrase-confirm")}
          disabled={!saved}
        >
          Continue
        </Button>
      </DialogFooter>
    </>
  );
}
