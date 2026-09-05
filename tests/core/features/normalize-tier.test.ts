/**
 * `normalizeTier` — the seam between the license wire and the app.
 *
 * Pro was retired from the product when pricing collapsed to a single
 * $9/year plan, but `LicenseTier` is a *wire* type: tokens minted before the
 * change carry `tier=pro` and stay signature-valid for up to a year. Deleting
 * "pro" from the type would have made those tokens fail to decode and dropped
 * paying customers to Free.
 *
 * So the wire keeps three values and the app knows two, with this function
 * between them. Every boundary that reads a tier off a token or off Stripe
 * runs it through here.
 */
import { describe, it, expect } from "vitest";
import { normalizeTier } from "@/core/features/tier-matrix";
import { TIER_ORDER } from "@/core/features/tier-matrix";
import { encodeLicensePayload, decodeLicensePayload } from "@/core/license/format";

describe("normalizeTier", () => {
  it("maps a legacy pro token onto the paid tier", () => {
    // A pro subscriber must not be downgraded by a change they did not make.
    expect(normalizeTier("pro")).toBe("personal");
  });

  it("passes through the tiers the app still knows", () => {
    expect(normalizeTier("free")).toBe("free");
    expect(normalizeTier("personal")).toBe("personal");
  });

  it("only ever returns a tier the matrix declares", () => {
    for (const wire of ["free", "personal", "pro"] as const) {
      expect(TIER_ORDER).toContain(normalizeTier(wire));
    }
  });

  it("a pro token minted before the collapse still decodes and grants paid access", () => {
    // End-to-end over the real codec, not a hand-built string: this is the
    // exact shape sitting in a pre-repricing customer's localStorage.
    const wire = encodeLicensePayload({
      tier: "pro",
      expirySec: 2_000_000_000,
      customerId: "cus_legacy",
      keyId: "a".repeat(32),
      issuedAtSec: 1_700_000_000,
    });

    const decoded = decodeLicensePayload(wire);
    expect(decoded.ok).toBe(true);
    expect(decoded.ok && normalizeTier(decoded.value.tier)).toBe("personal");
  });
});
