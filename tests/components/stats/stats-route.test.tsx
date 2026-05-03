import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("../../../src/stores/app-store.ts", () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ isDbReady: true, error: null, hasCompletedOnboarding: true }),
    { getState: () => ({ isDbReady: true, error: null, hasCompletedOnboarding: true, setError: vi.fn() }) },
  ),
}));

import { FeedsPage } from "../../../src/pages/feeds-page.tsx";
import { useFeedStore } from "../../../src/stores/feed-store.ts";

describe("/stats route via FeedsPage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, feeds: [], count: 0, vaults: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    useFeedStore.setState({ feeds: [] });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders StatsPage when pathname is /stats", async () => {
    render(
      <MemoryRouter initialEntries={["/stats"]}>
        <Routes>
          <Route path="/stats" element={<FeedsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/FeedZero stats/i)).toBeInTheDocument();
    });
  });
});
