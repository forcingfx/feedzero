import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QuotaIndicator } from "@/components/feeds/quota-indicator";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(() => false),
}));

import { isSelfHosted } from "@/core/features/self-hosted";

function renderInRouter() {
  return render(
    <MemoryRouter>
      <QuotaIndicator />
    </MemoryRouter>,
  );
}

function seedFeeds(count: number): void {
  const feeds = Array.from({ length: count }, (_, i) => ({
    id: `feed-${i}`,
    url: `https://example.com/${i}.xml`,
    title: `Feed ${i}`,
    description: "",
    lastUpdated: 0,
  }));
  useFeedStore.setState({
    feeds: feeds as never,
    selectedFeedId: null,
    isLoading: false,
    error: null,
  });
}

describe("QuotaIndicator", () => {
  beforeEach(() => {
    seedFeeds(0);
    useLicenseStore.setState({ tier: "free", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
  });

  it("renders nothing for paid users (no quota applies)", () => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    seedFeeds(12);
    const { container } = renderInRouter();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for self-hosted users (operator bypass)", () => {
    vi.mocked(isSelfHosted).mockReturnValue(true);
    seedFeeds(40);
    const { container } = renderInRouter();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current count vs limit for free hosted users", () => {
    seedFeeds(7);
    renderInRouter();
    // Tolerant of "7 / 25", "7 of 25", "7 / 25 feeds" etc.
    expect(screen.getByText(/\b7\b/)).toBeInTheDocument();
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it("offers an Upgrade link when at or above the limit", () => {
    seedFeeds(25);
    renderInRouter();
    const upgrade = screen.getByRole("link", { name: /upgrade/i });
    expect(upgrade.getAttribute("href")).toMatch(/subscribe=personal-monthly/);
  });

  it("does not offer an Upgrade link below the limit", () => {
    seedFeeds(20);
    renderInRouter();
    expect(screen.queryByRole("link", { name: /upgrade/i })).toBeNull();
  });
});
