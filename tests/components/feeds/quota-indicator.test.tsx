import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { QuotaIndicator } from "@/components/feeds/quota-indicator";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(() => false),
}));

import { isSelfHosted } from "@/core/features/self-hosted";
import { FREE_FEED_LIMIT } from "@/core/features/quotas";

/** Matches the indicator's "N / <cap>" string for whatever the cap is. */
const capPattern = () => new RegExp(`/\\s*${FREE_FEED_LIMIT}\\b`);

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function renderInRouter() {
  return render(
    <MemoryRouter initialEntries={["/feeds"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <QuotaIndicator />
              <LocationProbe />
            </>
          }
        />
      </Routes>
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
    renderInRouter();
    // The QuotaIndicator emits a "N / <cap> feeds" string. Its absence is
    // the signal that the indicator was suppressed for this user.
    expect(screen.queryByText(capPattern())).toBeNull();
  });

  it("renders nothing for self-hosted users (operator bypass)", () => {
    vi.mocked(isSelfHosted).mockReturnValue(true);
    seedFeeds(FREE_FEED_LIMIT + 20);
    renderInRouter();
    expect(screen.queryByText(capPattern())).toBeNull();
  });

  it("renders nothing while the quota is comfortably far away (below 80%)", () => {
    // Audit 2026-Q4 round 2: "7 / 100 feeds" was a permanent sidebar line
    // for a fact that only matters when the limit is near.
    seedFeeds(Math.ceil(FREE_FEED_LIMIT * 0.8) - 1);
    renderInRouter();
    expect(screen.queryByTestId("quota-indicator")).toBeNull();
  });

  it("shows the current count vs limit once the quota is near (80% and up)", () => {
    const near = Math.ceil(FREE_FEED_LIMIT * 0.8);
    seedFeeds(near);
    renderInRouter();
    expect(screen.getByText(new RegExp(`\\b${near}\\b`))).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(String(FREE_FEED_LIMIT))),
    ).toBeInTheDocument();
  });

  it("offers an Upgrade button when at or above the limit that navigates to Settings → Subscription", async () => {
    // The Upgrade entry was an <a href="/?subscribe=…"> that jumped straight
    // to Stripe Checkout, bypassing the Plan card. Every in-app upgrade
    // affordance now funnels through goToUpgrade(navigate) → /settings?tab=
    // subscription so the user sees the tier comparison before commitment.
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    seedFeeds(FREE_FEED_LIMIT);
    renderInRouter();
    const upgrade = screen.getByRole("button", { name: /upgrade/i });
    await user.click(upgrade);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/settings?tab=subscription",
    );
  });

  it("does not offer an Upgrade button below the limit", () => {
    seedFeeds(FREE_FEED_LIMIT - 1);
    renderInRouter();
    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull();
  });
});
