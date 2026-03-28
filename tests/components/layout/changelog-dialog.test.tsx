import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangelogBentoDialog } from "@/components/layout/changelog-bento.tsx";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

describe("ChangelogBentoDialog", () => {
  it("renders a close button that is not keyboard-focusable", () => {
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveAttribute("tabindex", "-1");
  });

  it("shows Esc dismiss hint", () => {
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText(/to dismiss/)).toBeInTheDocument();
  });

  it("dismisses on Escape key", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ChangelogBentoDialog open={true} onOpenChange={onOpenChange} />);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows previous release link", () => {
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText(/previous release/i)).toBeInTheDocument();
  });

  it("navigates to previous release and back", async () => {
    const user = userEvent.setup();
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    // v0.2.1 → v0.2.0
    await user.click(screen.getByText(/previous release/i));
    expect(screen.getByText(/Find your next read/)).toBeInTheDocument();

    // v0.2.0 → v0.1.0
    await user.click(screen.getByText(/previous release/i));
    expect(screen.getByText(/A private RSS reader/)).toBeInTheDocument();

    await user.click(screen.getByText(/back to latest/i));
    expect(screen.getByText(/Visual polish/)).toBeInTheDocument();
  });
});
