/**
 * <HelpTab> — Settings → Help.
 *
 * Folds in the help-adjacent items that used to live in the sidebar
 * SettingsMenu dropdown:
 *   - Keyboard shortcuts (inline list — was its own modal)
 *   - Send feedback (button → existing FeedbackDialog)
 *   - What's new (button → calls the onWhatsNew prop, which navigates to
 *     the changelog feed)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpTab } from "@/components/settings/tabs/help-tab";

vi.mock("@/components/feedback/feedback-dialog", () => ({
  FeedbackDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="feedback-dialog-open" /> : null,
}));
vi.mock("@/core/license/license-token-store", () => ({
  getLicenseToken: () => null,
  clearLicenseToken: () => undefined,
  setLicenseToken: () => undefined,
  LICENSE_TOKEN_STORAGE_KEY: "feedzero:license-token",
}));

describe("<HelpTab>", () => {
  it("renders the keyboard shortcuts inline (was its own modal)", () => {
    render(<HelpTab onWhatsNew={() => {}} />);
    // Shortcut group titles + a couple shortcut descriptions
    expect(screen.getByText(/navigation/i)).toBeInTheDocument();
    expect(screen.getByText(/next article/i)).toBeInTheDocument();
    expect(screen.getByText(/toggle sidebar/i)).toBeInTheDocument();
  });

  it("Send feedback button opens the FeedbackDialog", () => {
    render(<HelpTab onWhatsNew={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    expect(screen.getByTestId("feedback-dialog-open")).toBeInTheDocument();
  });

  it("What's new button calls the onWhatsNew callback", () => {
    const onWhatsNew = vi.fn();
    render(<HelpTab onWhatsNew={onWhatsNew} />);
    fireEvent.click(screen.getByRole("button", { name: /what's new/i }));
    expect(onWhatsNew).toHaveBeenCalledTimes(1);
  });
});
