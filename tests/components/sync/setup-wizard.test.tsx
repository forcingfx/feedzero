/**
 * SetupWizard — single-screen passphrase flow.
 *
 * Verifies (a) the passphrase reveal doesn't overflow on long phrases
 * (regression: original reveal lacked `break-all` / `overflow-x-auto`),
 * and (b) the redesign collapsed the prior two-step (display + retype-to-
 * confirm) flow into one screen: the "I've saved my secret key" checkbox
 * is the contract; clicking Enable runs onEnable.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupWizard } from "@/components/sync/setup-wizard";

const LONG_PASSPHRASE =
  "alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel-india-juliet";

describe("<SetupWizard> — passphrase overflow", () => {
  it("passphrase <p> has break-all so long phrases wrap instead of overflowing", () => {
    const { container } = render(
      <SetupWizard
        open
        onOpenChange={vi.fn()}
        passphrase={LONG_PASSPHRASE}
        onEnable={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const passphraseEl = container.ownerDocument.body.querySelector(
      "p.font-mono",
    );
    expect(passphraseEl).not.toBeNull();
    expect(passphraseEl!.className).toContain("break-all");
  });

  it("passphrase container has overflow-x-auto as a defense-in-depth fallback", () => {
    const { container } = render(
      <SetupWizard
        open
        onOpenChange={vi.fn()}
        passphrase={LONG_PASSPHRASE}
        onEnable={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const passphraseEl = container.ownerDocument.body.querySelector(
      "p.font-mono",
    );
    const wrapper = passphraseEl!.parentElement!;
    expect(wrapper.className).toContain("overflow-x-auto");
  });
});

describe("<SetupWizard> — single-screen flow", () => {
  it("Enable button is disabled until 'I've saved my secret key' is checked", () => {
    render(
      <SetupWizard
        open
        onOpenChange={vi.fn()}
        passphrase="alpha bravo charlie delta"
        onEnable={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: /enable sync/i })).toBeDisabled();
  });

  it("checking the box enables the Enable button; clicking it invokes onEnable", async () => {
    const user = userEvent.setup();
    const onEnable = vi.fn().mockResolvedValue(undefined);
    render(
      <SetupWizard
        open
        onOpenChange={vi.fn()}
        passphrase="alpha bravo charlie delta"
        onEnable={onEnable}
      />,
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /enable sync/i }));
    expect(onEnable).toHaveBeenCalled();
  });

  it("does NOT show a separate confirm-by-retype step (collapsed into one screen)", () => {
    render(
      <SetupWizard
        open
        onOpenChange={vi.fn()}
        passphrase="alpha bravo charlie delta"
        onEnable={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(
      screen.queryByPlaceholderText(/enter your secret key/i),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /confirm your secret key/i }),
    ).toBeNull();
  });
});
