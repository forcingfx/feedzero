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

describe("<SubscriptionUpgrade>", () => {
  it("renders all four tiers", () => {
    render(<SubscriptionUpgrade />);
    expect(screen.getByText(/^Free$/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Personal$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Pro$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Self-host/i })).toBeInTheDocument();
  });

  it("Personal CTA links to the personal-monthly deeplink and surfaces the 30-day free trial", () => {
    // Stripe-managed trial: the checkout handler injects
    // subscription_data.trial_period_days=30. The CTA copy must match so a
    // user reading the card understands why no charge appears immediately.
    render(<SubscriptionUpgrade />);
    const cta = screen.getByRole("link", { name: /30-day free trial/i });
    expect(cta.getAttribute("href")).toMatch(/\?subscribe=personal-monthly/);
  });

  it("calls out '30 days free' in the Personal card blurb so the trial is visible above the fold", () => {
    render(<SubscriptionUpgrade />);
    // Multiple matches expected (blurb + secondary yearly CTA). Both surfaces
    // intentionally repeat the trial framing — make sure at least the blurb
    // line is present.
    expect(screen.getAllByText(/30 days free/i).length).toBeGreaterThan(0);
  });

  it("Pro tier shows Coming Soon with no subscribe link", () => {
    render(<SubscriptionUpgrade />);
    expect(screen.getByText(/coming 2026/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pro/i })).toBeNull();
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
