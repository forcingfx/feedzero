/**
 * Reusable license-token paste form.
 *
 * Used in two places:
 *   - `<DeviceSetupWizard>` license stage — fresh-instance login.
 *   - Settings → Recovery tab — already-logged-in user re-pasting a token
 *     they emailed themselves (or activating an additional device after
 *     receiving a token via /billing/recover).
 *
 * POSTs to /api/license/verify; on success calls `setLicenseToken` and
 * fires the parent's `onSuccess` callback. The parent decides what
 * happens next (advance wizard stage, show toast, refresh tier).
 */
import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setLicenseToken,
  clearLicenseToken,
} from "@/core/license/license-token-store";
import { useLicenseStore } from "@/stores/license-store";

interface LicenseTokenPasteFormProps {
  onSuccess?: () => void;
  inputId?: string;
  /** Optional override for the primary button label. Defaults to "Continue". */
  submitLabel?: string;
}

function isWellFormedToken(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.startsWith("fz_") && trimmed.split(".").length === 2;
}

export function LicenseTokenPasteForm({
  onSuccess,
  inputId = "license-token",
  submitLabel = "Continue",
}: LicenseTokenPasteFormProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleVerify() {
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
      setToken("");
      onSuccess?.();
    } catch (e) {
      clearLicenseToken();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={inputId}>License token</Label>
        <Input
          id={inputId}
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

      <Button onClick={handleVerify} disabled={busy || !token.trim()}>
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <KeyRound className="mr-2 size-4" />
        )}
        {submitLabel}
      </Button>
    </div>
  );
}
