/**
 * ImportView — folder preservation on OPML import (PR E).
 *
 * Verifies the end-to-end wire-up: an OPML file with `<outline text="Tech">`
 * parent groups results in folder creation and per-feed folder assignment.
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

const FOLDERED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Organized</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="TechCrunch" xmlUrl="https://techcrunch.com/feed/"/>
      <outline type="rss" text="Ars" xmlUrl="https://feeds.arstechnica.com/arstechnica/features"/>
    </outline>
    <outline text="News">
      <outline type="rss" text="BBC" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml"/>
    </outline>
    <outline type="rss" text="Unfiled" xmlUrl="https://example.com/unfiled.xml"/>
  </body>
</opml>`;

describe("ImportView — preserves OPML folder structure (PR E)", () => {
  let addFeedMock: ReturnType<typeof vi.fn>;
  let createFolderMock: ReturnType<typeof vi.fn>;
  let moveFeedToFolderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    addFeedMock = vi.fn().mockImplementation(async (url: string) => {
      // Simulate the post-add state: each addFeed appends a feed with the
      // matching URL so the importer can look up its id afterward.
      const newId = `feed-${useFeedStore.getState().feeds.length}`;
      useFeedStore.setState((s) => ({
        feeds: [
          ...s.feeds,
          {
            id: newId,
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
      createFolder: createFolderMock,
      moveFeedToFolder: moveFeedToFolderMock,
    } as never);
    useImportStore.getState().reset();
  });

  it("creates one folder per unique folderName and assigns feeds into them", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);

    await user.click(screen.getByLabelText(/paste text/i));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(FOLDERED_OPML);
    await user.click(screen.getByRole("button", { name: /^import feeds$/i }));
    // Confirm the preview screen — see ImportPreview, added 2026-05-24.
    await user.click(await screen.findByRole("button", { name: /^import \d+ feeds?$/i }));

    // Three feeds inside folders + one unfiled
    expect(addFeedMock).toHaveBeenCalledTimes(4);

    // Two folders created (Tech, News) — exactly once each
    const folderNames = createFolderMock.mock.calls.map((c) => c[0]);
    expect(folderNames).toContain("Tech");
    expect(folderNames).toContain("News");
    expect(folderNames.length).toBe(2);

    // Each foldered feed got moveFeedToFolder called with its folder id
    const moveCalls = moveFeedToFolderMock.mock.calls.map((c) => ({
      feedId: c[0],
      folderId: c[1],
    }));
    expect(moveCalls.some((c) => c.folderId === "fld-tech")).toBe(true);
    expect(moveCalls.some((c) => c.folderId === "fld-news")).toBe(true);
    // The unfiled feed must NOT have been moved into any folder
    expect(moveCalls.length).toBe(3);
  });
});
