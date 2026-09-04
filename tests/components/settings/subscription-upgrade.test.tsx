/**
 * <SubscriptionUpgrade> — inline tier comparison shown to free users
 * inside the Subscription tab. Four tier cards (Free / Personal / Pro /
 * Self-host); same CTAs. The "Log in" affordance was promoted out of this
 * card into a top-level "Activate existing license" CTA on the Subscription
 * tab — it is no longer this component's responsibility.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubscriptionUpgrade } from "@/components/settings/subscription-upgrade";
import { PAID_PLAN } from "@/core/features/pricing";

describe("<SubscriptionUpgrade>", () => {
  it("renders the three tiers", () => {
    render(<SubscriptionUpgrade />);
    expect(screen.getByText(/^Free$/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Supporter$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Self-host/i })).toBeInTheDocument();
  });

  it("no longer offers a Pro card", () => {
    // Pro was retired with the move to a single $9/year plan. It had no
    // shipped exclusive features, so the card sold a roadmap.
    render(<SubscriptionUpgrade />);
    expect(screen.queryByRole("heading", { name: /^Pro$/i })).toBeNull();
    expect(screen.queryByText(/coming 2026/i)).toBeNull();
  });

  it("the paid CTA links to the annual deeplink and names the price it will charge", () => {
    render(<SubscriptionUpgrade />);
    const cta = screen.getByRole("link", {
      name: new RegExp(`${PAID_PLAN.trialDays}-day free trial`, "i"),
    });
    expect(cta.getAttribute("href")).toMatch(/\?subscribe=personal-yearly/);
    expect(cta.textContent).toContain(PAID_PLAN.display);
  });

  it("names the trial length in the card blurb so it is visible above the fold", () => {
    // Stripe owns the trial clock; the copy has to match what the checkout
    // handler actually sends or the card lies about when the charge lands.
    render(<SubscriptionUpgrade />);
    expect(
      screen.getAllByText(new RegExp(`${PAID_PLAN.trialDays} days free`, "i")).length,
    ).toBeGreaterThan(0);
  });

  it("Self-host links to the docs page", () => {
    render(<SubscriptionUpgrade />);
    const link = screen.getByRole("link", { name: /self-host/i });
    expect(link.getAttribute("href")).toMatch(/self-host/);
  });

  it("does NOT render a 'Log in' link anymore — that affordance moved up to the Subscription tab as 'Activate existing license'", () => {
    render(<SubscriptionUpgrade />);
    expect(screen.queryByRole("button", { name: /^log in$/i })).toBeNull();
  });

  it("calls out Smart filters as a headline Personal feature", () => {
    // Smart filters are visible to free users in the sidebar (honor-system
    // open-core) — the Personal card must name them so the upgrade target
    // is obvious to anyone routed here from a locked surface.
    render(<SubscriptionUpgrade />);
    expect(screen.getByText(/smart filters/i)).toBeInTheDocument();
  });

  it("describes the self-host license as AGPL, not MIT", () => {
    // The project ships under AGPL-3.0-or-later (see /LICENSE). The old
    // 'MIT' wording was wrong and could mislead self-hosters reading the
    // tier card before they read the LICENSE.
    render(<SubscriptionUpgrade />);
    expect(screen.queryByText(/MIT/)).toBeNull();
    // Both "$0 · AGPL" and "Open source under AGPL-3.0" surface the license
    // — assert ≥ 1 match so the structural copy is free to evolve.
    expect(screen.getAllByText(/AGPL/i).length).toBeGreaterThan(0);
  });
});
