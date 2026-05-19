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
  it("is available on every tier but capped at 25 on free", () => {
    const entry = getEntry("feed-subscriptions");
    expect(entry.tiers.free).toEqual({ available: true, limit: 25, limitUnit: "feeds" });
    expect(entry.tiers.personal).toEqual({ available: true, limit: "unlimited" });
    expect(entry.tiers.pro).toEqual({ available: true, limit: "unlimited" });
  });

  it("getLimit returns 25 on free, 'unlimited' on personal/pro", () => {
    expect(getLimit("feed-subscriptions", "free")).toBe(25);
    expect(getLimit("feed-subscriptions", "personal")).toBe("unlimited");
    expect(getLimit("feed-subscriptions", "pro")).toBe("unlimited");
  });
});

describe("tier-matrix — currently shipped gated features", () => {
  it("cloud-sync is Personal+, shipped", () => {
    const entry = getEntry("cloud-sync");
    expect(entry.status).toBe("shipped");
    expect(entry.tiers.free.available).toBe(false);
    expect(entry.tiers.personal.available).toBe(true);
    expect(entry.tiers.pro.available).toBe(true);
  });

  it("auto-organize is Personal+, shipped", () => {
    expect(getEntry("auto-organize").status).toBe("shipped");
    expect(getRequiredTier("auto-organize")).toBe("personal");
  });

  it("filters is Personal+, shipped", () => {
    expect(getEntry("filters").status).toBe("shipped");
    expect(getRequiredTier("filters")).toBe("personal");
  });

  it("offline-prefetch is Personal+, shipped", () => {
    expect(getEntry("offline-prefetch").status).toBe("shipped");
    expect(getRequiredTier("offline-prefetch")).toBe("personal");
  });
});

describe("tier-matrix — coming-soon features", () => {
  it("mute-keywords is Personal+, coming-soon", () => {
    expect(getEntry("mute-keywords").status).toBe("coming-soon");
    expect(getRequiredTier("mute-keywords")).toBe("personal");
  });

  it.each([
    "search",
    "ai-signal",
    "authenticated-fetchers",
    "send-to-kindle",
    "bridges",
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
    expect(getAvailability("cloud-sync", "free")).toEqual({ available: false });
    expect(getAvailability("cloud-sync", "personal")).toEqual({ available: true });
  });

  it("getLimit returns undefined for binary features (no limit set)", () => {
    expect(getLimit("cloud-sync", "personal")).toBeUndefined();
    expect(getLimit("auto-organize", "personal")).toBeUndefined();
  });

  it("getLimit returns undefined when the feature is unavailable on that tier", () => {
    expect(getLimit("cloud-sync", "free")).toBeUndefined();
  });

  it("isGated is true for features with at least one tier denied", () => {
    expect(isGated("cloud-sync")).toBe(true);
    expect(isGated("auto-organize")).toBe(true);
    expect(isGated("mute-keywords")).toBe(true);
  });

  it("isGated is false for always-free features", () => {
    expect(isGated("feed-discovery")).toBe(false);
    expect(isGated("keyboard-navigation")).toBe(false);
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
      "cloud-sync",
      "auto-organize",
      "offline-prefetch",
      "filters",
      "mute-keywords",
      "search",
      "ai-signal",
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
