/**
 * License token input — paste-from-email landing pad.
 *
 * After Stripe Checkout, the customer receives an email with their
 * `fz_<...>.<...>` license token. They paste it here. We:
 *  1. Shape-validate (refuse obviously-wrong inputs locally — fast feedback)
 *  2. Persist to localStorage
 *  3. Call /api/license/verify to confirm the server accepts it
 *  4. If server rejects (revoked, expired, forged): unset the storage so we
 *     don't keep sending an invalid Bearer header on every sync request.
 *
 * Hidden by default — only renders when `paidTierVisible=true` (driven by
 * `import.meta.env.VITE_PAID_TIER_VISIBLE` at the call site).
 */

import { useState } from "react";
import {
  setLicenseToken,
  clearLicenseToken,
  getLicenseToken,
} from "@/core/license/license-token-store";
import { useLicenseStore } from "@/stores/license-store";

export interface LicenseTokenInputProps {
  paidTierVisible: boolean;
}

interface VerifiedLicense {
  tier: string;
  customerId: string;
}

export function LicenseTokenInput({ paidTierVisible }: LicenseTokenInputProps) {
  const [token, setToken] = useState(() => getLicenseToken() ?? "");
  const [verified, setVerified] = useState<VerifiedLicense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!paidTierVisible) return null;

  async function onSave() {
    setBusy(true);
    setError(null);
    setVerified(null);

    // Local shape-check first — fast feedback before network round-trip.
    const trimmed = token.trim();
    if (
      !trimmed.startsWith("fz_") ||
      trimmed.split(".").length !== 2
    ) {
      setError(
        'Invalid license token. Expected format: fz_<...>.<...>',
      );
      setBusy(false);
      return;
    }

    // Persist optimistically — verify next.
    setLicenseToken(trimmed);

    try {
      const res = await fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        // Server rejected — un-persist so we don't send a bad Bearer forever.
        clearLicenseToken();
        setError(body.error ?? `License verification failed (${res.status})`);
        return;
      }
      setVerified({
        tier: body.license.tier,
        customerId: body.license.customerId,
      });
      // Wake the centralized license store so the sidebar chip and any
      // gated UI update without a page reload.
      void useLicenseStore.getState().refresh();
    } catch (e) {
      clearLicenseToken();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onClear() {
    clearLicenseToken();
    setToken("");
    setVerified(null);
    setError(null);
    void useLicenseStore.getState().refresh();
  }

  return (
    <div>
      <label htmlFor="license-token-input">License token</label>
      <input
        id="license-token-input"
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="fz_..."
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" onClick={onSave} disabled={busy}>
        Save
      </button>
      <button type="button" onClick={onClear} disabled={busy}>
        Clear
      </button>
      {verified && (
        <div role="status" aria-live="polite">
          Active: {verified.tier} (customer {verified.customerId})
        </div>
      )}
      {error && (
        <div role="alert" aria-live="polite">
          {error}
        </div>
      )}
    </div>
  );
}
