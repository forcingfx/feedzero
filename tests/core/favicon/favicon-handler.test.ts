import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFaviconRequest } from "@/core/favicon/favicon-handler";

const FAVICON_PIXEL_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;

function imageHeadResponse(size = "1000"): Response {
  return new Response(null, {
    status: 200,
    headers: { "content-type": "image/x-icon", "content-length": size },
  });
}

describe("handleFaviconRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when domain query param is missing", async () => {
    const res = await handleFaviconRequest(
      new Request("http://localhost/api/icon"),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/domain/i);
  });

  it("returns 400 when domain fails SSRF validation (private IP)", async () => {
    const res = await handleFaviconRequest(
      new Request("http://localhost/api/icon?domain=127.0.0.1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns the fetched icon body with content-type and long-lived cache", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(imageHeadResponse()) // resolver finds /favicon.ico
      .mockResolvedValueOnce(
        new Response(FAVICON_PIXEL_BYTES, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleFaviconRequest(
      new Request("http://localhost/api/icon?domain=example.com"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    // Favicons are extremely stable per-domain; cache for 24h with a
    // week-long stale-while-revalidate so a returning visitor's
    // browser HTTP cache satisfies the request without re-hitting the
    // server. See the cache-control assertion in the dedicated test
    // below for the full rationale.
    expect(res.headers.get("cache-control")).toMatch(/max-age=86400/);
    expect(res.headers.get("cache-control")).toMatch(/stale-while-revalidate/);
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBe(FAVICON_PIXEL_BYTES.byteLength);
  });

  it("falls back to image/x-icon when upstream omits content-type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(imageHeadResponse())
      .mockResolvedValueOnce(
        new Response(FAVICON_PIXEL_BYTES, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleFaviconRequest(
      new Request("http://localhost/api/icon?domain=example.com"),
    );
    expect(res.headers.get("content-type")).toBe("image/x-icon");
  });

  it("returns 404 when the resolved icon URL responds non-OK", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(imageHeadResponse()) // resolver finds /favicon.ico
      .mockResolvedValueOnce(new Response(null, { status: 500 })); // image GET fails
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleFaviconRequest(
      new Request("http://localhost/api/icon?domain=example.com"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 502 when the icon fetch throws (network/timeout)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(imageHeadResponse())
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleFaviconRequest(
      new Request("http://localhost/api/icon?domain=example.com"),
    );
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/failed/i);
  });
});
