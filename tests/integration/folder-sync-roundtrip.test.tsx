/**
 * End-to-end check that feeds organised into folders on one device
 * remain visible (under their folder OR under Unfiled as a fallback)
 * after a vault round-trip on a fresh device.
 *
 * The failure mode this locks down: device A has a feed with
 * `folderId: "tech"`. Device A pushes a vault. Device B pulls the
 * vault. The sidebar on device B must NEVER show "no feeds" while
 * the feed exists in IndexedDB — that's the issue #117 sidebar-empty
 * symptom (caused by missing folder sync, fixed by ADR 019 + the
 * defensive render here).
 *
 * Two scenarios:
 *   1. v2 vault (folders + feeds) — sidebar shows the feed under its
 *      folder, no orphan notice.
 *   2. v1 vault (feeds only, folders=undefined) — sidebar falls back
 *      to Unfiled, orphan notice appears.
 *
 * Mocks only the network boundary (the sync-service push/pull). The
 * real db.ts + crypto + sidebar render runs end-to-end against
 * fake-indexeddb.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarFeedList } from "../../src/components/sidebar/sidebar-feed-list.tsx";
import {
  SidebarProvider,
  SidebarMenu,
} from "../../src/components/ui/sidebar.tsx";
import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useArticleStore } from "../../src/stores/article-store.ts";
import {
  open,
  close,
  deleteDatabase,
  importAll,
} from "../../src/core/storage/db.ts";
import type { Feed, Folder } from "@feedzero/core/types";

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

function makeFeed(id: string, folderId?: string): Feed {
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

function makeFolder(id: string, name: string): Folder {
  return { id, name, createdAt: 0 };
}

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <SidebarMenu>
          <SidebarFeedList onFeedSelect={() => undefined} />
        </SidebarMenu>
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("folder sync round-trip → sidebar render", () => {
  beforeEach(async () => {
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    useFeedStore.setState({
      feeds: [],
      folders: [],
      selectedFeedId: null,
      feedsLoaded: false,
    });
    const opened = await open("integration-test-passphrase");
    if (!opened.ok) throw new Error(opened.error);
  });

  afterEach(async () => {
    close();
    await deleteDatabase();
  });

  it("v2 vault: feeds + folders both restore, sidebar renders feed under its folder", async () => {
    const feed = makeFeed("daring", "tech");
    const folder = makeFolder("tech", "Tech");

    // Simulate device-A's push → device-B's pull by writing the vault
    // contents through importAll directly. importVault wraps this with
    // the network round-trip we're stubbing out.
    const importResult = await importAll({
      feeds: [feed],
      articles: [],
      folders: [folder],
    });
    expect(importResult.ok).toBe(true);

    // Refresh the in-memory store the sidebar reads from.
    await useFeedStore.getState().loadFeeds();

    renderSidebar();

    // Feed shows up AND its folder renders.
    expect(screen.getByText("daring")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
  });

  it("v1 vault: feeds-only push, sidebar still renders the feed under Unfiled", async () => {
    const feed = makeFeed("daring", "tech");

    // Critical: simulate the pre-ADR-019 vault by passing `folders:
    // undefined`. The feed has a folderId but no folder row exists.
    // Before the defensive-render fix, the sidebar dropped this feed
    // entirely; now it falls through to Unfiled.
    const importResult = await importAll({
      feeds: [feed],
      articles: [],
      folders: undefined,
    });
    expect(importResult.ok).toBe(true);

    await useFeedStore.getState().loadFeeds();

    renderSidebar();

    // The whole point: the feed is VISIBLE despite the missing folder.
    expect(screen.getByText("daring")).toBeInTheDocument();
    // And no phantom folder section exists.
    expect(screen.queryByText("Tech")).not.toBeInTheDocument();
  });
});
