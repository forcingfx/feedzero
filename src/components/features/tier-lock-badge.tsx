import { Lock } from "lucide-react";
import { useFeatureGate } from "@/hooks/use-feature-gate.ts";
import { cn } from "@/lib/utils.ts";
import type { Feature } from "@/core/features/feature-gates.ts";

/**
 * Small inline "Personal" lock pill for a gated control (e.g. a toggle the
 * Free tier can't use). Renders nothing when the feature is available, so
 * a caller can drop it next to any control unconditionally. Clicking routes
 * to the upgrade affordance. Copy is matrix-derived via `useFeatureGate`.
 */
export function TierLockBadge({
  feature,
  className,
}: {
  feature: Feature;
  className?: string;
}) {
  const gate = useFeatureGate(feature);
  if (gate.enabled) return null;
  return (
    <button
      type="button"
      onClick={gate.promptUpgrade}
      title={`${gate.featureName} — ${gate.requiredTierLabel} feature`}
      data-testid={`tier-lock-${feature}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Lock className="size-3" />
      {gate.requiredTierLabel}
    </button>
  );
}
