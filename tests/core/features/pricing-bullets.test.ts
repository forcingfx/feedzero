import { describe, it, expect } from "vitest";
import {
  pricingBullets,
  getMarketing,
  getEntry,
  GATED_FEATURE_IDS,
  TIER_MATRIX,
  getRequiredTier,
  TIER_ORDER,
  type FeatureId,
} from "@/core/features/tier-matrix";

describe("pricingBullets — pricing cards derived from the matrix", () => {
  it("places every marketed feature on exactly the card matching its unlock tier", () => {
    const marketed = (Object.keys(TIER_MATRIX) as FeatureId[]).filter(
      (id) => getMarketing(id) !== undefined,
    );
    for (const id of marketed) {
      const home = getRequiredTier(id);
      for (const tier of TIER_ORDER) {
        const onCard = pricingBullets(tier).some((b) => b.id === id);
        expect(onCard).toBe(tier === home);
      }
    }
  });

  it("returns bullets in ascending marketing rank", () => {
    for (const tier of TIER_ORDER) {
      const ranks = pricingBullets(tier).map(
        (b) => getMarketing(b.id)!.rank,
      );
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    }
  });

  it("uses unique marketing ranks so ordering is deterministic", () => {
    const ranks = (Object.keys(TIER_MATRIX) as FeatureId[])
      .map((id) => getMarketing(id)?.rank)
      .filter((r): r is number => r !== undefined);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("each bullet's blurb is the matrix marketing copy (single source)", () => {
    for (const tier of TIER_ORDER) {
      for (const bullet of pricingBullets(tier)) {
        expect(bullet.blurb).toBe(getMarketing(bullet.id)!.blurb);
      }
    }
  });

  it("Signal sells on the paid card, not the Free one", () => {
    expect(pricingBullets("personal").some((b) => b.id === "signal")).toBe(true);
    expect(pricingBullets("free").some((b) => b.id === "signal")).toBe(false);
  });

  it("the paid card sells only shipped features, never coming-soon ones", () => {
    // Pin: with Pro retired there is one paid card, so a coming-soon bullet
    // would sit beside shipped ones with nothing distinguishing them. The
    // trade-off encoded here is losing the roadmap as a selling point in
    // exchange for a card that only promises what exists today.
    for (const tier of TIER_ORDER) {
      for (const bullet of pricingBullets(tier)) {
        expect(getEntry(bullet.id).status).toBe("shipped");
      }
    }
  });

  it("Signal Briefings lands on the paid card (its lowest unlock tier)", () => {
    expect(pricingBullets("personal").some((b) => b.id === "signal-briefings")).toBe(true);
    expect(pricingBullets("free").some((b) => b.id === "signal-briefings")).toBe(false);
  });

  it("does not surface gated features that opt out of pricing (no marketing field)", () => {
    // `rules` is a shipped Personal feature deliberately omitted from the
    // pricing grid — it must not appear on any card.
    expect(GATED_FEATURE_IDS).toContain("rules");
    for (const tier of TIER_ORDER) {
      expect(pricingBullets(tier).some((b) => b.id === "rules")).toBe(false);
    }
  });
});
