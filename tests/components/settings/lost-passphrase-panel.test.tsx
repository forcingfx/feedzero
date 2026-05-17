/**
 * PR C: <LostPassphrasePanel> — blunt copy + ContactSupport + no
 * fake reset action.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LostPassphrasePanel } from "@/components/settings/tabs/lost-passphrase-panel";

vi.mock("@/core/license/license-token-store", () => ({
  getLicenseToken: () => null,
  clearLicenseToken: () => undefined,
  setLicenseToken: () => undefined,
  LICENSE_TOKEN_STORAGE_KEY: "feedzero:license-token",
}));

describe("<LostPassphrasePanel>", () => {
  it("uses the blunt vault-unrecoverable framing (no escrow key)", () => {
    render(<LostPassphrasePanel />);
    expect(
      screen.getByText(/encrypted vault is unrecoverable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/we don.?t hold any\s*escrow key/i),
    ).toBeInTheDocument();
  });

  it("makes clear that recovering the subscription does NOT recover the vault", () => {
    const { container } = render(<LostPassphrasePanel />);
    // The "not" word lives inside a <strong>, so the text is split across
    // DOM nodes. Read the containing paragraph's full textContent.
    expect(container.textContent ?? "").toMatch(
      /recovering your subscription does\s+not\s+recover the vault/i,
    );
  });

  it("renders the ContactSupport widget", () => {
    render(<LostPassphrasePanel />);
    expect(screen.getByText("support@feedzero.app")).toBeInTheDocument();
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
