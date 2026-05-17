/**
 * <DeviceSetupWizard> — "log in to a fresh instance" with an existing
 * FeedZero account.
 *
 * Two stages:
 *   1. License entry — paste an `fz_…` token (or recover via email link).
 *      POST /api/license/verify validates server-side; on success we
 *      apply the token and advance.
 *   2. Optional sync restoration — if the user also uses cloud sync,
 *      they enter their passphrase to decrypt their vault. Skip is
 *      always available (license is already applied).
 *
 * Why a wizard and not two separate dialogs:
 *   The license token and the sync passphrase are TWO different
 *   credentials by design (the server can recover the license; it
 *   cannot recover the passphrase — that's the E2E privacy guarantee).
 *   But the user wants ONE "log me into FeedZero" ceremony. The wizard
 *   makes the two-step nature explicit without making the user navigate
 *   between disjoint screens.
 *
 * Mounted at the app level (alongside <SettingsDialog>); opened via
 * `openLogin()` from anywhere.
 */
import { useState } from "react";
import { Loader2, KeyRound, CloudDownload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setLicenseToken,
  clearLicenseToken,
} from "@/core/license/license-token-store";
import { useLicenseStore } from "@/stores/license-store";
import { useSyncStore } from "@/stores/sync-store";
import { useLoginStore } from "@/stores/login-store";
import { closeLogin } from "@/lib/open-login";

type Stage = "license" | "sync-prompt" | "syncing" | "done";

function isWellFormedToken(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.startsWith("fz_") && trimmed.split(".").length === 2;
}

export function DeviceSetupWizard() {
  const open = useLoginStore((s) => s.open);
  const [stage, setStage] = useState<Stage>("license");
  const [token, setToken] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetAndClose() {
    setStage("license");
    setToken("");
    setPassphrase("");
    setError(null);
    setBusy(false);
    closeLogin();
  }

  async function handleVerifyLicense() {
    setError(null);
    const trimmed = token.trim();
    if (!isWellFormedToken(trimmed)) {
      setError("Invalid license token. Expected format: fz_<...>.<...>");
      return;
    }
    setBusy(true);
    setLicenseToken(trimmed);
    try {
      const res = await fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        clearLicenseToken();
        setError(body.error ?? `License verification failed (${res.status})`);
        return;
      }
      void useLicenseStore.getState().refresh();
      setStage("sync-prompt");
    } catch (e) {
      clearLicenseToken();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreSync() {
    if (!passphrase.trim()) {
      setError("Enter your sync passphrase, or skip this step.");
      return;
    }
    setError(null);
    setBusy(true);
    setStage("syncing");
    const result = await useSyncStore
      .getState()
      .switchToExistingCloud(passphrase, "replace");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setStage("sync-prompt");
      return;
    }
    setStage("done");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        {stage === "license" && (
          <>
            <DialogHeader>
              <DialogTitle>Log in</DialogTitle>
              <DialogDescription>
                Paste the license token you saved earlier, or recover it by
                email.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="login-token">License token</Label>
              <Input
                id="login-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="fz_…"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Don't have it handy?{" "}
                <a
                  href="/billing/recover"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline"
                >
                  Recover by email →
                </a>
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button onClick={handleVerifyLicense} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 size-4" />
                )}
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === "sync-prompt" && (
          <>
            <DialogHeader>
              <DialogTitle>Restore your synced data?</DialogTitle>
              <DialogDescription>
                If you also use FeedZero's end-to-end encrypted cloud sync on
                another device, enter your sync passphrase to decrypt your
                feeds here. Otherwise, skip — you can always set up sync
                later from Settings.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="login-passphrase">Sync passphrase</Label>
              <Input
                id="login-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={resetAndClose}>
                Skip
              </Button>
              <Button onClick={handleRestoreSync} disabled={busy}>
                <CloudDownload className="mr-2 size-4" />
                Restore
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === "syncing" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            Decrypting your synced data…
          </div>
        )}

        {stage === "done" && (
          <>
            <DialogHeader>
              <DialogTitle>You're in</DialogTitle>
              <DialogDescription>
                Your license is active and your synced feeds are restored.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={resetAndClose}>Open my feeds</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
