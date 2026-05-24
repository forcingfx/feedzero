import { describe, it, expect } from "vitest";
import {
  featureName,
  requiredTierLabel,
  gateDescription,
  gateToast,
  GATED_FEATURE_IDS,
  TIER_MATRIX,
  getRequiredTier,
} from "@/core/features/tier-matrix";
import {
  featureName as fnFromGates,
} from "@/core/features/feature-gates";

const CAP: Record<string, string> = { free: "Free", personal: "Personal", pro: "Pro" };

describe("gate messaging — derived entirely from the tier matrix", () => {
  it("featureName mirrors the matrix display name for every gated feature", () => {
    for (const id of GATED_FEATURE_IDS) {
      expect(featureName(id)).toBe(TIER_MATRIX[id].name);
    }
  });

  it("requiredTierLabel is the capitalized lowest-available tier", () => {
    for (const id of GATED_FEATURE_IDS) {
      expect(requiredTierLabel(id)).toBe(CAP[getRequiredTier(id)]);
    }
  });

  it("gateDescription mirrors the matrix description", () => {
    for (const id of GATED_FEATURE_IDS) {
      expect(gateDescription(id)).toBe(TIER_MATRIX[id].description);
    }
  });

  it("gateToast composes name + required tier so a matrix edit flows through", () => {
    for (const id of GATED_FEATURE_IDS) {
      const toast = gateToast(id);
      // The toast must reference both the current matrix name and the
      // current required tier — change either in the matrix and the copy
      // updates with no string edits anywhere in the app.
      expect(toast).toContain(featureName(id));
      expect(toast).toContain(requiredTierLabel(id));
      expect(toast).toBe(
        `Subscribe to ${requiredTierLabel(id)} to unlock ${featureName(id)}.`,
      );
    }
  });

  it("feature-gates re-exports the same messaging helpers (single source)", () => {
    for (const id of GATED_FEATURE_IDS) {
      expect(fnFromGates(id)).toBe(featureName(id));
    }
  });

  it("signal-briefings reads 'Subscribe to Personal to unlock Signal Briefings.'", () => {
    expect(featureName("signal-briefings")).toBe("Signal Briefings");
    expect(requiredTierLabel("signal-briefings")).toBe("Personal");
    expect(gateToast("signal-briefings")).toBe(
      "Subscribe to Personal to unlock Signal Briefings.",
    );
  });
});
