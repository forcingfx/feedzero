import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleProxyRequest } from "@/core/proxy/proxy-handler";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

describe("handleProxyRequest", () => {
  it("sends a normalized User-Agent header to prevent fingerprinting", async () => {
    fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

    const req = new Request("http://localhost/api/feed?url=https://example.com/feed.xml");
    await handleProxyRequest(req, "text/xml");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.headers).toBeDefined();
    const headers = new Headers(options!.headers as HeadersInit);
    expect(headers.get("User-Agent")).toBe("FeedZero/1.0 (RSS Reader)");
  });

  it("returns 400 for missing url parameter", async () => {
    const req = new Request("http://localhost/api/feed");
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(400);
  });

  it("returns 403 for internal addresses", async () => {
    const req = new Request("http://localhost/api/feed?url=http://127.0.0.1/secret");
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(403);
  });

  it("returns 502 on fetch failure", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const req = new Request("http://localhost/api/feed?url=https://example.com/feed.xml");
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("Network error");
  });

  it("passes through the upstream Content-Type header", async () => {
    fetchSpy.mockResolvedValue(
      new Response("<feed/>", {
        status: 200,
        headers: { "Content-Type": "application/atom+xml" },
      }),
    );

    const req = new Request("http://localhost/api/feed?url=https://example.com/feed.xml");
    const res = await handleProxyRequest(req, "text/xml");
    expect(res.headers.get("Content-Type")).toBe("application/atom+xml");
  });
});
