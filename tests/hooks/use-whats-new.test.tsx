/**
 * useWhatsNew — navigates to (or auto-subscribes + navigates to) the
 * release-notes feed. Lifted from app-sidebar's handleWhatsNew so both
 * the sidebar AND Settings → Help can trigger the same flow.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useWhatsNew } from "@/hooks/use-whats-new";
import { useFeedStore } from "@/stores/feed-store";
import { CHANGELOG_FEED_URL } from "@feedzero/core/utils/constants";

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("useWhatsNew", () => {
  beforeEach(() => {
    useFeedStore.setState({ feeds: [], selectedFeedId: null });
  });

  it("when subscribed already, selects the changelog feed (no addFeed call)", async () => {
    const addFeed = vi.fn();
    const selectFeed = vi.fn();
    useFeedStore.setState({
      feeds: [
        {
          id: "feed-changelog",
          url: CHANGELOG_FEED_URL,
          title: "FeedZero release notes",
          description: "",
          siteUrl: "",
          createdAt: 0,
          updatedAt: 0,
        },
      ] as never,
      addFeed,
      selectFeed,
    });
    const { result } = renderHook(() => useWhatsNew(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(addFeed).not.toHaveBeenCalled();
    expect(selectFeed).toHaveBeenCalledWith("feed-changelog");
  });

  it("when not subscribed, calls addFeed with the changelog URL", async () => {
    const addFeed = vi.fn().mockResolvedValue({ ok: true });
    useFeedStore.setState({ feeds: [], addFeed } as never);
    const { result } = renderHook(() => useWhatsNew(), { wrapper });
    await act(async () => {
      await result.current();
    });
    expect(addFeed).toHaveBeenCalledWith(CHANGELOG_FEED_URL);
  });

  it("silently swallows network errors (best-effort subscribe)", async () => {
    const addFeed = vi.fn().mockRejectedValue(new Error("offline"));
    useFeedStore.setState({ feeds: [], addFeed } as never);
    const { result } = renderHook(() => useWhatsNew(), { wrapper });
    // Must not throw
    await expect(
      act(async () => {
        await result.current();
      }),
    ).resolves.not.toThrow();
  });
});
