import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleProxyRequest,
  SUPPORTED_METHODS,
} from "@/core/proxy/proxy-handler";
import { createMemoryCatalogAdapter } from "@/core/catalog/adapters/memory-adapter.ts";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("handleProxyRequest", () => {
  it("sends a normalized User-Agent header to prevent fingerprinting", async () => {
    fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

    const req = new Request(
      "http://localhost/api/feed?url=https://example.com/feed.xml",
    );
    await handleProxyRequest(req, "text/xml");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.headers).toBeDefined();
    const headers = new Headers(options!.headers as HeadersInit);
    expect(headers.get("User-Agent")).toBe("FeedZero/1.0 (RSS Reader)");
  });

  it("sends a browser User-Agent when routeKind=page", async () => {
    // Article-page fetches mimic a real user visit. The FeedZero identifier
    // is blocked on sight by Cloudflare-class WAFs on article URLs (kottke.org,
    // zeit.de, etc.), turning extraction into a silent failure for the user.
    // Feed fetches keep the FeedZero identifier so publishers can see
    // aggregator traffic — only the page route flips to browser UA.
    fetchSpy.mockResolvedValue(
      new Response("<html><body>article</body></html>", { status: 200 }),
    );

    const req = new Request("http://localhost/api/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://kottke.org/26/05/some-post" }),
    });
    await handleProxyRequest(req, "text/html", { routeKind: "page" });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = new Headers(options!.headers as HeadersInit);
    const ua = headers.get("User-Agent");
    expect(ua).not.toBe("FeedZero/1.0 (RSS Reader)");
    expect(ua).toMatch(/Mozilla/);
  });

  it("accepts POST with JSON body to keep URLs out of server logs", async () => {
    fetchSpy.mockResolvedValue(new Response("<rss/>", { status: 200 }));

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://example.com/feed.xml");
  });

  it("returns 400 for POST with missing url in body", async () => {
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing url parameter", async () => {
    const req = new Request("http://localhost/api/feed");
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(400);
  });

  it("returns 403 for internal addresses", async () => {
    const req = new Request(
      "http://localhost/api/feed?url=http://127.0.0.1/secret",
    );
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(403);
  });

  it("returns 502 on fetch failure", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const req = new Request(
      "http://localhost/api/feed?url=https://example.com/feed.xml",
    );
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("Network error");
  });

  it("preserves binary data for image responses (uses arrayBuffer, not text)", async () => {
    // ICO files contain bytes > 127 that get corrupted by UTF-8 text round-trip
    const binaryData = new Uint8Array([
      0x00, 0x00, 0x01, 0x00, 0xff, 0xfe, 0x80, 0x90, 0xc0, 0xd0,
    ]);
    fetchSpy.mockResolvedValue(
      new Response(binaryData, {
        status: 200,
        headers: { "Content-Type": "image/x-icon" },
      }),
    );

    const req = new Request(
      "http://localhost/api/icon?url=https://example.com/favicon.ico",
    );
    const res = await handleProxyRequest(req, "image/x-icon");
    const resultBytes = new Uint8Array(await res.arrayBuffer());
    // Every byte must survive the round-trip, including high bytes
    expect(resultBytes).toEqual(binaryData);
  });

  it("passes through the upstream Content-Type header", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<feed/>", {
        status: 200,
        headers: { "Content-Type": "application/atom+xml" },
      }),
    );

    const req = new Request(
      "http://localhost/api/feed?url=https://example.com/feed.xml",
    );
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.headers.get("Content-Type")).toBe("application/atom+xml");
  });
});

describe("upstream rate-limit + retry signalling (RFC 7231 §7.1.3)", () => {
  // RFC 7231 §7.1.3: 429 and 503 SHOULD carry Retry-After so well-behaved
  // clients can back off. The proxy must propagate that header verbatim so
  // the client (feed-service) can honour it instead of hammering the source.
  it("passes Retry-After through on upstream 429", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
  });

  it("passes Retry-After through on upstream 503", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        headers: { "Retry-After": "30" },
      }),
    );

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("does not cache 429/503 responses", async () => {
    // Caching a rate-limit response would hide a transient block from the
    // user for the cache TTL and prevent retry once Retry-After elapses.
    const setSpy = vi.fn();
    const cache = {
      get: vi.fn().mockReturnValue(undefined),
      set: setSpy,
      getStats: vi.fn().mockReturnValue([]),
      size: 0,
    };
    fetchSpy.mockResolvedValue(
      new Response("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    );

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    await handleProxyRequest(req, "text/xml", { cache });

    expect(setSpy).not.toHaveBeenCalled();
  });

  it("works without Retry-After (header is optional in RFC)", async () => {
    fetchSpy.mockResolvedValue(
      new Response("Too Many Requests", { status: 429 }),
    );

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeNull();
  });
});

describe("content cleaning", () => {
  it("strips tracking pixels from feed responses when cleanContent is true", async () => {
    const feedXml = `<rss><channel><item><description><![CDATA[<p>Hello</p><img src="https://pixel.quantserve.com/p.gif" width="1" height="1">]]></description></item></channel></rss>`;
    fetchSpy.mockResolvedValue(
      new Response(feedXml, { status: 200, headers: { "Content-Type": "text/xml" } }),
    );

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml", { cleanContent: true });
    const body = await res.text();

    expect(body).toContain("Hello");
    expect(body).not.toContain("quantserve");
  });

  it("strips UTM params from feed responses when cleanContent is true", async () => {
    const feedXml = `<rss><channel><item><description><![CDATA[<a href="https://example.com/post?utm_source=rss&id=5">Link</a>]]></description></item></channel></rss>`;
    fetchSpy.mockResolvedValue(
      new Response(feedXml, { status: 200, headers: { "Content-Type": "text/xml" } }),
    );

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml", { cleanContent: true });
    const body = await res.text();

    expect(body).toContain("id=5");
    expect(body).not.toContain("utm_source");
  });

  it("does not clean content when cleanContent is not set", async () => {
    const feedXml = `<rss><item><description><![CDATA[<img src="https://pixel.quantserve.com/p.gif" width="1" height="1">]]></description></item></rss>`;
    fetchSpy.mockResolvedValue(new Response(feedXml, { status: 200 }));

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    const body = await res.text();

    expect(body).toContain("quantserve");
  });
});

describe("catalog integration", () => {
  it("upserts feed URL into catalog when catalogAdapter is provided", async () => {
    fetchSpy.mockResolvedValue(new Response("<rss/>", { status: 200 }));
    const catalog = createMemoryCatalogAdapter();

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    await handleProxyRequest(req, "text/xml", { catalogAdapter: catalog });

    // Wait for async upsert
    await new Promise((r) => setTimeout(r, 10));

    const entry = await catalog.get("https://example.com/feed.xml");
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;
    expect(entry.value).not.toBeNull();
    expect(entry.value!.requestCount).toBe(1);
  });

  it("does not upsert on proxy error", async () => {
    fetchSpy.mockRejectedValue(new Error("fail"));
    const catalog = createMemoryCatalogAdapter();

    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    await handleProxyRequest(req, "text/xml", { catalogAdapter: catalog });

    await new Promise((r) => setTimeout(r, 10));

    const entry = await catalog.get("https://example.com/feed.xml");
    if (!entry.ok) return;
    expect(entry.value).toBeNull();
  });
});

describe("proxyFetch ↔ handleProxyRequest contract", () => {
  it("POST with JSON body (as proxyFetch sends) is parsed by handleProxyRequest", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<rss/>", {
        status: 200,
        headers: { "content-type": "text/xml" },
      }),
    );

    // Build the request exactly as proxyFetch does — method, headers, body
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });

    const res = await handleProxyRequest(req, "text/xml");

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
      expect.any(Object),
    );
  });

  it("SUPPORTED_METHODS includes the method proxyFetch uses", () => {
    expect(SUPPORTED_METHODS).toContain("POST");
  });
});

describe("handleProxyRequest — rate limiting", () => {
  // Production-defense layer. Without this, a single client could hammer
  // the proxy unbounded and the catalog counts would be indistinguishable
  // from "popular feed" traffic. Opt-in via the `rateLimit` option so
  // self-host / dev paths are unaffected.

  function makeRequest(): Request {
    return new Request("http://localhost/api/feed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.42",
      },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
  }

  it("short-circuits with 429 when the limiter denies the request", async () => {
    const denyLimiter = {
      async check() {
        return { allowed: false as const, retryAfterSec: 42 };
      },
    };
    const clientIdFor = async () => "cli_test1234";
    const res = await handleProxyRequest(makeRequest(), "text/xml", {
      rateLimit: { limiter: denyLimiter, clientIdFor },
    });
    expect(res.status).toBe(429);
  });

  it("includes a Retry-After header on 429", async () => {
    // RFC 6585 §4: 429 responses SHOULD include Retry-After. Clients
    // (and well-behaved bots) read this header to back off correctly.
    const denyLimiter = {
      async check() {
        return { allowed: false as const, retryAfterSec: 42 };
      },
    };
    const clientIdFor = async () => "cli_test1234";
    const res = await handleProxyRequest(makeRequest(), "text/xml", {
      rateLimit: { limiter: denyLimiter, clientIdFor },
    });
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("passes through to the proxy when the limiter allows the request", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<rss>ok</rss>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    const allowLimiter = {
      async check() {
        return { allowed: true as const };
      },
    };
    const clientIdFor = async () => "cli_test1234";
    const res = await handleProxyRequest(makeRequest(), "text/xml", {
      rateLimit: { limiter: allowLimiter, clientIdFor },
    });
    expect(res.status).toBe(200);
  });

  it("checks the limiter BEFORE URL validation (so invalid URLs still count)", async () => {
    // Why: an attacker spraying invalid URLs should still consume their
    // rate-limit budget. Otherwise they can probe the proxy unbounded.
    let checkCount = 0;
    const limiter = {
      async check() {
        checkCount++;
        return { allowed: true as const };
      },
    };
    const clientIdFor = async () => "cli_test1234";
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://10.0.0.1/internal" }), // SSRF target
    });
    const res = await handleProxyRequest(req, "text/xml", {
      rateLimit: { limiter, clientIdFor },
    });
    expect(res.status).toBe(403);
    expect(checkCount).toBe(1);
  });

  it("does not rate-limit when no limiter is configured (current default)", async () => {
    // Opt-in: existing test paths and self-hosters running without Upstash
    // must not be affected by this PR.
    fetchSpy.mockResolvedValue(
      new Response("<rss>ok</rss>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    const res = await handleProxyRequest(makeRequest(), "text/xml");
    expect(res.status).toBe(200);
  });
});

describe("Cache-Control on image responses", () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it("sets a long-lived Cache-Control on proxied image responses", async () => {
    fetchSpy.mockResolvedValue(
      new Response(new ArrayBuffer(64), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
    const req = new Request("http://localhost/api/icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/favicon.ico" }),
    });
    const res = await handleProxyRequest(req, "image/x-icon");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=86400/);
    expect(res.headers.get("Cache-Control")).toMatch(/stale-while-revalidate/);
  });

  it("does NOT set Cache-Control on text feed responses", async () => {
    // Feed XML is driven by the refresh cycle (and now ETag); a stale
    // HTTP cache hit would mask publisher updates the user expects to
    // see on their next refresh. Keep the no-cache default in place.
    fetchSpy.mockResolvedValue(
      new Response("<rss/>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });
});

describe("conditional-fetch (ETag / Last-Modified) passthrough", () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it("forwards client-supplied etag as upstream If-None-Match", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<rss/>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/feed.xml",
        etag: 'W/"abc123"',
      }),
    });
    await handleProxyRequest(req, "text/xml");
    const [, options] = fetchSpy.mock.calls[0];
    const headers = new Headers(options!.headers as HeadersInit);
    expect(headers.get("If-None-Match")).toBe('W/"abc123"');
  });

  it("forwards client-supplied lastModified as upstream If-Modified-Since", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<rss/>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/feed.xml",
        lastModified: "Wed, 21 Oct 2026 07:28:00 GMT",
      }),
    });
    await handleProxyRequest(req, "text/xml");
    const [, options] = fetchSpy.mock.calls[0];
    const headers = new Headers(options!.headers as HeadersInit);
    expect(headers.get("If-Modified-Since")).toBe(
      "Wed, 21 Oct 2026 07:28:00 GMT",
    );
  });

  it("returns 304 with an empty body when upstream returns 304 Not Modified", async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 304,
        headers: { "Content-Type": "text/xml" },
      }),
    );
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/feed.xml",
        etag: 'W/"abc123"',
      }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("passes upstream ETag and Last-Modified through on 200 responses", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<rss/>", {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          ETag: 'W/"new-etag"',
          "Last-Modified": "Thu, 22 Oct 2026 09:00:00 GMT",
        },
      }),
    );
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe('W/"new-etag"');
    expect(res.headers.get("Last-Modified")).toBe(
      "Thu, 22 Oct 2026 09:00:00 GMT",
    );
  });
});
