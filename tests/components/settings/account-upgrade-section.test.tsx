/**
 * <AccountUpgradeSection> — inline tier-comparison for the Account tab.
 *
 * Replaces the UpgradeDialog modal for the in-Settings flow. Same four
 * tier cards (Free / Personal / Pro / Self-host); same CTAs.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountUpgradeSection } from "@/components/settings/account-upgrade-section";

describe("<AccountUpgradeSection>", () => {
  it("renders all four tiers", () => {
    render(<AccountUpgradeSection />);
    expect(screen.getByText(/^Free$/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Personal$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Pro$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Self-host/i })).toBeInTheDocument();
  });

  it("Personal Subscribe CTA links to the personal-monthly deeplink", () => {
    render(<AccountUpgradeSection />);
    const cta = screen.getByRole("link", { name: /subscribe.*personal/i });
    expect(cta.getAttribute("href")).toMatch(/\?subscribe=personal-monthly/);
  });

  it("Pro tier shows Coming Soon with no subscribe link", () => {
    render(<AccountUpgradeSection />);
    expect(screen.getByText(/coming 2026/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pro/i })).toBeNull();
  });

  it("Self-host links to the docs page", () => {
    render(<AccountUpgradeSection />);
    const link = screen.getByRole("link", { name: /self-host/i });
    expect(link.getAttribute("href")).toMatch(/self-host/);
  });

  it("offers a secondary 'Already have an account? Log in' affordance that opens the device wizard", async () => {
    // When a free user is routed to the upgrade Plan card via the chokepoint,
    // they should ALSO see a path to log in if they already have a license
    // (e.g. they bought on another device). Otherwise they might re-purchase.
    const { useLoginStore } = await import("@/stores/login-store.ts");
    useLoginStore.setState({ open: false });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<AccountUpgradeSection />);
    const loginBtn = screen.getByRole("button", { name: /log in/i });
    await user.click(loginBtn);
    expect(useLoginStore.getState().open).toBe(true);
  });
});
