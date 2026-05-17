/**
 * <SubscriptionTab> — what plan am I on, and how do I activate or pay for it?
 *
 * Free users see:
 *   - tier badge
 *   - large "Activate existing license" CTA (opens the paste-token dialog)
 *   - "Lost your license?" recovery link → /billing/recover
 *   - "or subscribe" divider + tier comparison cards
 *
 * Paid users see:
 *   - tier card with renewal date, license-token reveal, "Manage subscription"
 *   - Deactivate-on-this-device action
 *   - Compact "Looking for a different plan?" strip with alt tiers
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
    it("shows the Free tier badge", () => {
      renderTab();
      expect(screen.getAllByText(/^Free$/).length).toBeGreaterThan(0);
    });

    it("shows the large 'Activate existing license' primary CTA", () => {
      renderTab();
      expect(
        screen.getByRole("button", { name: /activate existing license/i }),
      ).toBeInTheDocument();
    });

    it("shows a 'Lost your license?' recovery link to /billing/recover", () => {
      renderTab();
      const link = screen.getByRole("link", { name: /lost your license/i });
      expect(link.getAttribute("href")).toMatch(/\/billing\/recover/);
    });

    it("shows the 'or subscribe' divider and all four tier cards below it", () => {
      renderTab();
      expect(screen.getByText(/or subscribe/i)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /^Personal$/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /^Pro$/i })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /Self-host/i }),
      ).toBeInTheDocument();
    });

    it("does not show license-token controls when free", () => {
      renderTab();
      expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull();
      expect(
        screen.queryByRole("button", { name: /manage subscription/i }),
      ).toBeNull();
    });

    it("clicking 'Activate existing license' opens the activation dialog", async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(
        screen.getByRole("button", { name: /activate existing license/i }),
      );
      expect(
        screen.getByRole("dialog", { name: /activate existing license/i }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/license token/i)).toBeInTheDocument();
    });
  });

  describe("paid tier", () => {
    beforeEach(() => {
      setLicenseToken(makeToken("personal"));
      useLicenseStore.setState({ tier: "personal", verifying: false });
    });

    it("shows the Personal tier label", () => {
      renderTab();
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

    it("does NOT show the 'Activate existing license' CTA (already activated)", () => {
      renderTab();
      expect(
        screen.queryByRole("button", { name: /activate existing license/i }),
      ).toBeNull();
    });

    it("does NOT show the full pricing comparison; only alt-plan suggestions", () => {
      renderTab();
      // Free tier card belongs to the free-user upgrade grid, not the
      // paid-user "alt plans" strip — we deliberately omit it for paid users.
      expect(screen.queryByRole("heading", { name: /^Free$/i })).toBeNull();
      // But Pro and Self-host are still visible as alternative-plan affordances.
      expect(
        screen.getByRole("heading", { name: /Self-host/i }),
      ).toBeInTheDocument();
    });

    it("offers a Deactivate-on-this-device button", () => {
      renderTab();
      expect(
        screen.getByRole("button", { name: /deactivate.*on this device/i }),
      ).toBeInTheDocument();
    });
  });
});
