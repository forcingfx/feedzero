/**
 * ImportView — OPML outline.title preservation (issue #117).
 *
 * Reporter (DoubtfulYeti592, 2026-05-23) imported an OPML containing
 *   <outline text="CNBC" title="CNBC" xmlUrl="…cnbc.com…"/>
 * but the feed appeared as "International: Top News And Analysis" (the
 * publisher's self-reported feed title). Root cause: import-view.tsx
 * extracted `entry.title` from the OPML but then dropped it before
 * calling `addFeed()`, so addFeedFlow had no choice but to use the
 * parsed feed body's <title>.
 *
 * This test asserts the title is threaded through from OPML →
 * `addFeed(url, { titleOverride })`. The feed-service unit test
 * (`tests/core/feeds/feed-service.test.js`) covers the override-wins
 * semantics on the receiving side.
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

const TITLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Subs</title></head>
  <body>
    <outline text="CNBC" type="rss" xmlUrl="https://www.cnbc.com/id/100727362/device/rss/rss.html" htmlUrl="https://www.cnbc.com/world-top-news/" title="CNBC"/>
    <outline text="The Verge" type="rss" xmlUrl="https://www.theverge.com/rss/index.xml"/>
  </body>
</opml>`;

describe("ImportView — preserves OPML outline.title (issue #117)", () => {
  let addFeedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    addFeedMock = vi.fn().mockImplementation(async (url: string) => {
      const id = `feed-${useFeedStore.getState().feeds.length}`;
      useFeedStore.setState((s) => ({
        feeds: [
          ...s.feeds,
          {
            id,
            url,
            title: url,
            description: "",
            siteUrl: "",
            createdAt: 0,
            updatedAt: 0,
          },
        ] as never,
      }));
      return { ok: true };
    });
    useFeedStore.setState({
      feeds: [],
      folders: [],
      addFeed: addFeedMock,
      createFolder: vi.fn().mockResolvedValue(undefined),
      moveFeedToFolder: vi.fn().mockResolvedValue(undefined),
    } as never);
    useImportStore.getState().reset();
  });

  it("passes outline.title to addFeed as titleOverride", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);

    await user.click(screen.getByLabelText(/paste text/i));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(TITLE_OPML);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));

    expect(addFeedMock).toHaveBeenCalledTimes(2);

    // CNBC outline has an explicit `title="CNBC"` — must thread through.
    const cnbcCall = addFeedMock.mock.calls.find(
      (c) => c[0] === "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    );
    expect(cnbcCall).toBeDefined();
    expect(cnbcCall![1]).toEqual(
      expect.objectContaining({ titleOverride: "CNBC" }),
    );

    // The Verge outline has only `text="The Verge"` (no explicit title attr).
    // OpmlFeedEntry.title falls back to text, so "The Verge" is still the
    // user-chosen label and must thread through too.
    const vergeCall = addFeedMock.mock.calls.find(
      (c) => c[0] === "https://www.theverge.com/rss/index.xml",
    );
    expect(vergeCall).toBeDefined();
    expect(vergeCall![1]).toEqual(
      expect.objectContaining({ titleOverride: "The Verge" }),
    );
  });
});
