/**
 * Tier-gating behaviour of FeedSettingsDialog: the prefetch toggle and the
 * rules editor entry point. Both gate via the matrix through
 * useFeatureGate, so a Free user (once the paid tier is live) sees the
 * control locked and routed to upgrade rather than a silent dead control.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { FeedSettingsDialog } from "@/components/feeds/feed-settings-dialog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import { isSelfHosted } from "@/core/features/self-hosted.ts";
import { isPaidTierActive } from "@/core/features/paid-tier-active.ts";
import type { Feed } from "@/types/index.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  addFolder: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
}));
vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));
vi.mock("@/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn(),
  prefetchFeedArticles: vi.fn(),
  selectFrequentFeeds: vi.fn(() => []),
}));
vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));
vi.mock("@/core/features/self-hosted.ts", () => ({ isSelfHosted: vi.fn(() => false) }));
vi.mock("@/core/features/paid-tier-active.ts", () => ({ isPaidTierActive: vi.fn(() => false) }));

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

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function renderDialog() {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route path="*" element={<><FeedSettingsDialog /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FeedSettingsDialog — tier gating", () => {
  let openRulesEditor: ReturnType<typeof vi.fn>;
  let setFeedPrefetchEnabled: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    openRulesEditor = vi.fn();
    setFeedPrefetchEnabled = vi.fn().mockResolvedValue(undefined);
    useFeedStore.setState({
      feeds: [feed()],
      folders: [],
      feedSettingsDialogId: "f-tech",
      openRulesEditor,
      setFeedPrefetchEnabled,
    });
    useLicenseStore.setState({ tier: "free", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
    vi.mocked(isPaidTierActive).mockReturnValue(true);
  });

  it("locks the prefetch toggle for a Free user and shows the lock badge", () => {
    renderDialog();
    const toggle = screen.getByTestId("feed-settings-prefetch");
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId("tier-lock-offline-prefetch")).toBeInTheDocument();
  });

  it("routes the rules editor to upgrade for a Free user (does not open the editor)", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("feed-settings-manage-rules"));
    expect(openRulesEditor).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/settings"),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("tab=subscription");
  });

  it("enables the prefetch toggle and opens the rules editor for a Personal user", async () => {
    useLicenseStore.setState({ tier: "personal" });
    renderDialog();
    expect(screen.getByTestId("feed-settings-prefetch")).not.toBeDisabled();
    expect(screen.queryByTestId("tier-lock-offline-prefetch")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("feed-settings-manage-rules"));
    expect(openRulesEditor).toHaveBeenCalledWith("f-tech");
  });

  it("passes through when the paid tier is dormant (pre-launch)", () => {
    vi.mocked(isPaidTierActive).mockReturnValue(false);
    renderDialog();
    expect(screen.getByTestId("feed-settings-prefetch")).not.toBeDisabled();
    expect(screen.queryByTestId("tier-lock-offline-prefetch")).toBeNull();
  });
});
