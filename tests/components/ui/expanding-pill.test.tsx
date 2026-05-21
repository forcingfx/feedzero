/**
 * ExpandingPill — circle-to-pill primitive. Default state shows the
 * icon only at a circular size; hover (desktop) or always-on (mobile)
 * expands a label slot horizontally via CSS max-width animation.
 *
 * Behaviour tests focus on:
 *  - The label is present in the DOM but visually constrained when collapsed
 *    (so assistive tech can still read it, and CSS transitions have a target)
 *  - aria-label is forwarded for screen-reader fallback
 *  - onClick fires regardless of expansion state
 *  - The component renders as a button by default (keyboard accessible)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings as SettingsIcon } from "lucide-react";
import { ExpandingPill } from "@/components/ui/expanding-pill.tsx";

describe("ExpandingPill", () => {
  it("renders as a button element with the supplied aria-label", () => {
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        aria-label="Open feed settings"
        onClick={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: "Open feed settings" });
    expect(btn).toBeInTheDocument();
  });

  it("renders the label text in the DOM (for hover-expand + a11y)", () => {
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Feed settings")).toBeInTheDocument();
  });

  it("fires onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        aria-label="Open feed settings"
        onClick={onClick}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open feed settings" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation (Enter)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        aria-label="Open feed settings"
        onClick={onClick}
      />,
    );
    const btn = screen.getByRole("button", { name: "Open feed settings" });
    btn.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("collapsed state: label slot has max-w-0 + overflow-hidden so the icon-only width is the default", () => {
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        onClick={vi.fn()}
      />,
    );
    const label = screen.getByText("Feed settings");
    expect(label.className).toMatch(/max-w-0/);
    expect(label.className).toMatch(/overflow-hidden/);
  });

  it("expansion is wired to hover, focus-visible, AND active (mobile tap)", () => {
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        onClick={vi.fn()}
      />,
    );
    const label = screen.getByText("Feed settings");
    // Three expansion triggers: desktop pointer hover, keyboard
    // focus-visible, and mobile tap (group-active while the press is
    // held). Don't pin the exact width — just confirm each mechanism
    // is wired.
    expect(label.className).toMatch(/group-hover:max-w-/);
    expect(label.className).toMatch(/group-focus-visible:max-w-/);
    expect(label.className).toMatch(/group-active:max-w-/);
  });

  it("when alwaysExpanded is true, the label has no max-w-0 constraint (mobile-always-visible mode)", () => {
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        alwaysExpanded
        onClick={vi.fn()}
      />,
    );
    const label = screen.getByText("Feed settings");
    expect(label.className).not.toMatch(/max-w-0/);
  });

  it("forwards a data-testid for downstream queries", () => {
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        dataTestId="settings-pill"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId("settings-pill")).toBeInTheDocument();
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ExpandingPill
        icon={<SettingsIcon />}
        label="Feed settings"
        aria-label="Open feed settings"
        disabled
        onClick={onClick}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open feed settings" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
