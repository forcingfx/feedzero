/**
 * Audit 2026-Q4, round 2, rule 3. The desktop sidebar had two "create"
 * rows ("New filter" above the filters, "New folder" under the feeds)
 * that looked like navigation and sat far apart. Both now live in one
 * "+" menu in the sidebar header, next to search and refresh, together
 * with the add-feed entry point.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "@/components/layout/app-sidebar.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import type { Feed } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  removeFeed: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addFolder: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));
vi.mock("@/core/feeds/feed-service.ts", () => ({ addFeedFlow: vi.fn(), refreshFeed: vi.fn(), refreshAllFeeds: vi.fn() }));
vi.mock("@/core/sync/sync-service", () => ({ pushVault: vi.fn(), pullVault: vi.fn(), importVault: vi.fn() }));
// Paid tier launched, hosted: the filters gate enforces the tier check.
vi.mock("@/core/features/paid-tier-active.ts", () => ({ isPaidTierActive: vi.fn(() => true) }));
vi.mock("@/core/features/self-hosted.ts", () => ({ isSelfHosted: vi.fn(() => false) }));

function Probe() {
  const { pathname } = useLocation();
  return <div data-testid="probe-path">{pathname}</div>;
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route path="*" element={<SidebarProvider><AppSidebar /><Probe /></SidebarProvider>} />
      </Routes>
    </MemoryRouter>,
  );
}

const feed: Feed = { id: "f1", url: "https://a.com/rss", title: "A", description: "", siteUrl: "https://a.com", createdAt: 0, updatedAt: 0 };

async function openAddMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^add$/i }));
  return user;
}

describe("sidebar '+' menu", () => {
  beforeEach(() => {
    useFeedStore.setState({ feeds: [feed], folders: [], selectedFeedId: null, isLoading: false, error: null, folderCreatorOpen: false });
    useSmartFilterStore.setState({ filters: [], isLoading: false, editorOpen: false, editorTarget: null });
    useLicenseStore.setState({ tier: "personal", verifying: false });
  });

  it("offers Add feed, New folder and New filter in one menu", async () => {
    renderSidebar();
    await openAddMenu();
    expect(await screen.findByRole("menuitem", { name: /add feed/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /new folder/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /new filter/i })).toBeInTheDocument();
  });

  it("the sidebar body no longer carries 'New filter' and 'New folder' rows", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /new filter/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /new folder/i })).toBeNull();
  });

  it("New folder is disabled while there are no feeds (the feed list, and its input, is not shown)", async () => {
    useFeedStore.setState({ feeds: [] });
    renderSidebar();
    await openAddMenu();
    expect(await screen.findByRole("menuitem", { name: /new folder/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("Add feed goes to Explore", async () => {
    renderSidebar();
    const user = await openAddMenu();
    await user.click(await screen.findByRole("menuitem", { name: /add feed/i }));
    expect(screen.getByTestId("probe-path")).toHaveTextContent("/explore");
  });

  it("New folder reveals the folder-name input in the feed list", async () => {
    renderSidebar();
    const user = await openAddMenu();
    await user.click(await screen.findByRole("menuitem", { name: /new folder/i }));
    expect(await screen.findByPlaceholderText("Folder name")).toBeInTheDocument();
  });

  it("New filter opens the editor for a Personal user", async () => {
    renderSidebar();
    const user = await openAddMenu();
    await user.click(await screen.findByRole("menuitem", { name: /new filter/i }));
    expect(useSmartFilterStore.getState().editorOpen).toBe(true);
    expect(useSmartFilterStore.getState().editorTarget).toBeNull();
  });

  it("New filter stays visible to free users and routes to the upgrade page instead of opening the editor", async () => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    renderSidebar();
    const user = await openAddMenu();
    await user.click(await screen.findByRole("menuitem", { name: /new filter/i }));
    expect(useSmartFilterStore.getState().editorOpen).toBe(false);
    expect(screen.getByTestId("probe-path")).toHaveTextContent("/settings");
  });
});
