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
});
