import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { GET } from "../../api/icon";

/**
 * Contract for the Vercel wrapper at api/icon.ts.
 *
 * /api/icon serves two request shapes through one function (Vercel's
 * 12-function Hobby cap): `?domain=<host>` resolves the site's favicon,
 * anything else proxies a known image URL. server.ts and vite.config.js
 * both dispatch on that shape; the wrapper is the third entry point and
 * must agree (CLAUDE.md "three-entry-point rule").
 *
 * PR #260 rewrote the wrapper as a thin proxy call and dropped the
 * dispatch. In production every `?domain=` request (the client's primary
 * path, src/components/feeds/feed-favicon.tsx) answered 400, the client
 * fell back to proxying raw site URLs, and the generic proxy relayed
 * multi-megabyte HTML bodies as "icons" with no CDN caching — the Vercel
 * "5xx spike on /api/icon" alert and the Fast Origin Transfer exhaustion
 * of 2026-09.
 *
 * Only the network is mocked here; both handlers run for real.
 */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("api/icon.ts wrapper dispatch", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(PNG, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a favicon for ?domain= instead of demanding a url", async () => {
    const res = await GET(
      new Request("https://my.feedzero.app/api/icon?domain=example.com"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
    expect(res.headers.get("cache-control")).toMatch(/max-age=86400/);
  });

  it("still proxies an explicit image url", async () => {
    const res = await GET(
      new Request(
        "https://my.feedzero.app/api/icon?url=https%3A%2F%2Fexample.com%2Ffavicon.ico",
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
  });
});
