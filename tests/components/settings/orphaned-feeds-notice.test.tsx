import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrphanedFeedsNotice } from "@/components/settings/orphaned-feeds-notice";
import { useFeedStore } from "@/stores/feed-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
}));

function feed(id: string, folderId?: string) {
  return {
    id,
    url: `https://${id}.test/feed`,
    title: id,
    description: "",
    siteUrl: `https://${id}.test`,
    createdAt: 0,
    updatedAt: 0,
    folderId,
  };
}

describe("OrphanedFeedsNotice", () => {
  beforeEach(() => {
    useFeedStore.setState({ feeds: [], folders: [] });
  });

  it("renders nothing on the common path (no orphans)", () => {
    useFeedStore.setState({
      feeds: [feed("a"), feed("b", "tech")],
      folders: [{ id: "tech", name: "Tech", createdAt: 0 }],
    });

    const { container } = render(<OrphanedFeedsNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the count + guidance when feeds reference a missing folder", () => {
    useFeedStore.setState({
      feeds: [
        feed("a", "missing"),
        feed("b", "missing"),
        feed("c"),
      ],
      folders: [], // <- "missing" is the orphan target
    });

    render(<OrphanedFeedsNotice />);

    expect(screen.getByTestId("orphaned-feeds-notice")).toBeInTheDocument();
    expect(screen.getByText(/2 feeds reference a folder/i)).toBeInTheDocument();
    // The next-step copy should mention both refresh AND manual move so
    // users aren't stuck waiting on sync if their other device is offline.
    expect(screen.getByText(/refresh to re-sync/i)).toBeInTheDocument();
    expect(screen.getByText(/move them into a folder/i)).toBeInTheDocument();
  });

  it("uses singular grammar when exactly one feed is orphaned", () => {
    useFeedStore.setState({
      feeds: [feed("a", "missing")],
      folders: [],
    });

    render(<OrphanedFeedsNotice />);

    expect(screen.getByText(/1 feed references/i)).toBeInTheDocument();
  });

  it("has role=status so screen readers announce it but it doesn't grab focus", () => {
    useFeedStore.setState({
      feeds: [feed("a", "missing")],
      folders: [],
    });

    render(<OrphanedFeedsNotice />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
