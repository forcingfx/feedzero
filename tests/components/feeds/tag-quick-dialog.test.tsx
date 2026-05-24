/**
 * TagQuickDialog — narrow modal hosting the TagPicker against a
 * single feed. Opens via ⌘K's "Tag this feed…" or the `t` keyboard
 * shortcut. Save → setFeedTags + close.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagQuickDialog } from "@/components/feeds/tag-quick-dialog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import type { Feed } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));
vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "f-tech",
    url: "https://example.com/feed.xml",
    title: "Tech Crunchies",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("TagQuickDialog", () => {
  let setFeedTags: ReturnType<typeof vi.fn>;
  let closeTagQuickDialog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setFeedTags = vi.fn().mockResolvedValue(undefined);
    closeTagQuickDialog = vi.fn().mockImplementation(() =>
      useFeedStore.setState({ tagQuickDialogFeedId: null }),
    );
    useFeedStore.setState({
      feeds: [feed()],
      tagQuickDialogFeedId: null,
      setFeedTags,
      closeTagQuickDialog,
    } as never);
  });

  it("does not render when tagQuickDialogFeedId is null", () => {
    render(<TagQuickDialog />);
    expect(screen.queryByTestId("tag-quick-dialog")).toBeNull();
  });

  it("opens against the target feed and shows its existing tags", () => {
    useFeedStore.setState({
      feeds: [feed({ tags: ["tech"] })],
      tagQuickDialogFeedId: "f-tech",
    } as never);
    render(<TagQuickDialog />);
    expect(screen.getByTestId("tag-quick-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Tech Crunchies/)).toBeInTheDocument();
    expect(screen.getByTestId("tag-pill-tech")).toBeInTheDocument();
  });

  it("Save persists the draft via setFeedTags and closes the dialog", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed()],
      tagQuickDialogFeedId: "f-tech",
    } as never);
    render(<TagQuickDialog />);

    const input = screen.getByTestId("tag-quick-dialog-picker-input");
    await user.type(input, "news,");
    await user.click(screen.getByTestId("tag-quick-dialog-save"));

    expect(setFeedTags).toHaveBeenCalledWith("f-tech", ["news"]);
    expect(closeTagQuickDialog).toHaveBeenCalled();
  });

  it("Cancel closes without calling setFeedTags", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed({ tags: ["tech"] })],
      tagQuickDialogFeedId: "f-tech",
    } as never);
    render(<TagQuickDialog />);

    await user.click(screen.getByTestId("tag-quick-dialog-cancel"));
    expect(setFeedTags).not.toHaveBeenCalled();
    expect(closeTagQuickDialog).toHaveBeenCalled();
  });

  it("Save is disabled until the tag list actually changes", async () => {
    useFeedStore.setState({
      feeds: [feed({ tags: ["tech"] })],
      tagQuickDialogFeedId: "f-tech",
    } as never);
    render(<TagQuickDialog />);

    expect(screen.getByTestId("tag-quick-dialog-save")).toBeDisabled();
  });
});
