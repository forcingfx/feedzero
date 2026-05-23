/**
 * Integration test for ADR 014 follow-up A4-extras: the refresh worker
 * must consume Retry-After. A 429/503 on one feed pauses every other
 * feed on the same host until the indicated time elapses.
 *
 * Tests at the `refreshFeed` boundary mock only the proxy fetch and the
 * DB write paths, then drive real `refreshFeed` calls that interact
 * with the real `host-pause` module.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/core/proxy/proxy-fetch.ts", () => ({
  proxyFetch: vi.fn(),
}));
vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getArticleByGuid: vi.fn(),
  addArticles: vi.fn(),
  updateArticles: vi.fn(),
  updateFeed: vi.fn(async () => ({ ok: true, value: undefined })),
  addFeed: vi.fn(),
  feedExistsByUrl: vi.fn(),
  removeFeedsByUrl: vi.fn(),
  removeArticlesByFeedId: vi.fn(),
  dedupeArticles: vi.fn(),
}));

import { proxyFetch } from "@/core/proxy/proxy-fetch";
import { refreshFeed } from "@/core/feeds/feed-service";
import {
  clearHostPauses,
  hostPausedUntil,
} from "@/core/feeds/host-pause";
import type { Feed } from "@/types";

const proxyFetchMock = vi.mocked(proxyFetch);

function makeFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "f1",
    url: "https://example.com/feed.xml",
    title: "Example",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeResponse(init: {
  status: number;
  retryAfter?: string | null;
  body?: string;
}): Response & { ok: boolean } {
  const ok = init.status >= 200 && init.status < 300;
  return {
    status: init.status,
    ok,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "retry-after" ? init.retryAfter ?? null : null,
    },
    async text() {
      return init.body ?? "";
    },
  } as unknown as Response & { ok: boolean };
}

describe("refreshFeed — Retry-After consumption", () => {
  beforeEach(() => {
    clearHostPauses();
    proxyFetchMock.mockReset();
  });

  afterEach(() => {
    clearHostPauses();
    proxyFetchMock.mockReset();
  });

  it("registers a host pause when the upstream returns 429 with Retry-After", async () => {
    proxyFetchMock.mockResolvedValueOnce(
      makeResponse({ status: 429, retryAfter: "60" }) as unknown as Response,
    );
    const feed = makeFeed({ url: "https://example.com/feed.xml" });
    const before = Date.now();
    const result = await refreshFeed(feed);
    expect(result.ok).toBe(false);
    const until = hostPausedUntil("https://example.com/feed.xml", before);
    expect(until).not.toBeNull();
    // ~60s in the future (parseRetryAfter clamps to now + seconds * 1000).
    expect(until!).toBeGreaterThanOrEqual(before + 59_000);
  });

  it("registers a host pause for 503 + Retry-After", async () => {
    proxyFetchMock.mockResolvedValueOnce(
      makeResponse({ status: 503, retryAfter: "30" }) as unknown as Response,
    );
    const feed = makeFeed({ url: "https://api.feedhost.io/feed.xml" });
    await refreshFeed(feed);
    expect(
      hostPausedUntil("https://api.feedhost.io/anything-else.xml", Date.now()),
    ).not.toBeNull();
  });

  it("does not register a pause for 404 / 500 (Retry-After only on 429/503)", async () => {
    proxyFetchMock.mockResolvedValueOnce(
      makeResponse({ status: 404 }) as unknown as Response,
    );
    const feed = makeFeed({ url: "https://example.com/missing.xml" });
    await refreshFeed(feed);
    expect(
      hostPausedUntil("https://example.com/anything.xml", Date.now()),
    ).toBeNull();
  });

  it("skips the upstream fetch entirely while the host pause is active", async () => {
    // Pre-register a pause so refreshFeed must short-circuit. The proxy
    // fetch mock is set to throw — if it's invoked the test fails loudly.
    proxyFetchMock.mockImplementation(() => {
      throw new Error("proxyFetch must not be called for a paused host");
    });
    const url = "https://paused.example/feed.xml";
    const feed = makeFeed({ url });
    const pauseUntil = Date.now() + 30_000;
    // Trigger the pause via the public helper.
    const { registerHostPause } = await import("@/core/feeds/host-pause");
    registerHostPause(url, pauseUntil);

    const result = await refreshFeed(feed);
    expect(result.ok).toBe(false);
    if (result.ok) return; // type narrowing
    expect(result.error).toMatch(/retry after/i);
  });
});
