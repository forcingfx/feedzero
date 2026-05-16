/**
 * <AccountLicenseRecovery> — replaces AccountSafetyControls.
 *
 * Simpler surface with three contracts:
 *   - Shows the SUPPORT email (support@feedzero.app) prominently. We
 *     never display the user's own email anywhere in-app — that lives
 *     only in their Stripe account.
 *   - "Email my license to me" mailto (token in the body)
 *   - "Open recovery page →" link to /billing/recover
 *
 * Drops the "Download recovery sheet" .txt button as redundant with
 * email-self. Drops the standalone Contact support button — moved to
 * a small footer link inside this card.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountLicenseRecovery } from "@/components/settings/account-license-recovery";

const TOKEN = "fz_payload.signature";
const CUSTOMER_ID = "cus_abc123";
const SUPPORT_EMAIL = "support@feedzero.app";

describe("<AccountLicenseRecovery>", () => {
  it("shows the support email prominently", () => {
    render(<AccountLicenseRecovery token={TOKEN} customerId={CUSTOMER_ID} />);
    expect(screen.getByText(SUPPORT_EMAIL)).toBeInTheDocument();
  });

  it("does NOT show the user's own email (privacy floor — never display it)", () => {
    // Sanity: even if a recovery-email value somehow leaks into localStorage,
    // this component must never render it. The contract is: the only thing
    // shown is the support email.
    localStorage.setItem("feedzero:recovery-email", "user@example.com");
    render(<AccountLicenseRecovery token={TOKEN} customerId={CUSTOMER_ID} />);
    expect(screen.queryByText("user@example.com")).toBeNull();
    localStorage.removeItem("feedzero:recovery-email");
  });

  it("renders an 'Email my license to me' mailto with the token in the body", () => {
    render(<AccountLicenseRecovery token={TOKEN} customerId={CUSTOMER_ID} />);
    const link = screen.getByRole("link", { name: /email .* license to me/i });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(href)).toContain(TOKEN);
  });

  it("links to /billing/recover for cross-device recovery", () => {
    render(<AccountLicenseRecovery token={TOKEN} customerId={CUSTOMER_ID} />);
    const link = screen.getByRole("link", { name: /recovery page/i });
    expect(link.getAttribute("href")).toBe("/billing/recover");
  });

  it("does NOT render a 'Download recovery sheet' button (dropped as redundant)", () => {
    render(<AccountLicenseRecovery token={TOKEN} customerId={CUSTOMER_ID} />);
    expect(
      screen.queryByRole("button", { name: /recovery sheet/i }),
    ).toBeNull();
  });

  it("renders a small Contact support link in the card footer", () => {
    render(<AccountLicenseRecovery token={TOKEN} customerId={CUSTOMER_ID} />);
    const link = screen.getByRole("link", { name: /contact support/i });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}`)).toBe(true);
    // Carries the customerId for triage but only a truncated token (not the full secret)
    expect(decodeURIComponent(href)).toContain(CUSTOMER_ID);
    expect(decodeURIComponent(href)).not.toContain(TOKEN);
  });
});
