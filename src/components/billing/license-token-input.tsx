/**
 * License token input — paste / auto-fill landing for the license token.
 *
 * Two flows feed this component:
 *  - Post-checkout: /billing/success passes `value={autoFilledToken}` once the
 *    Stripe webhook has issued the license and /api/license/retrieve returns
 *    it. The component populates the input from the prop and auto-fires
 *    verification — no Save click required.
 *  - Manual paste: a user with a token they exported elsewhere drops it into
 *    the input and clicks Save. We shape-validate locally then call
 *    /api/license/verify to confirm the server accepts it.
 *
 * If the server rejects (revoked, expired, forged) we unset the stored token
 * so we don't keep sending an invalid Bearer header on every sync request.
 *
 * Hidden by default — only renders when `paidTierVisible=true` (driven by
 * `import.meta.env.VITE_PAID_TIER_VISIBLE` at the call site).
 */

import { useEffect, useRef, useState } from "react";
import {
  setLicenseToken,
  clearLicenseToken,
  getLicenseToken,
} from "@/core/license/license-token-store";
import { useLicenseStore } from "@/stores/license-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LicenseTokenInputProps {
  paidTierVisible: boolean;
  /**
   * Optional caller-supplied token. When this transitions from empty to a
   * well-formed value, the component mirrors it into the input and auto-runs
   * the same verify path as a manual Save. Used by /billing/success after the
   * webhook hands us a freshly minted token.
   */
  value?: string;
}

interface VerifiedLicense {
  tier: string;
  customerId: string;
}

function isWellFormed(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.startsWith("fz_") && trimmed.split(".").length === 2;
}

export function LicenseTokenInput({
  paidTierVisible,
  value,
}: LicenseTokenInputProps) {
  const [token, setToken] = useState(() => value ?? getLicenseToken() ?? "");
  const [verified, setVerified] = useState<VerifiedLicense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoVerifiedFor = useRef<string | null>(null);

  // Mirror the caller-supplied token into local state. Guarded so we don't
  // clobber user input on every parent re-render — only meaningful changes
  // (non-empty + different from what we already have) overwrite. `token` is
  // deliberately excluded from deps: this effect responds to *external*
  // changes, not to typing in the field.
  useEffect(() => {
    if (value && value !== token) {
      setToken(value);
    }
  }, [value]);

  async function runVerify(candidate: string): Promise<void> {
    setBusy(true);
    setError(null);
    setVerified(null);

    const trimmed = candidate.trim();
    if (!isWellFormed(trimmed)) {
      setError("Invalid license token. Expected format: fz_<...>.<...>");
      setBusy(false);
      return;
    }

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
      setVerified({
        tier: body.license.tier,
        customerId: body.license.customerId,
      });
      void useLicenseStore.getState().refresh();
    } catch (e) {
      clearLicenseToken();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Auto-verify when `value` arrives from the parent (post-checkout flow).
  // Guarded by `autoVerifiedFor` so re-renders of the parent don't re-fire.
  useEffect(() => {
    if (!value || !isWellFormed(value)) return;
    if (autoVerifiedFor.current === value) return;
    autoVerifiedFor.current = value;
    void runVerify(value);
  }, [value]);

  if (!paidTierVisible) return null;

  async function onSave() {
    await runVerify(token);
  }

  function onClear() {
    clearLicenseToken();
    setToken("");
    setVerified(null);
    setError(null);
    autoVerifiedFor.current = null;
    void useLicenseStore.getState().refresh();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="license-token-input">License token</Label>
        <Input
          id="license-token-input"
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="fz_..."
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClear} disabled={busy}>
          Clear
        </Button>
        <Button type="button" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {verified && (
        <Alert>
          <AlertDescription role="status" aria-live="polite">
            Active: {verified.tier} (customer {verified.customerId})
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription role="alert" aria-live="polite">
            {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
