/**
 * SetupWizard — passphrase display overflow guard (Tier 2 structural test).
 *
 * Regression context: the original passphrase reveal used only
 * `text-center font-mono text-lg tracking-wide select-all` with no
 * overflow/wrap classes, so a long passphrase visually overflowed the
 * modal — the user reported "revealing the sync key causes the modal
 * to overflow and horizontal-scroll".
 *
 * Fix: `break-all` on the <p> + `overflow-x-auto` on the container as
 * belt-and-suspenders.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
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
