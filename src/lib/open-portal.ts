/**
 * Shared helper for opening the Stripe Customer Portal session.
 *
 * Two callers need this:
 *   - SubscriptionTab "Manage subscription" button
 *   - DataSyncSection's Danger Zone gate for paid users
 *
 * Returns `{ ok: true }` on redirect-initiated success, or an error string.
 * The actual redirect happens here via `window.location.href` — callers
 * just await and surface errors.
 */
import { getLicenseToken } from "@/core/license/license-token-store";

export interface OpenPortalResult {
  ok: boolean;
  error?: string;
}

export async function openPortal(): Promise<OpenPortalResult> {
  const token = getLicenseToken();
  if (!token) return { ok: false, error: "No license token available" };
  try {
    const res = await fetch("/api/license/portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ returnUrl: window.location.href }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error ?? `Portal failed (${res.status})` };
    }
    window.location.href = body.url;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
