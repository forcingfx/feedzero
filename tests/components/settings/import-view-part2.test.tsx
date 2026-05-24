/**
 * ImportView — Part 2 of the OPML field audit.
 *
 * Verifies the full pipeline: nested folder paths materialize into a
 * `Folder.parentId` tree, OPML `outline[category]` rides through to
 * `addFeed({ tags })`, `outline[description]` rides through as
 * `descriptionFallback`, `outline[created]` rides through as
 * `createdAtOverride`, and OPML `<head>` metadata surfaces in
 * ImportResults via the import-store.
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

/**
 * OPML that exercises every Part 2 field we harvest:
 *  - Deep nesting: Tech > Frontend > React (parentId chain of 3)
 *  - description: per-feed blurb
 *  - category: comma-separated → tags array
 *  - created: provenance timestamp
 *  - <head> title/dateCreated/ownerName: surfaces in ImportResults
 */
const RICH_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Maciek's Subscriptions</title>
    <dateCreated>Fri, 24 May 2026 10:00:00 GMT</dateCreated>
    <ownerName>Maciek</ownerName>
  </head>
  <body>
    <outline text="Tech">
      <outline text="Frontend">
        <outline type="rss" text="React Blog" xmlUrl="https://reactjs.org/feed" description="From the React team" category="tech, react" created="2018-03-14T12:00:00Z"/>
      </outline>
      <outline type="rss" text="HN" xmlUrl="https://news.ycombinator.com/rss" category="news, tech"/>
    </outline>
    <outline type="rss" text="Top-level" xmlUrl="https://example.com/feed"/>
  </body>
</opml>`;

describe("ImportView — Part 2 OPML field harvesting", () => {
  let addFeedMock: ReturnType<typeof vi.fn>;
  let createFolderMock: ReturnType<typeof vi.fn>;
  let moveFeedToFolderMock: ReturnType<typeof vi.fn>;

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
    createFolderMock = vi
      .fn()
      .mockImplementation(async (name: string, parentId?: string) => {
        const id = `fld-${useFeedStore.getState().folders.length}`;
        useFeedStore.setState((s) => ({
          folders: [
            ...(s.folders ?? []),
            { id, name, createdAt: 0, parentId } as never,
          ],
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

  it("threads description / tags / createdAt into addFeed options", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await user.click(screen.getByLabelText(/paste text/i));
    await user.click(screen.getByPlaceholderText(/paste opml/i));
    await user.paste(RICH_OPML);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));

    expect(addFeedMock).toHaveBeenCalledTimes(3);
    const reactCall = addFeedMock.mock.calls.find(
      (c) => c[0] === "https://reactjs.org/feed",
    );
    expect(reactCall).toBeDefined();
    expect(reactCall![1]).toEqual(
      expect.objectContaining({
        titleOverride: "React Blog",
        descriptionFallback: "From the React team",
        tags: ["tech", "react"],
        createdAtOverride: Date.parse("2018-03-14T12:00:00Z"),
      }),
    );

    const hnCall = addFeedMock.mock.calls.find(
      (c) => c[0] === "https://news.ycombinator.com/rss",
    );
    expect(hnCall![1]).toEqual(
      expect.objectContaining({
        titleOverride: "HN",
        tags: ["news", "tech"],
      }),
    );
    // HN has no description / created → those fields shouldn't be set.
    expect(hnCall![1].descriptionFallback).toBeUndefined();
    expect(hnCall![1].createdAtOverride).toBeUndefined();
  });

  it("materializes nested folder tree with Folder.parentId chain", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await user.click(screen.getByLabelText(/paste text/i));
    await user.click(screen.getByPlaceholderText(/paste opml/i));
    await user.paste(RICH_OPML);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));

    // createFolder called twice — Tech (top-level), Frontend (under Tech).
    expect(createFolderMock).toHaveBeenCalledTimes(2);

    const techCall = createFolderMock.mock.calls.find((c) => c[0] === "Tech");
    expect(techCall).toBeDefined();
    expect(techCall![1]).toBeUndefined(); // top-level

    const frontendCall = createFolderMock.mock.calls.find(
      (c) => c[0] === "Frontend",
    );
    expect(frontendCall).toBeDefined();
    // Parent id is the id of the Tech folder we just created.
    const techFolder = useFeedStore
      .getState()
      .folders.find((f) => f.name === "Tech");
    expect(frontendCall![1]).toBe(techFolder!.id);
  });

  it("captures OPML <head> metadata into the import-store for ImportResults", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await user.click(screen.getByLabelText(/paste text/i));
    await user.click(screen.getByPlaceholderText(/paste opml/i));
    await user.paste(RICH_OPML);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));

    const head = useImportStore.getState().head;
    expect(head).not.toBeNull();
    expect(head!.title).toBe("Maciek's Subscriptions");
    expect(head!.ownerName).toBe("Maciek");
    expect(head!.dateCreated).toBeDefined();

    // ImportResults renders the provenance line.
    const line = await screen.findByTestId("opml-head-line");
    expect(line.textContent).toMatch(/from Maciek/);
    expect(line.textContent).toMatch(/Maciek's Subscriptions/);
  });
});
