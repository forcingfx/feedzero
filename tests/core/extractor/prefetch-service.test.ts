import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/core/storage/db.ts", () => ({
  getAllArticles: vi.fn(),
  updateArticle: vi.fn(),
}));

vi.mock("../../../src/core/proxy/proxy-fetch.ts", () => ({
  proxyFetch: vi.fn(),
}));

vi.mock("../../../src/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
}));

import {
  prefetchStarredArticles,
  PREFETCH_AGE_LIMIT_MS,
  PREFETCH_CONCURRENCY,
} from "../../../src/core/extractor/prefetch-service.ts";
import { getAllArticles, updateArticle } from "../../../src/core/storage/db.ts";
import { proxyFetch } from "../../../src/core/proxy/proxy-fetch.ts";
import { extract } from "../../../src/core/extractor/extractor.ts";
import type { Article } from "@feedzero/core/types";

function mockArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: overrides.id ?? "a1",
    feedId: overrides.feedId ?? "f1",
    guid: "g1",
    title: "T",
    link: overrides.link ?? "https://example.com/a/1",
    content: "<p>teaser</p>",
    summary: "",
    author: "",
    publishedAt: overrides.publishedAt ?? Date.now(),
    read: false,
    createdAt: 0,
    ...overrides,
  };
}

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe("prefetchStarredArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateArticle).mockResolvedValue({ ok: true, value: true });
    vi.mocked(extract).mockReturnValue({
      ok: true,
      value: {
        content: "<article>full text</article>",
        title: "",
        author: "",
        excerpt: "",
      },
    });
    // Each call returns a fresh Response — Response bodies are one-shot.
    vi.mocked(proxyFetch).mockImplementation(async () =>
      okResponse("<html><body>page</body></html>"),
    );
  });

  it("extracts every starred article that does not yet have extractedContent", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [
        mockArticle({ id: "starred-1", starred: true }),
        mockArticle({ id: "starred-2", starred: true }),
        mockArticle({ id: "unstarred", starred: false }),
      ],
    });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(2);
    expect(result.value.failed).toBe(0);
    expect(proxyFetch).toHaveBeenCalledTimes(2);
  });

  it("persists extractedContent + extractedAt on each successfully extracted article", async () => {
    const article = mockArticle({ id: "starred-1", starred: true });
    vi.mocked(getAllArticles).mockResolvedValue({ ok: true, value: [article] });

    const before = Date.now();
    await prefetchStarredArticles();
    const after = Date.now();

    expect(updateArticle).toHaveBeenCalledTimes(1);
    const persisted = vi.mocked(updateArticle).mock.calls[0][0];
    expect(persisted.id).toBe("starred-1");
    expect(persisted.extractedContent).toBe("<article>full text</article>");
    expect(persisted.extractedAt).toBeGreaterThanOrEqual(before);
    expect(persisted.extractedAt).toBeLessThanOrEqual(after);
  });

  it("is idempotent — skips articles that already have extractedContent", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [
        mockArticle({
          id: "already-done",
          starred: true,
          extractedContent: "<article>already</article>",
          extractedAt: 1,
        }),
        mockArticle({ id: "needs-it", starred: true }),
      ],
    });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(1);
    expect(proxyFetch).toHaveBeenCalledTimes(1);
    const fetchedUrl = vi.mocked(proxyFetch).mock.calls[0][1];
    expect(fetchedUrl).toBe(mockArticle({ id: "needs-it" }).link);
  });

  it("skips articles older than the 90-day cutoff to spare bandwidth on ancient stars", async () => {
    const ancient = mockArticle({
      id: "ancient",
      starred: true,
      publishedAt: Date.now() - PREFETCH_AGE_LIMIT_MS - 1000,
    });
    const fresh = mockArticle({
      id: "fresh",
      starred: true,
      publishedAt: Date.now() - 1000,
    });
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [ancient, fresh],
    });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(1);
    expect(proxyFetch).toHaveBeenCalledTimes(1);
    const fetchedUrl = vi.mocked(proxyFetch).mock.calls[0][1];
    expect(fetchedUrl).toBe(fresh.link);
  });

  it("counts a failed proxy fetch as failed without aborting the batch", async () => {
    vi.mocked(proxyFetch).mockReset();
    vi.mocked(proxyFetch)
      .mockImplementationOnce(async () => new Response("nope", { status: 502 }))
      .mockImplementationOnce(async () => okResponse("<html>page</html>"));

    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [
        mockArticle({ id: "fails", starred: true }),
        mockArticle({ id: "succeeds", starred: true, link: "https://example.com/a/2" }),
      ],
    });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(1);
    expect(result.value.failed).toBe(1);
  });

  it("skips articles whose link is not a fetchable http(s) URL", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: true,
      value: [
        mockArticle({ id: "no-link", starred: true, link: "" }),
        mockArticle({ id: "javascript", starred: true, link: "javascript:alert(1)" }),
        mockArticle({ id: "good", starred: true, link: "https://example.com/a/1" }),
      ],
    });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(1);
    expect(proxyFetch).toHaveBeenCalledTimes(1);
  });

  it("limits concurrency to PREFETCH_CONCURRENCY so we never fan out beyond the cap", async () => {
    // Track how many proxyFetch promises are in-flight at the same time —
    // a manual gate lets the test deterministically observe the cap.
    let inFlight = 0;
    let observedPeak = 0;
    const gates: Array<() => void> = [];

    vi.mocked(proxyFetch).mockImplementation(async () => {
      inFlight++;
      observedPeak = Math.max(observedPeak, inFlight);
      await new Promise<void>((resolve) => gates.push(resolve));
      inFlight--;
      return okResponse("<html>page</html>");
    });

    const articles = Array.from({ length: 10 }, (_, i) =>
      mockArticle({
        id: `s${i}`,
        starred: true,
        link: `https://example.com/a/${i}`,
      }),
    );
    vi.mocked(getAllArticles).mockResolvedValue({ ok: true, value: articles });

    const promise = prefetchStarredArticles();

    // Yield enough microtask ticks for the scheduler to fill its lane budget.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(observedPeak).toBeLessThanOrEqual(PREFETCH_CONCURRENCY);
    expect(observedPeak).toBeGreaterThan(0);

    // Release everything so the prefetch can settle.
    while (gates.length > 0) {
      const release = gates.shift();
      release?.();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    await promise;
  });

  it("returns ok with 0 extracted when no articles need prefetching", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({ ok: true, value: [] });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extracted).toBe(0);
    expect(result.value.failed).toBe(0);
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("returns an err result when getAllArticles fails", async () => {
    vi.mocked(getAllArticles).mockResolvedValue({
      ok: false,
      error: "db is closed",
    });

    const result = await prefetchStarredArticles();

    expect(result.ok).toBe(false);
    expect(proxyFetch).not.toHaveBeenCalled();
  });
});
