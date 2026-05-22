import { Sparkles } from "lucide-react";
import { useFeatureGate } from "@/hooks/use-feature-gate.ts";
import { Button } from "@/components/ui/button.tsx";
import type { Feature } from "@/core/features/feature-gates.ts";

/**
 * Full-page upgrade affordance for a gated feature surface (e.g. /signal).
 *
 * All copy is derived from the tier matrix via `useFeatureGate`, so moving
 * the feature between tiers or renaming it in the matrix flows through
 * here with no edits. Render this when `useFeatureGate(feature)` reports
 * `!enabled && reason === "tier-locked"`.
 */
export function UpgradeSplash({ feature }: { feature: Feature }) {
  const gate = useFeatureGate(feature);
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Sparkles className="size-10 text-primary" />
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {gate.requiredTierLabel} feature
        </p>
        <h1 className="text-2xl font-semibold">Unlock {gate.featureName}</h1>
        <p className="text-sm text-muted-foreground">{gate.description}</p>
      </div>
      <Button onClick={gate.promptUpgrade} className="w-full" size="lg">
        Upgrade to {gate.requiredTierLabel}
      </Button>
    </div>
  );
}
