import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  open,
  close,
  deleteDatabase,
  addFeed,
  addArticles,
} from "@/core/storage/db";
import { createFeed, createArticle } from "@/core/storage/schema";
import { unwrap } from "@feedzero/core/utils/result";
import { useArticleStore } from "@/stores/article-store";
import { useFeedStore } from "@/stores/feed-store";
import { SYNC } from "@feedzero/core/utils/constants";
import { useSyncStore } from "@/stores/sync-store";
import { VaultHeadroomNotice } from "@/components/settings/vault-headroom-notice";

const LIMIT = SYNC.MAX_PUSH_BODY_SIZE;

describe("VaultHeadroomNotice", () => {
  beforeEach(() => {
    useSyncStore.setState({ status: "synced", lastPushBytes: null });
  });

  it("says nothing until a push has been measured", () => {
    const { container } = render(<VaultHeadroomNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows how much of the limit a vault uses", () => {
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.5) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByText(/of 4\.1 MB/)).toBeInTheDocument();
  });

  it("stays quiet about the limit while there is room", () => {
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.3) });
    render(<VaultHeadroomNotice />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns before pushes start failing", () => {
    // The whole reason this exists: a user who can see the wall coming
    // can act on it, and the alternative is discovering it as a failed
    // sync with no warning at all.
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.9) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(/approaching/i);
  });

  it("says plainly when the vault is over the limit", () => {
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 1.2) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(/too large/i);
  });

  it("names a remedy that actually releases space", () => {
    // Unstarring genuinely releases the copy now, so the copy may say so.
    // It could not before: toggleStar kept extractedContent, and this
    // panel telling users otherwise would repeat the defect the sync
    // error already had.
    useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.9) });
    render(<VaultHeadroomNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(/unstarring/i);
  });

  describe("freeing up space", () => {
    beforeEach(async () => {
      const result = await open("headroom action test");
      if (!result.ok) throw new Error(result.error);
    });

    afterEach(async () => {
      close();
      await deleteDatabase();
    });

    async function seedUnmaintainedCopy(): Promise<string> {
      const feed = unwrap(
        createFeed({ url: "https://example.com/rss", title: "Example" }),
      );
      await addFeed(feed);
      await addArticles([
        {
          ...unwrap(
            createArticle({
              feedId: feed.id,
              title: "Saved",
              link: "https://example.com/1",
            }),
          ),
          starred: false,
          extractedContent: "<p>full text</p>",
          extractedAt: Date.now(),
        },
      ]);
      await useFeedStore.getState().loadFeeds();
      await useArticleStore.getState().preloadAll();
      return feed.id;
    }

    it("offers no cleanup while the vault has room", () => {
      useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.3) });
      render(<VaultHeadroomNotice />);
      expect(
        screen.queryByRole("button", { name: /free up space/i }),
      ).not.toBeInTheDocument();
    });

    it("releases the copies nothing is maintaining when confirmed", async () => {
      // The whole chain the sync error has been promising: a user near
      // the limit presses one button and the space is actually gone.
      const feedId = await seedUnmaintainedCopy();
      useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.9) });
      render(<VaultHeadroomNotice />);

      await userEvent.click(
        screen.getByRole("button", { name: /free up space/i }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /remove offline copies/i }),
      );

      await vi.waitFor(() => {
        expect(
          useArticleStore.getState().articlesByFeedId[feedId]?.[0]
            ?.extractedContent,
        ).toBeUndefined();
      });
    });

    it("keeps the copies when the user backs out", async () => {
      const feedId = await seedUnmaintainedCopy();
      useSyncStore.setState({ lastPushBytes: Math.round(LIMIT * 0.9) });
      render(<VaultHeadroomNotice />);

      await userEvent.click(
        screen.getByRole("button", { name: /free up space/i }),
      );
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(
        useArticleStore.getState().articlesByFeedId[feedId]?.[0]
          ?.extractedContent,
      ).toBe("<p>full text</p>");
    });
  });
});
