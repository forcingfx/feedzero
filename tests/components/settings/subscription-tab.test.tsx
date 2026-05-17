/**
 * <SubscriptionTab> — what plan am I on, and how do I pay for it?
 *
 * Free users see the upgrade tier comparison.
 * Paid users see tier card, masked license token (reveal + copy), and
 * "Manage subscription". The "Add another device" action moved out of
 * Subscription into Recovery, so this tab should NOT render it any more.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { SubscriptionTab } from "@/components/settings/tabs/subscription-tab";
import { useLicenseStore } from "@/stores/license-store";
import {
  setLicenseToken,
  clearLicenseToken,
  LICENSE_TOKEN_STORAGE_KEY,
} from "@/core/license/license-token-store";
import { encodeLicensePayload, type LicenseTier } from "@/core/license/format";
import { base64UrlEncode } from "@/core/license/crypto";

function makeToken(
  tier: LicenseTier,
  opts?: { customerId?: string; expirySec?: number },
): string {
  const payload = encodeLicensePayload({
    tier,
    expirySec: opts?.expirySec ?? 1_800_000_000,
    customerId: opts?.customerId ?? "cus_test123",
    keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    issuedAtSec: 1_700_000_000,
  });
  return `fz_${base64UrlEncode(payload)}.c2lnbmF0dXJl`;
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="probe-path">{pathname + search}</div>;
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/settings?tab=subscription"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <SubscriptionTab />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("<SubscriptionTab>", () => {
  beforeEach(() => {
    localStorage.clear();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  afterEach(() => {
    clearLicenseToken();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  describe("free tier", () => {
    it("shows the Free tier label and the upgrade tier cards", () => {
      renderTab();
      expect(screen.getAllByText(/^Free$/).length).toBeGreaterThan(0);
      // All four tier cards from SubscriptionUpgrade
      expect(screen.getByRole("heading", { name: /^Personal$/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /^Pro$/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Self-host/i })).toBeInTheDocument();
    });

    it("does not show license-token controls when free", () => {
      renderTab();
      expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull();
      expect(
        screen.queryByRole("button", { name: /manage subscription/i }),
      ).toBeNull();
    });
  });

  describe("paid tier", () => {
    beforeEach(() => {
      setLicenseToken(makeToken("personal"));
      useLicenseStore.setState({ tier: "personal", verifying: false });
    });

    it("shows the Personal tier label", () => {
      renderTab();
      // Several DOM nodes mention "Personal" (tier chip, Deactivate copy,
      // info chip). The tier chip is the canonical one; assert via the
      // chip's exact text.
      const chips = screen.getAllByText("Personal");
      expect(chips.length).toBeGreaterThan(0);
    });

    it("shows a renewal date decoded from the token", () => {
      renderTab();
      expect(screen.getByText(/2027/)).toBeInTheDocument();
    });

    it("masks the token by default; reveals on click", async () => {
      const user = userEvent.setup();
      renderTab();
      expect(screen.getByText(/••••/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /reveal/i }));
      expect(screen.getByText(makeToken("personal"))).toBeInTheDocument();
    });

    it("copies the token to the clipboard when Copy is clicked", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });
      renderTab();
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(makeToken("personal")),
      );
    });

    it("offers a Manage subscription button", () => {
      renderTab();
      expect(
        screen.getByRole("button", { name: /manage subscription/i }),
      ).toBeInTheDocument();
    });

    it("does NOT render the old 'Add another device' link", () => {
      // PR B replaced the per-tab "Add another device" button with an
      // inline cross-link pointing at the Recovery tab. The old link
      // should be gone.
      renderTab();
      expect(
        screen.queryByRole("link", { name: /add another device/i }),
      ).toBeNull();
    });

    it("offers a 'See Recovery' cross-link that navigates to ?tab=recovery", async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole("button", { name: /see recovery/i }));
      expect(screen.getByTestId("probe-path")).toHaveTextContent(
        "/settings?tab=recovery",
      );
    });

    it("Sign-out button (PR A) was removed from Subscription; license clearing now lives in Subscription's Deactivate (PR C)", () => {
      // After PR B there is no Sign-out button in the subscription tab.
      // PR C adds Deactivate; for now we assert the old sign-out is gone.
      renderTab();
      expect(
        screen.queryByRole("button", { name: /sign out/i }),
      ).toBeNull();
      expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).not.toBeNull();
    });
  });
});
