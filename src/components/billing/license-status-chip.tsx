/**
 * License status chip — visible indicator of the user's tier.
 *
 * On mount:
 *   1. Read the stored license token from localStorage.
 *   2. If none, render "Free" immediately — no network round-trip.
 *   3. If present, POST to /api/license/verify to confirm it is still
 *      cryptographically valid AND not revoked. Render the server-verified
 *      tier on success; fall back to "Free" on any failure.
 *
 * Why fall back to "Free" instead of showing an error:
 *   - A network blip shouldn't paint the user's paid status as broken UI.
 *   - A revoked or expired token is functionally "Free" — sync stops
 *     working at the same moment. Showing "Free" matches reality.
 *   - The Subscribe/Manage UI in Settings is where the user discovers the
 *     full status; this chip is a quick visual cue, not a diagnostic.
 */

import { useEffect, useState } from "react";
import { getLicenseToken } from "@/core/license/license-token-store";

type Tier = "free" | "personal" | "pro";

export function LicenseStatusChip() {
  const [tier, setTier] = useState<Tier>("free");

  useEffect(() => {
    const token = getLicenseToken();
    if (!token) {
      setTier("free");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/license/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body.ok && isTier(body.license?.tier)) {
          setTier(body.license.tier);
        } else {
          setTier("free");
        }
      } catch {
        if (!cancelled) setTier("free");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <span className={chipClasses(tier)} aria-live="polite">
      {label(tier)}
    </span>
  );
}

function isTier(value: unknown): value is Tier {
  return value === "free" || value === "personal" || value === "pro";
}

function label(tier: Tier): string {
  if (tier === "personal") return "Personal";
  if (tier === "pro") return "Pro";
  return "Free";
}

function chipClasses(tier: Tier): string {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border";
  if (tier === "personal") {
    return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
  }
  if (tier === "pro") {
    return `${base} bg-indigo-50 text-indigo-700 border-indigo-200`;
  }
  return `${base} bg-slate-50 text-slate-600 border-slate-200`;
}
