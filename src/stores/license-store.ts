/**
 * License tier — single source of truth for the React tree.
 *
 * Other components (SubscriptionTab tier badge, useFeatureGate) subscribe here
 * instead of each performing their own /api/license/verify round trip.
 *
 * Refresh runs in two phases so the UI feels instant:
 *
 *   1. Synchronous local decode — read the stored token, decode the payload
 *      (no HMAC check — the server is the source of truth, see ADR 012),
 *      set `tier` immediately. A user with a Personal token does not see a
 *      "Free" flash on every page load.
 *
 *   2. Asynchronous server verify — POST /api/license/verify. If the server
 *      rejects (revoked, expired, forged), clear the stored token and reset
 *      tier to "free". Network errors do NOT clear the token (offline users
 *      keep their paid status).
 *
 * Cross-tab: a `storage` event for LICENSE_TOKEN_STORAGE_KEY triggers a
 * fresh refresh, so pasting a token in one tab updates the tier in others.
 */

import { create } from "zustand";
import {
  getLicenseToken,
  clearLicenseToken,
  LICENSE_TOKEN_STORAGE_KEY,
} from "@/core/license/license-token-store";
import { decodeLicensePayload } from "@/core/license/format";
import { base64UrlDecodeToString } from "@/core/license/crypto";
import type { Tier } from "@/core/features/feature-gates";

interface LicenseState {
  tier: Tier;
  verifying: boolean;
  /**
   * Epoch ms of the last *definitive* tier resolution — a no-token check,
   * a server confirmation (200), or an explicit server rejection (4xx).
   * Transient failures (5xx, network) deliberately leave this untouched so
   * the focus-when-stale trigger in useLicenseRefresh retries them sooner.
   */
  lastCheckedAt: number | null;
  refresh: () => Promise<void>;
  /** Direct setter used by tests and explicit overrides. */
  setTier: (tier: Tier) => void;
}

const TOKEN_PREFIX = "fz_";

function decodeTierFromToken(token: string): Tier {
  if (!token.startsWith(TOKEN_PREFIX)) return "free";
  const [encodedPayload] = token.slice(TOKEN_PREFIX.length).split(".");
  if (!encodedPayload) return "free";
  const payload = base64UrlDecodeToString(encodedPayload);
  if (!payload) return "free";
  const result = decodeLicensePayload(payload);
  return result.ok ? result.value.tier : "free";
}

export const useLicenseStore = create<LicenseState>((set) => ({
  tier: "free",
  verifying: false,
  lastCheckedAt: null,

  setTier: (tier) => set({ tier }),

  refresh: async () => {
    const token = getLicenseToken();
    if (!token) {
      set({ tier: "free", verifying: false, lastCheckedAt: Date.now() });
      return;
    }

    const localTier = decodeTierFromToken(token);
    set({ tier: localTier, verifying: true });

    try {
      const res = await fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        // 5xx = transient (Vercel hiccup, Upstash blip). DO NOT clear the
        // token — a paying customer would see their tier silently flip to
        // Free and panic. Keep the locally-decoded tier; the next refresh
        // (page load, cross-tab event) will retry. Leave lastCheckedAt
        // stale so the focus-when-stale trigger retries promptly.
        // 4xx = the server explicitly rejected this token (revoked,
        // expired, forged). Clear so we don't keep sending an invalid
        // Bearer on every sync request.
        if (res.status >= 500) {
          set({ verifying: false });
          return;
        }
        clearLicenseToken();
        set({ tier: "free", verifying: false, lastCheckedAt: Date.now() });
        return;
      }
      const serverTier = body.license?.tier;
      if (isTier(serverTier)) {
        set({ tier: serverTier, verifying: false, lastCheckedAt: Date.now() });
      } else {
        set({ verifying: false, lastCheckedAt: Date.now() });
      }
    } catch {
      // Network failure: keep the locally-decoded tier. An offline user
      // should not lose paid status mid-session. Leave lastCheckedAt stale
      // so the next focus retries instead of waiting out the full day.
      set({ verifying: false });
    }
  },
}));

function isTier(value: unknown): value is Tier {
  return value === "free" || value === "personal" || value === "pro";
}

// Cross-tab synchronization. Registered once at module load. The listener
// itself is cheap — we ignore unrelated keys — and lives for the app
// lifetime, so it doesn't need an explicit removal path.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== LICENSE_TOKEN_STORAGE_KEY) return;
    void useLicenseStore.getState().refresh();
  });
}
