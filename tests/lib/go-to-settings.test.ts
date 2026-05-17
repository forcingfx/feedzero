/**
 * goToSettings — single helper for navigating to the Settings stage page.
 *
 * Settings is now a route (`/settings`), not a dialog. The tab is carried
 * in the `?tab=` query param so deep-links and browser back work.
 *
 * Verifies the navigate call shape; the tab the URL actually selects is
 * exercised in tests/pages/settings-page.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  goToSettings,
  goToUpgrade,
  goToSyncSetup,
} from "@/lib/go-to-settings";

describe("goToSettings", () => {
  const navigate = vi.fn();

  beforeEach(() => {
    navigate.mockReset();
  });

  it("navigates to /settings with no tab arg", () => {
    goToSettings(navigate);
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("encodes the tab as a query param", () => {
    goToSettings(navigate, "data");
    expect(navigate).toHaveBeenCalledWith("/settings?tab=data");
  });

  it("goToUpgrade lands on the subscription tab", () => {
    goToUpgrade(navigate);
    expect(navigate).toHaveBeenCalledWith("/settings?tab=subscription");
  });

  it("goToSyncSetup lands on the data tab", () => {
    goToSyncSetup(navigate);
    expect(navigate).toHaveBeenCalledWith("/settings?tab=data");
  });
});
