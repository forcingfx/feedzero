/**
 * <UpgradeDialog> — in-app tier comparison shown when a free user
 * attempts a paid feature.
 *
 * Mirrors the content of /pricing on the landing site: Free / Personal /
 * Pro / Self-host tiers with Subscribe CTAs that route to Stripe Checkout
 * via the existing /?subscribe=personal-monthly deeplink (same tab, per
 * the user's spec).
 *
 * Open/close state lives in useLicenseStore so any component can request
 * the dialog without prop drilling.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { useLicenseStore } from "@/stores/license-store";

describe("<UpgradeDialog>", () => {
  beforeEach(() => {
    useLicenseStore.setState({
      tier: "free",
      verifying: false,
      upgradeDialogOpen: false,
    });
  });

  it("renders nothing when upgradeDialogOpen is false", () => {
    render(<UpgradeDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders all four tiers when open", () => {
    useLicenseStore.setState({ upgradeDialogOpen: true });
    render(<UpgradeDialog />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Tier names appear in the dialog
    expect(screen.getByText(/^Free$/)).toBeInTheDocument();
    expect(screen.getByText(/^Personal$/)).toBeInTheDocument();
    expect(screen.getByText(/^Pro$/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Self-host/i })).toBeInTheDocument();
  });

  it("Personal Subscribe CTA links to the personal-monthly deeplink (same tab)", () => {
    useLicenseStore.setState({ upgradeDialogOpen: true });
    render(<UpgradeDialog />);
    const personalCta = screen.getByRole("link", {
      name: /subscribe.*\$5\/mo|subscribe to personal/i,
    });
    expect(personalCta.getAttribute("href")).toMatch(
      /\?subscribe=personal-monthly/,
    );
    // Same tab — no target=_blank per user's spec
    expect(personalCta.getAttribute("target")).toBeNull();
  });

  it("Pro tier shows Coming Soon, no link", () => {
    useLicenseStore.setState({ upgradeDialogOpen: true });
    render(<UpgradeDialog />);
    // Pro tier has the "Coming 2026" price + a "Coming soon" disabled
    // button — both should be present and neither should be a link.
    expect(screen.getByText(/coming 2026/i)).toBeInTheDocument();
    // No Subscribe link whose accessible name matches Pro
    expect(screen.queryByRole("link", { name: /pro/i })).toBeNull();
  });

  it("Self-host CTA links to docs/self-hosting", () => {
    useLicenseStore.setState({ upgradeDialogOpen: true });
    render(<UpgradeDialog />);
    const selfHostCta = screen.getByRole("link", { name: /self-host/i });
    expect(selfHostCta.getAttribute("href")).toMatch(/self-host/);
  });

  it("closing the dialog clears upgradeDialogOpen state", () => {
    useLicenseStore.setState({ upgradeDialogOpen: true });
    render(<UpgradeDialog />);
    // Radix dialog close mechanism: click outside or press Esc.
    // Use the explicit close button.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(useLicenseStore.getState().upgradeDialogOpen).toBe(false);
  });
});
