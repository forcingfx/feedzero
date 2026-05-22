import { describe, it, expect } from "vitest";
import {
  TIER_MATRIX,
  TIER_ORDER,
  getEntry,
  getAvailability,
  getLimit,
  getRequiredTier,
  isGated,
  GATED_FEATURE_IDS,
  type FeatureId,
} from "@/core/features/tier-matrix";

describe("tier-matrix — canonical schema", () => {
  it("declares the three tiers in ascending order", () => {
    expect(TIER_ORDER).toEqual(["free", "personal", "pro"]);
  });

  it("every entry has all three tier slots defined", () => {
    for (const id of Object.keys(TIER_MATRIX) as FeatureId[]) {
      const entry = TIER_MATRIX[id];
      expect(entry.tiers.free).toBeDefined();
      expect(entry.tiers.personal).toBeDefined();
      expect(entry.tiers.pro).toBeDefined();
    }
  });

  it("every entry has id matching its key", () => {
    for (const id of Object.keys(TIER_MATRIX) as FeatureId[]) {
      expect(TIER_MATRIX[id].id).toBe(id);
    }
  });

  it("every entry has a non-empty name, description, and category", () => {
    for (const id of Object.keys(TIER_MATRIX) as FeatureId[]) {
      const entry = TIER_MATRIX[id];
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
    }
  });

  it("higher tiers never strip availability that a lower tier had", () => {
    // If a feature is available on free, it must be available on personal + pro.
    // If available on personal, it must be available on pro.
    for (const id of Object.keys(TIER_MATRIX) as FeatureId[]) {
      const t = TIER_MATRIX[id].tiers;
      if (t.free.available) expect(t.personal.available).toBe(true);
      if (t.personal.available) expect(t.pro.available).toBe(true);
    }
  });
});

describe("tier-matrix — feed-subscriptions (the headline quota)", () => {
  it("is available on every tier but capped at 50 on free", () => {
    const entry = getEntry("feed-subscriptions");
    expect(entry.tiers.free).toEqual({ available: true, limit: 50, limitUnit: "feeds" });
    expect(entry.tiers.personal).toEqual({ available: true, limit: "unlimited" });
    expect(entry.tiers.pro).toEqual({ available: true, limit: "unlimited" });
  });

  it("getLimit returns 50 on free, 'unlimited' on personal/pro", () => {
    expect(getLimit("feed-subscriptions", "free")).toBe(50);
    expect(getLimit("feed-subscriptions", "personal")).toBe("unlimited");
    expect(getLimit("feed-subscriptions", "pro")).toBe("unlimited");
  });
});

describe("tier-matrix — currently shipped gated features", () => {
  it("auto-organize is Personal+, shipped", () => {
    expect(getEntry("auto-organize").status).toBe("shipped");
    expect(getRequiredTier("auto-organize")).toBe("personal");
  });

  it("filters is Personal+, shipped", () => {
    expect(getEntry("filters").status).toBe("shipped");
    expect(getRequiredTier("filters")).toBe("personal");
  });

  it("bridges is Personal+, shipped", () => {
    expect(getEntry("bridges").status).toBe("shipped");
    expect(getRequiredTier("bridges")).toBe("personal");
  });

  it("offline-prefetch is Personal+, shipped", () => {
    expect(getEntry("offline-prefetch").status).toBe("shipped");
    expect(getRequiredTier("offline-prefetch")).toBe("personal");
  });

  it("signal is Personal+, shipped", () => {
    expect(getEntry("signal").status).toBe("shipped");
    expect(getRequiredTier("signal")).toBe("personal");
    expect(getEntry("signal").tiers.free.available).toBe(false);
    expect(getEntry("signal").tiers.personal.available).toBe(true);
    expect(getEntry("signal").tiers.pro.available).toBe(true);
  });
});

describe("tier-matrix — coming-soon features", () => {
  it("rules is Personal+, shipped (subsumed mute-keywords)", () => {
    expect(getEntry("rules").status).toBe("shipped");
    expect(getRequiredTier("rules")).toBe("personal");
  });

  it.each([
    "search",
    "authenticated-fetchers",
    "send-to-kindle",
    "themes-commercial",
  ] as const)("%s is Pro-tier, coming-soon", (id) => {
    const entry = getEntry(id);
    expect(entry.status).toBe("coming-soon");
    expect(getRequiredTier(id)).toBe("pro");
  });
});

describe("tier-matrix — always-free features (scope of canonical doc)", () => {
  it.each([
    "feed-discovery",
    "feed-refresh",
    "full-text-extraction",
    "opml-import-export",
    "keyboard-navigation",
    "global-feed",
    "starred-articles",
    "encrypted-local-storage",
    "cloud-sync",
  ] as const)("%s is available on every tier", (id) => {
    const entry = getEntry(id);
    expect(entry.tiers.free.available).toBe(true);
    expect(entry.tiers.personal.available).toBe(true);
    expect(entry.tiers.pro.available).toBe(true);
    expect(getRequiredTier(id)).toBe("free");
  });
});

describe("tier-matrix — derived helpers", () => {
  it("getAvailability returns the per-tier slot", () => {
    expect(getAvailability("auto-organize", "free")).toEqual({ available: false });
    expect(getAvailability("auto-organize", "personal")).toEqual({ available: true });
  });

  it("getLimit returns undefined for binary features (no limit set)", () => {
    expect(getLimit("auto-organize", "personal")).toBeUndefined();
    expect(getLimit("offline-prefetch", "personal")).toBeUndefined();
  });

  it("getLimit returns undefined when the feature is unavailable on that tier", () => {
    expect(getLimit("auto-organize", "free")).toBeUndefined();
  });

  it("isGated is true for features with at least one tier denied", () => {
    expect(isGated("auto-organize")).toBe(true);
    expect(isGated("offline-prefetch")).toBe(true);
    expect(isGated("rules")).toBe(true);
  });

  it("isGated is false for always-free features", () => {
    expect(isGated("feed-discovery")).toBe(false);
    expect(isGated("keyboard-navigation")).toBe(false);
    expect(isGated("cloud-sync")).toBe(false);
  });

  it("GATED_FEATURE_IDS matches isGated for every matrix entry (both directions)", () => {
    // Every listed gated id must actually be gated.
    for (const id of GATED_FEATURE_IDS) {
      expect(isGated(id)).toBe(true);
    }
    // Every matrix entry that is gated must be listed.
    const allIds = Object.keys(TIER_MATRIX) as FeatureId[];
    const gatedFromMatrix = allIds.filter((id) => isGated(id)).sort();
    const listed = [...GATED_FEATURE_IDS].sort();
    expect(listed).toEqual(gatedFromMatrix);
  });
});

describe("tier-matrix — back-compat with feature-gates.FEATURE_MAP", () => {
  it("every currently-gated id is present in the matrix", () => {
    const expected = [
      "auto-organize",
      "offline-prefetch",
      "filters",
      "rules",
      "search",
      "signal",
      "authenticated-fetchers",
      "send-to-kindle",
      "bridges",
      "themes-commercial",
    ] as const;
    for (const id of expected) {
      expect(TIER_MATRIX[id]).toBeDefined();
    }
  });
});
