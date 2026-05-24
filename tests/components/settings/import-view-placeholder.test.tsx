/**
 * ImportView — placeholder behaviour on recoverable fetch failure.
 *
 * When bulk import hits a rate-limited or transient-failed URL, the row
 * should be persisted as a placeholder feed (via the store's
 * addPlaceholderFeed action) and moved into its OPML folder. The user
 * can then hit `r` later to retry. Parse / discovery failures stay
 * rejected because refresh can't recover them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportView } from "@/components/settings/import-view";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";
import { useImportStore } from "@/stores/import-store";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(() => false),
}));
vi.mock("@/core/features/paid-tier-active", () => ({
  isPaidTierActive: vi.fn(() => true),
}));

const MIXED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Mixed</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="OK" xmlUrl="https://ok.example.com/feed/"/>
      <outline type="rss" text="Rate-limited" xmlUrl="https://rl.example.com/feed/"/>
      <outline type="rss" text="Not a feed" xmlUrl="https://notfeed.example.com"/>
    </outline>
  </body>
</opml>`;

describe("ImportView — placeholder feeds on recoverable fetch failure", () => {
  let addFeedMock: ReturnType<typeof vi.fn>;
  let addPlaceholderFeedMock: ReturnType<typeof vi.fn>;
  let createFolderMock: ReturnType<typeof vi.fn>;
  let moveFeedToFolderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLicenseStore.setState({ tier: "personal", verifying: false });

    // addFeed: succeeds for ok.*, returns fetch-failure for rl.*,
    // returns permanent failure for notfeed.*. Each successful add (real
    // or placeholder) appends a feed so the importer can look it up.
    addFeedMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("https://ok.")) {
        const id = `feed-${useFeedStore.getState().feeds.length}`;
        useFeedStore.setState((s) => ({
          feeds: [
            ...s.feeds,
            {
              id,
              url,
              title: "OK",
              description: "",
              siteUrl: "",
              createdAt: 0,
              updatedAt: 0,
            },
          ] as never,
        }));
        return { ok: true };
      }
      if (url.startsWith("https://rl.")) {
        return { ok: false, error: "HTTP 429", reason: "fetch-failure" };
      }
      return { ok: false, error: "Not a valid feed" };
    });

    addPlaceholderFeedMock = vi.fn().mockImplementation(
      async (url: string, error: string) => {
        const id = `feed-${useFeedStore.getState().feeds.length}`;
        const feed = {
          id,
          url,
          title: "rl.example.com",
          description: "",
          siteUrl: "",
          createdAt: 0,
          updatedAt: 0,
          lastError: error,
        };
        useFeedStore.setState((s) => ({
          feeds: [...s.feeds, feed] as never,
        }));
        return { ok: true, value: feed };
      },
    );

    createFolderMock = vi.fn().mockImplementation(async (name: string) => {
      const id = `fld-${name.toLowerCase()}`;
      useFeedStore.setState((s) => ({
        folders: [...(s.folders ?? []), { id, name, createdAt: 0 }] as never,
      }));
    });
    moveFeedToFolderMock = vi.fn().mockResolvedValue(undefined);

    useFeedStore.setState({
      feeds: [],
      folders: [],
      addFeed: addFeedMock,
      addPlaceholderFeed: addPlaceholderFeedMock,
      createFolder: createFolderMock,
      moveFeedToFolder: moveFeedToFolderMock,
    } as never);
    useImportStore.getState().reset();
  });

  it("creates a placeholder for fetch-failure URLs and assigns them to the OPML folder", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);

    await user.click(screen.getByLabelText(/paste text/i));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(MIXED_OPML);
    await user.click(screen.getByRole("button", { name: /^import feeds$/i }));
    // Confirm the preview screen — see ImportPreview, added 2026-05-24.
    await user.click(await screen.findByRole("button", { name: /^import \d+ feeds?$/i }));

    // The placeholder action was called exactly for the rate-limited URL,
    // with the upstream error message.
    expect(addPlaceholderFeedMock).toHaveBeenCalledTimes(1);
    expect(addPlaceholderFeedMock).toHaveBeenCalledWith(
      "https://rl.example.com/feed/",
      "HTTP 429",
    );

    // Both the OK feed AND the placeholder ended up in the Tech folder.
    // The "Not a valid feed" row stays rejected and is not moved.
    const moveCalls = moveFeedToFolderMock.mock.calls.map((c) => ({
      feedId: c[0],
      folderId: c[1],
    }));
    expect(moveCalls.length).toBe(2);
    for (const call of moveCalls) {
      expect(call.folderId).toBe("fld-tech");
    }

    // Results pane shows the 3-bucket breakdown.
    expect(
      await screen.findByText(/1 feed added.*1 queued for retry.*1 failed/i),
    ).toBeDefined();
  });
});
