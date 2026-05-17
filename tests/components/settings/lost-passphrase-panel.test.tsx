/**
 * <LostPassphrasePanel> — short muted note about passphrase recovery.
 *
 * The redesign shrank this from a full amber callout box (shown to every
 * user including local-only) to a one-line note rendered under the sync
 * toggle only when sync is enabled. Verifies the new copy is present and
 * the alarming "Lost your sync passphrase?" framing is gone.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LostPassphrasePanel } from "@/components/settings/tabs/lost-passphrase-panel";

describe("<LostPassphrasePanel>", () => {
  it("states FeedZero cannot recover the passphrase", () => {
    render(<LostPassphrasePanel />);
    expect(
      screen.getByText(/cannot recover your sync passphrase/i),
    ).toBeInTheDocument();
  });

  it("tells the user they can always set up fresh cloud sync", () => {
    render(<LostPassphrasePanel />);
    expect(
      screen.getByText(/set up fresh cloud sync/i),
    ).toBeInTheDocument();
  });

  it("does NOT show the legacy 'Lost your sync passphrase?' headline", () => {
    // The amber box with a big heading alarmed local-only users. The new
    // panel is a single muted line.
    render(<LostPassphrasePanel />);
    expect(
      screen.queryByRole("heading", { name: /lost your sync passphrase/i }),
    ).toBeNull();
  });

  it("does NOT render a contact-support card (moved to Help tab)", () => {
    render(<LostPassphrasePanel />);
    expect(screen.queryByText("support@feedzero.app")).toBeNull();
  });

  it("does NOT offer a passphrase-reset action (it can't exist)", () => {
    render(<LostPassphrasePanel />);
    expect(
      screen.queryByRole("button", { name: /reset.*passphrase/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /reset.*passphrase/i }),
    ).toBeNull();
  });
});
