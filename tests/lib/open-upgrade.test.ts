/**
 * openUpgrade — single in-app entry point for upgrade intent.
 *
 * Replaces the scattered `navigate("/?subscribe=personal-monthly")` calls.
 * Every in-app upgrade button funnels through this helper so future routing
 * (highlight Plan card, log conversion intent, A/B test the destination)
 * has one place to live.
 *
 * Stripe Checkout is still reachable from the Subscribe buttons on the
 * Plan card inside Settings → Account; this helper just opens that
 * surface, it doesn't bypass it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openUpgrade } from "@/lib/open-upgrade";
import { useSettingsStore } from "@/stores/settings-store";

describe("openUpgrade", () => {
  beforeEach(() => {
    useSettingsStore.setState({ open: false, activeTab: "help" });
  });

  it("opens the unified Settings dialog on the Account tab", () => {
    openUpgrade();
    const s = useSettingsStore.getState();
    expect(s.open).toBe(true);
    expect(s.activeTab).toBe("account");
  });

  it("switches tab to account when settings is already open on a different tab", () => {
    useSettingsStore.setState({ open: true, activeTab: "import" });
    openUpgrade();
    expect(useSettingsStore.getState().activeTab).toBe("account");
  });
});
