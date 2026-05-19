import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { lazy, Suspense } from "react";

vi.mock("../../../src/stores/app-store.ts", () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ isDbReady: true, error: null, hasCompletedOnboarding: true }),
    { getState: () => ({ isDbReady: true, error: null, hasCompletedOnboarding: true, setError: vi.fn() }) },
  ),
}));

import { AppLayout } from "../../../src/pages/app-layout.tsx";
import { StageView } from "../../../src/pages/stage-view.tsx";
import { useFeedStore } from "../../../src/stores/feed-store.ts";

const StatsPage = lazy(() =>
  import("../../../src/components/stats/stats-page.tsx").then((m) => ({
    default: m.StatsPage,
  })),
);

function StatsRoute() {
  return (
    <StageView>
      <Suspense>
        <StatsPage />
      </Suspense>
    </StageView>
  );
}

describe("/stats route via AppLayout", () => {
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
          <Route element={<AppLayout />}>
            <Route path="/stats" element={<StatsRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/FeedZero stats/i)).toBeInTheDocument();
    });
  });
});
