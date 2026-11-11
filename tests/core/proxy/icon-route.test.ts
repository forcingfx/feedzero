import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleIconRequest,
  ARTICLE_IMAGE_MAX_BYTES,
} from "@/core/proxy/icon-route.ts";
import { createFeedCache } from "@/core/proxy/feed-cache.ts";

/**
 * /api/icon serves three request shapes from one function (Vercel's
 * 12-function cap; the api/ directory already holds 12):
 *   ?domain=<host>               → favicon discovery
 *   ?url=<image>                 → list thumbnail, 2 MB cap
 *   ?url=<image>&mode=article    → article-body image, larger cap
 *
 * All three entry points (server.ts, vite.config.js, api/icon.ts) call
 * this one dispatcher, so the shapes cannot drift apart again (the
 * 2026-09 `?domain=` outage was exactly that drift). Only the network is
 * mocked.
 */
const MB = 1024 * 1024;
const png = (bytes: number) =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
const IMG = encodeURIComponent("https://cdn.example.com/photo.png");

describe("handleIconRequest", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => png(3 * MB));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a 3 MB image as a list thumbnail (favicon cap stays at 2 MB)", async () => {
    const res = await handleIconRequest(
      new Request(`https://my.feedzero.app/api/icon?url=${IMG}`),
    );
    expect(res.status).toBe(413);
  });

  it("relays a 3 MB image in article mode, cacheable by the browser", async () => {
    const res = await handleIconRequest(
      new Request(`https://my.feedzero.app/api/icon?url=${IMG}&mode=article`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/max-age=86400/);
    expect((await res.arrayBuffer()).byteLength).toBe(3 * MB);
  });

  it("refuses an article image above the article cap with 413", async () => {
    fetchMock.mockImplementation(async () => png(ARTICLE_IMAGE_MAX_BYTES + 1));
    const res = await handleIconRequest(
      new Request(`https://my.feedzero.app/api/icon?url=${IMG}&mode=article`),
    );
    expect(res.status).toBe(413);
  });

  it("keeps the article cap under Vercel's 4.5 MB function response limit", () => {
    // Pin: a larger cap would let the function buffer an image it then
    // cannot return. Trade-off: very large hero images stay broken.
    expect(ARTICLE_IMAGE_MAX_BYTES).toBeLessThan(4.5 * 1000 * 1000);
    expect(ARTICLE_IMAGE_MAX_BYTES).toBeGreaterThan(2 * MB);
  });

  it("refuses a non-image in article mode with 415", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const res = await handleIconRequest(
      new Request(`https://my.feedzero.app/api/icon?url=${IMG}&mode=article`),
    );
    expect(res.status).toBe(415);
  });

  it("blocks an internal address in article mode (SSRF guard intact)", async () => {
    const res = await handleIconRequest(
      new Request(
        `https://my.feedzero.app/api/icon?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data")}&mode=article`,
      ),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not hold article images in the server's in-memory cache", async () => {
    // Article images are large and per-article; the browser HTTP cache
    // (Cache-Control above) serves repeats. Keeping them out of the feed
    // cache also keeps image URLs out of its per-URL request counter.
    const cache = createFeedCache();
    await handleIconRequest(
      new Request(`https://my.feedzero.app/api/icon?url=${IMG}&mode=article`),
      { cache },
    );
    expect(cache.getStats()).toEqual([]);
  });

  it("still resolves a favicon for ?domain=", async () => {
    fetchMock.mockImplementation(async () => png(512));
    const res = await handleIconRequest(
      new Request("https://my.feedzero.app/api/icon?domain=example.com"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
  });
});
