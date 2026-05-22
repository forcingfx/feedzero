import { describe, it, expect, vi, beforeEach } from "vitest";
import { isFeatureEnabled, enforceFeature } from "@/stores/enforce-feature.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import { isSelfHosted } from "@/core/features/self-hosted.ts";
import { isPaidTierActive } from "@/core/features/paid-tier-active.ts";
import { gateToast } from "@/core/features/feature-gates.ts";
import { toast } from "sonner";

vi.mock("@/core/features/self-hosted.ts", () => ({ isSelfHosted: vi.fn(() => false) }));
vi.mock("@/core/features/paid-tier-active.ts", () => ({ isPaidTierActive: vi.fn(() => false) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

describe("enforce-feature — shared store gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLicenseStore.setState({ tier: "free", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
    vi.mocked(isPaidTierActive).mockReturnValue(true);
  });

  it("isFeatureEnabled is false for a Free user when paid tier is live", () => {
    expect(isFeatureEnabled("rules")).toBe(false);
  });

  it("isFeatureEnabled is true for a Personal user", () => {
    useLicenseStore.setState({ tier: "personal" });
    expect(isFeatureEnabled("rules")).toBe(true);
  });

  it("isFeatureEnabled is true when the paid tier is dormant (pre-launch)", () => {
    vi.mocked(isPaidTierActive).mockReturnValue(false);
    expect(isFeatureEnabled("rules")).toBe(true);
  });

  it("isFeatureEnabled is true for a self-hosted Free user", () => {
    vi.mocked(isSelfHosted).mockReturnValue(true);
    expect(isFeatureEnabled("rules")).toBe(true);
  });

  it("enforceFeature toasts the matrix-derived copy and returns false when locked", () => {
    const allowed = enforceFeature("rules");
    expect(allowed).toBe(false);
    expect(toast).toHaveBeenCalledWith(gateToast("rules"));
  });

  it("enforceFeature is silent and returns true when allowed", () => {
    useLicenseStore.setState({ tier: "personal" });
    const allowed = enforceFeature("rules");
    expect(allowed).toBe(true);
    expect(toast).not.toHaveBeenCalled();
  });

  it("enforceFeature with { silent: true } does not toast even when locked", () => {
    const allowed = enforceFeature("offline-prefetch", { silent: true });
    expect(allowed).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
});
