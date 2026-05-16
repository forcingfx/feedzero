import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { AutoOrganizePill } from "@/components/folders/auto-organize-pill";
import { useFeedStore } from "@/stores/feed-store";
import { useArticleStore } from "@/stores/article-store";
import { useLicenseStore } from "@/stores/license-store";
import { isSelfHosted } from "@/core/features/self-hosted";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(() => false),
}));

vi.mock("@/core/features/paid-tier-active", () => ({
  // Free-tier gating in this suite asserts the post-launch contract.
  // The paid-tier-inactive bypass is exercised in feature-gates.test.ts.
  isPaidTierActive: vi.fn(() => true),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="probe-path">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route path="/feeds" element={<>{ui}<LocationProbe /></>} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFeed: vi.fn(),
  updateFeed: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addFolder: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/stores/sync-store", () => ({
  useSyncStore: {
    getState: () => ({ scheduleSyncPush: vi.fn() }),
  },
}));

const LS_KEY = "feedzero:auto-organize-dismissed-count";

function makeFeed(id: string, folderId?: string) {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: `Feed ${id}`,
    description: "",
    siteUrl: `https://example.com/${id}`,
    folderId,
    createdAt: 0,
    updatedAt: 0,
  };
}

function setFeeds(count: number, foldered = 0) {
  const feeds: ReturnType<typeof makeFeed>[] = [];
  for (let i = 0; i < count; i++) {
    feeds.push(makeFeed(`f${i}`, i < foldered ? "fold-x" : undefined));
  }
  useFeedStore.setState({ feeds, folders: [] });
}

describe("AutoOrganizePill (wand trigger + popover)", () => {
  beforeEach(() => {
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    localStorageMock.clear();
    vi.clearAllMocks();
    // Default these tests to a paid Personal user — they assert the
    // happy-path UI. Free / self-hosted variants live in their own
    // describe blocks below.
    useLicenseStore.setState({ tier: "personal", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
  });

  it("renders a wand trigger when there are more than 10 unfiled feeds", () => {
    setFeeds(12, 0);
    renderWithRouter(<AutoOrganizePill />);
    expect(screen.getByTestId("auto-organize-trigger")).toBeInTheDocument();
  });

  it("does not render when there are 10 or fewer feeds", () => {
    setFeeds(10, 0);
    renderWithRouter(<AutoOrganizePill />);
    expect(screen.queryByTestId("auto-organize-trigger")).toBeNull();
  });

  it("does not render when all feeds are already in folders", () => {
    setFeeds(15, 15);
    renderWithRouter(<AutoOrganizePill />);
    expect(screen.queryByTestId("auto-organize-trigger")).toBeNull();
  });

  it("clicking the wand opens a popover with auto-organize content", async () => {
    const user = userEvent.setup();
    setFeeds(12, 0);
    renderWithRouter(<AutoOrganizePill />);

    await user.click(screen.getByTestId("auto-organize-trigger"));

    expect(screen.getByTestId("auto-organize-popover")).toBeInTheDocument();
  });

  it("popover has an action button that opens the auto-organize dialog", async () => {
    const user = userEvent.setup();
    setFeeds(12, 0);
    renderWithRouter(<AutoOrganizePill />);

    await user.click(screen.getByTestId("auto-organize-trigger"));
    await user.click(screen.getByTestId("auto-organize-open-dialog"));

    expect(
      screen.getByRole("heading", { name: /Auto-organize feeds/i }),
    ).toBeInTheDocument();
  });

  it("wand trigger has a violet color scheme", () => {
    setFeeds(12, 0);
    renderWithRouter(<AutoOrganizePill />);
    const trigger = screen.getByTestId("auto-organize-trigger");
    expect(trigger.className).toMatch(/violet/);
  });

  describe("dismiss behavior", () => {
    it("popover has a dismiss action", async () => {
      const user = userEvent.setup();
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);

      await user.click(screen.getByTestId("auto-organize-trigger"));

      expect(screen.getByTestId("auto-organize-dismiss")).toBeInTheDocument();
    });

    it("clicking dismiss hides the wand trigger", async () => {
      const user = userEvent.setup();
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);

      await user.click(screen.getByTestId("auto-organize-trigger"));
      await user.click(screen.getByTestId("auto-organize-dismiss"));

      expect(screen.queryByTestId("auto-organize-trigger")).toBeNull();
    });

    it("stores the unfiled count in localStorage on dismiss", async () => {
      const user = userEvent.setup();
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);

      await user.click(screen.getByTestId("auto-organize-trigger"));
      await user.click(screen.getByTestId("auto-organize-dismiss"));

      expect(localStorage.getItem(LS_KEY)).toBe("12");
    });

    it("stays hidden after dismiss when unfiled count has not grown significantly", () => {
      localStorage.setItem(LS_KEY, "12");
      setFeeds(13, 0);
      renderWithRouter(<AutoOrganizePill />);
      expect(screen.queryByTestId("auto-organize-trigger")).toBeNull();
    });

    it("re-shows when 5 or more new unfiled feeds have been added since dismiss", () => {
      localStorage.setItem(LS_KEY, "12");
      setFeeds(17, 0);
      renderWithRouter(<AutoOrganizePill />);
      expect(screen.getByTestId("auto-organize-trigger")).toBeInTheDocument();
    });

    it("clears dismiss when the user organizes feeds below the dismissed count", () => {
      localStorage.setItem(LS_KEY, "12");
      setFeeds(8, 0);
      renderWithRouter(<AutoOrganizePill />);
      expect(localStorage.getItem(LS_KEY)).toBeNull();
    });
  });

  describe("free-tier hosted user (auto-organize is a Personal feature)", () => {
    beforeEach(() => {
      useLicenseStore.setState({ tier: "free" });
      vi.mocked(isSelfHosted).mockReturnValue(false);
    });

    it("still renders the wand trigger so the upgrade prompt is discoverable", () => {
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);
      expect(screen.getByTestId("auto-organize-trigger")).toBeInTheDocument();
    });

    it("clicking the wand opens a popover with an Upgrade CTA instead of Organize now", async () => {
      const user = userEvent.setup();
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);
      await user.click(screen.getByTestId("auto-organize-trigger"));

      expect(screen.getByTestId("auto-organize-upgrade-cta")).toBeInTheDocument();
      expect(screen.queryByTestId("auto-organize-open-dialog")).toBeNull();
    });

    it("clicking the Upgrade CTA opens Settings → Account (via openUpgrade chokepoint)", async () => {
      // Was: route to /?subscribe=personal-monthly (straight to Stripe).
      // Now: open the unified Settings dialog on Account so the user sees
      // the Plan card with full tier comparison before committing.
      const { useSettingsStore } = await import("@/stores/settings-store.ts");
      useSettingsStore.setState({ open: false, activeTab: "help" });
      const user = userEvent.setup();
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);
      await user.click(screen.getByTestId("auto-organize-trigger"));
      await user.click(screen.getByTestId("auto-organize-upgrade-cta"));

      const s = useSettingsStore.getState();
      expect(s.open).toBe(true);
      expect(s.activeTab).toBe("account");
    });
  });

  describe("self-hosted build (VITE_SELF_HOSTED=1)", () => {
    beforeEach(() => {
      useLicenseStore.setState({ tier: "free" });
      vi.mocked(isSelfHosted).mockReturnValue(true);
    });

    it("shows the Organize now CTA regardless of tier", async () => {
      const user = userEvent.setup();
      setFeeds(12, 0);
      renderWithRouter(<AutoOrganizePill />);
      await user.click(screen.getByTestId("auto-organize-trigger"));

      expect(screen.getByTestId("auto-organize-open-dialog")).toBeInTheDocument();
      expect(screen.queryByTestId("auto-organize-upgrade-cta")).toBeNull();
    });
  });
});
