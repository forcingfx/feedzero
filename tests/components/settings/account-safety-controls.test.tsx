/**
 * <AccountSafetyControls> — layered safety net for "I lost my license".
 *
 * Three preemptive + reactive recovery affordances rendered in the Account
 * tab for paid users:
 *
 *  1. Email myself the token — mailto: that pre-fills subject + body with
 *     the license token. User mails it to their own inbox so the inbox
 *     archive becomes a recovery fallback even if /billing/recover and
 *     localStorage both fail them later.
 *  2. Download recovery sheet — .txt blob with token, customer ID, the
 *     /billing/recover URL, and instructions. Offline storage option.
 *  3. Contact support — mailto: with diagnostic context (tier, customer
 *     ID, last verify error) pre-filled so support has actionable info.
 *
 * All three use `mailto:` rather than POSTing to /api/feedback so we don't
 * need email-service infrastructure on our side. The user's mail client
 * IS the channel.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountSafetyControls } from "@/components/settings/account-safety-controls";

describe("<AccountSafetyControls>", () => {
  const TOKEN = "fz_a.b";
  const CUSTOMER_ID = "cus_abc123";

  beforeEach(() => {
    // no global state; everything via props
  });

  it("renders an 'Email license to me' mailto link with token in the body", () => {
    render(<AccountSafetyControls token={TOKEN} customerId={CUSTOMER_ID} />);
    const link = screen.getByRole("link", { name: /email .* license/i });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(href)).toContain(TOKEN);
  });

  it("renders a 'Download recovery sheet' button", () => {
    render(<AccountSafetyControls token={TOKEN} customerId={CUSTOMER_ID} />);
    expect(
      screen.getByRole("button", { name: /download recovery/i }),
    ).toBeInTheDocument();
  });

  it("renders a 'Contact support' mailto link with diagnostic context", () => {
    render(<AccountSafetyControls token={TOKEN} customerId={CUSTOMER_ID} />);
    const link = screen.getByRole("link", { name: /contact support/i });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(href)).toContain(CUSTOMER_ID);
  });

  it("uses the operator support email in mailto links", () => {
    render(<AccountSafetyControls token={TOKEN} customerId={CUSTOMER_ID} />);
    const supportLink = screen.getByRole("link", { name: /contact support/i });
    const href = supportLink.getAttribute("href") ?? "";
    // Operator address — adjust if you change it. Encodes that the
    // address is configurable in one place (the component itself).
    expect(href).toMatch(/mailto:support@/i);
  });
});
