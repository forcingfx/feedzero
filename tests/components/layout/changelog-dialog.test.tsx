import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangelogBentoDialog, releases } from "@/components/layout/changelog-bento.tsx";

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

  it("every release has a type field", () => {
    for (const release of releases) {
      expect(release.type).toBeDefined();
      expect(["feature", "minor"]).toContain(release.type);
    }
  });

  it("shows latest release on open", () => {
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText(releases[0].title)).toBeInTheDocument();
    expect(screen.getByText(releases[0].subtitle)).toBeInTheDocument();
  });

  it("navigates to older release via left arrow button", async () => {
    const user = userEvent.setup();
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /older release/i }));
    expect(screen.getByText(releases[1].title)).toBeInTheDocument();
  });

  it("navigates back to newer release via right arrow button", async () => {
    const user = userEvent.setup();
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    // Go to second release
    await user.click(screen.getByRole("button", { name: /older release/i }));
    expect(screen.getByText(releases[1].title)).toBeInTheDocument();

    // Go back
    await user.click(screen.getByRole("button", { name: /newer release/i }));
    expect(screen.getByText(releases[0].title)).toBeInTheDocument();
  });

  it("shows page indicator", () => {
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText(/1 \/ \d+/)).toBeInTheDocument();
  });

  it("renders minor release bullet items", () => {
    render(<ChangelogBentoDialog open={true} onOpenChange={vi.fn()} />);

    const latest = releases[0];
    if (latest.type !== "minor") return;

    for (const item of latest.items) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });
});
