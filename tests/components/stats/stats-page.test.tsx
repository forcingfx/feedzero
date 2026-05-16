import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StatsPage } from "../../../src/components/stats/stats-page.tsx";

function fetchMockResponses(map: Record<string, unknown>) {
  return vi.fn(async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const path = new URL(url, "http://localhost").pathname + new URL(url, "http://localhost").search;
    for (const [matcher, body] of Object.entries(map)) {
      if (path.includes(matcher)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ ok: false, error: "no mock" }), { status: 404 });
  });
}

function renderStats() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  );
}

const POPULAR_FEEDS = [
  {
    url: "https://news.ycombinator.com/rss",
    title: "Hacker News",
    description: "Links for the intellectually curious",
    siteUrl: "https://news.ycombinator.com",
    status: "active",
    requestCount: 1234,
    lastRequestedAt: "2026-05-02T00:00:00Z",
    lastCrawledAt: null,
    errorCount: 0,
    lastError: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    url: "https://example.com/rss",
    title: "Example Blog",
    description: null,
    siteUrl: "https://example.com",
    status: "active",
    requestCount: 4,
    lastRequestedAt: "2026-05-02T00:00:00Z",
    lastCrawledAt: null,
    errorCount: 0,
    lastError: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

describe("StatsPage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows the FeedZero brand mark next to the page title", async () => {
    globalThis.fetch = fetchMockResponses({
      "action=popular": { ok: true, feeds: [] },
      "action=count": { ok: true, count: 0 },
      "stats-sync": { ok: true, vaults: 0 },
    });
    renderStats();
    await waitFor(() => {
      expect(screen.getByText(/FeedZero stats/i)).toBeInTheDocument();
    });
    expect(
      document.body.querySelector("img[src='/icon-192.png']"),
    ).not.toBeNull();
  });

  it("renders headline numbers (vault count and feed count)", async () => {
    globalThis.fetch = fetchMockResponses({
      "action=popular": { ok: true, feeds: POPULAR_FEEDS },
      "action=count": { ok: true, count: 2415 },
      "stats-sync": { ok: true, vaults: 87 },
    });
    renderStats();
    await waitFor(() => {
      expect(screen.getByTestId("stat-vaults")).toHaveTextContent("87");
      expect(screen.getByTestId("stat-feeds")).toHaveTextContent(/2,?415/);
    });
  });

  it("renders the top-feeds leaderboard with subscriber counts (including <5)", async () => {
    globalThis.fetch = fetchMockResponses({
      "action=popular": { ok: true, feeds: POPULAR_FEEDS },
      "action=count": { ok: true, count: 2 },
      "stats-sync": { ok: true, vaults: 1 },
    });
    renderStats();
    const table = await screen.findByTestId("stats-leaderboard");
    expect(within(table).getByText("Hacker News")).toBeInTheDocument();
    expect(within(table).getByText("Example Blog")).toBeInTheDocument();
    expect(within(table).getByText(/1,?234/)).toBeInTheDocument();
    // No k-anonymity floor — show entries with low counts too.
    expect(within(table).getByText("4")).toBeInTheDocument();
  });

  it("requests the popular endpoint with a limit", async () => {
    const fetchSpy = fetchMockResponses({
      "action=popular": { ok: true, feeds: [] },
      "action=count": { ok: true, count: 0 },
      "stats-sync": { ok: true, vaults: 0 },
    });
    globalThis.fetch = fetchSpy;
    renderStats();
    await waitFor(() => {
      const popularCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).includes("action=popular"),
      );
      expect(popularCall).toBeDefined();
      expect(String(popularCall![0])).toMatch(/limit=\d+/);
    });
  });

  it("renders an error state if any of the three endpoints fail", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "boom" }), { status: 500 }),
    );
    renderStats();
    await waitFor(() => {
      expect(screen.getByTestId("stats-error")).toBeInTheDocument();
    });
  });

  it("degrades gracefully when /api/catalog is missing (self-hosted mode without catalog backend)", async () => {
    // Self-hosters who haven't wired Upstash catalog storage get 404s on
    // /api/catalog/*. The page should still render the local stats it CAN
    // resolve (vault count) instead of bricking the whole route.
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/stats-sync")) {
        return new Response(JSON.stringify({ ok: true, vaults: 7 }), { status: 200 });
      }
      // /api/catalog/* — not configured in this deployment
      return new Response(JSON.stringify({ ok: false, error: "not configured" }), { status: 404 });
    });
    renderStats();
    await waitFor(() => {
      // Vault count still renders
      expect(screen.getByText(/7/)).toBeInTheDocument();
    });
    // No "Couldn't load stats" hard error
    expect(screen.queryByTestId("stats-error")).toBeNull();
  });

  it("renders a loading state initially", async () => {
    let resolvePopular: (value: Response) => void;
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("action=popular")) {
        return new Promise<Response>((resolve) => {
          resolvePopular = resolve;
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const { container } = renderStats();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    resolvePopular!(
      new Response(JSON.stringify({ ok: true, feeds: [] }), { status: 200 }),
    );
  });
});
