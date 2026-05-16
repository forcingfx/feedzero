/**
 * <AccountTab> tests.
 *
 * Closes UX requirements 1, 2, 3, and (in-product entry point for) 4:
 *   1. See licensing status — tier chip + renewal date
 *   2. See my license — masked token + reveal + copy
 *   3. Manage Stripe billing / cancel — Manage subscription button
 *   4. Activate from another device — "Add another device" link
 *
 * We don't exercise the actual portal redirect or clipboard write here;
 * those are mocked. The contract is: the right buttons render with the right
 * affordances for the right tier, and clicking them invokes the right effect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountTab } from "@/components/settings/account-tab";
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
  // Suffix shape mimics the real `fz_<payload>.<sig>` format. The Account
  // tab never validates the signature locally — it trusts license-store
  // for tier and decodes the payload for renewal/customer info.
  return `fz_${base64UrlEncode(payload)}.c2lnbmF0dXJl`;
}

describe("<AccountTab>", () => {
  beforeEach(() => {
    localStorage.clear();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  afterEach(() => {
    clearLicenseToken();
    useLicenseStore.setState({ tier: "free", verifying: false });
  });

  describe("free tier (no subscription)", () => {
    it("shows 'Free' tier label and a subscribe CTA", () => {
      render(<AccountTab />);
      // Exact-match the chip (avoids matching body copy "You're on the Free tier")
      expect(screen.getByText("Free")).toBeInTheDocument();
      const subscribeLink = screen.getByRole("link", {
        name: /subscribe to personal/i,
      });
      expect(subscribeLink.getAttribute("href")).toMatch(
        /subscribe=personal-monthly/,
      );
    });

    it("does NOT show license-token, Manage subscription, or Add-another-device when free", () => {
      render(<AccountTab />);
      expect(screen.queryByRole("button", { name: /reveal/i })).toBeNull();
      expect(
        screen.queryByRole("button", { name: /manage subscription/i }),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: /add another device/i }),
      ).toBeNull();
    });
  });

  describe("personal tier (active subscription)", () => {
    beforeEach(() => {
      setLicenseToken(makeToken("personal"));
      useLicenseStore.setState({ tier: "personal", verifying: false });
    });

    it("shows 'Personal' tier label", () => {
      render(<AccountTab />);
      expect(screen.getByText(/personal/i)).toBeInTheDocument();
    });

    it("shows a renewal date decoded from the token's expirySec", () => {
      // expirySec 1_800_000_000 = 2027-01-15
      render(<AccountTab />);
      // Match year of the renewal date (locale-tolerant — we don't pin format)
      expect(screen.getByText(/2027/)).toBeInTheDocument();
    });

    it("masks the license token by default and reveals on click", async () => {
      const user = userEvent.setup();
      render(<AccountTab />);

      // Masked dots are present; full token is NOT
      expect(screen.getByText(/••••/)).toBeInTheDocument();
      const token = makeToken("personal");
      expect(screen.queryByText(token)).toBeNull();

      await user.click(screen.getByRole("button", { name: /reveal/i }));

      // After reveal the full token is visible; mask gone
      expect(screen.getByText(token)).toBeInTheDocument();
    });

    it("copies the token to clipboard when Copy is clicked", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      // happy-dom's clipboard API is incomplete; stub it.
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      render(<AccountTab />);

      // fireEvent rather than userEvent: in happy-dom, userEvent's pointer
      // sequence for icon-only buttons can drop the click. fireEvent is the
      // direct dispatch we actually want here.
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(makeToken("personal"));
      });
    });

    it("shows a Manage subscription button (opens Stripe Customer Portal)", () => {
      render(<AccountTab />);
      expect(
        screen.getByRole("button", { name: /manage subscription/i }),
      ).toBeInTheDocument();
    });

    it("shows an Add-another-device link pointing at /billing/recover", () => {
      render(<AccountTab />);
      const link = screen.getByRole("link", { name: /add another device/i });
      expect(link.getAttribute("href")).toMatch(/\/billing\/recover/);
    });

    it("sign-out clears the license token and resets tier to free", async () => {
      const user = userEvent.setup();
      render(<AccountTab />);

      await user.click(screen.getByRole("button", { name: /sign out/i }));

      // Token gone from storage; tier reset.
      expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).toBeNull();
      expect(useLicenseStore.getState().tier).toBe("free");
    });
  });
});
