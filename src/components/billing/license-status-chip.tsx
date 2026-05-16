/**
 * License status chip — visible indicator of the user's tier.
 *
 * Reads from `useLicenseStore`, which is refreshed once at app startup
 * (and on cross-tab storage events). This component is presentation only:
 * the store decides what tier to show, the chip just paints it.
 */

import { useLicenseStore } from "@/stores/license-store";
import type { Tier } from "@/core/features/feature-gates";

export function LicenseStatusChip() {
  const tier = useLicenseStore((s) => s.tier);
  return (
    <span className={chipClasses(tier)} aria-live="polite">
      {label(tier)}
    </span>
  );
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
