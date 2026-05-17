/**
 * <SetupWizard> — single-screen "turn on fresh cloud sync" flow.
 *
 * One screen: the auto-generated passphrase is displayed with copy +
 * "I've saved my secret key" checkbox. Clicking Enable derives the
 * keys, encrypts the local data, and pushes it. The previous two-step
 * (display + confirm-by-retype) was removed — the checkbox is the
 * contract, and re-typing a 4-word EFF passphrase didn't catch typos in
 * practice (people copy-pasted from the same place).
 *
 * If the user closes the dialog before clicking Enable, no keys are
 * persisted; the dialog can be reopened with a fresh passphrase.
 */
import { useCallback, useState } from "react";
import { Copy, Check, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type SetupStep = "passphrase" | "syncing" | "done";

interface SetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passphrase: string;
  onEnable: () => Promise<void>;
}

export function SetupWizard({
  open,
  onOpenChange,
  passphrase,
  onEnable,
}: SetupWizardProps) {
  const [step, setStep] = useState<SetupStep>("passphrase");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [passphrase]);

  async function handleEnable() {
    setStep("syncing");
    await onEnable();
    setStep("done");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={step !== "syncing"}>
        {step === "passphrase" && (
          <>
            <DialogHeader>
              <DialogTitle>Your secret key</DialogTitle>
              <DialogDescription>
                This key is the only way to access your synced data. Save it
                somewhere safe — FeedZero cannot recover it if you lose it.
              </DialogDescription>
            </DialogHeader>

            <div className="relative rounded-md border bg-muted p-4 overflow-x-auto">
              <p className="text-center font-mono text-lg tracking-wide select-all break-all">
                {passphrase}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 size-7"
                onClick={handleCopy}
                title="Copy to clipboard"
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
              />
              I&apos;ve saved my secret key
            </label>

            <DialogFooter>
              <Button onClick={handleEnable} disabled={!saved}>
                Enable sync
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "syncing" && (
          <>
            <DialogHeader>
              <DialogTitle>Setting up sync</DialogTitle>
              <DialogDescription>
                Encrypting and syncing your data...
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle>Sync is set up</DialogTitle>
              <DialogDescription>
                Your data is now encrypted and synced. Enter your secret key
                on any device to access your feeds.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
                <ShieldCheck className="size-8 text-green-600" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
