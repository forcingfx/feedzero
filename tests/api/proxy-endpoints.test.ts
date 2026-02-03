import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleProxyRequest } from "../../src/core/proxy/proxy-handler.ts";

describe("Proxy API Endpoints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("/api/feed endpoint", () => {
    it("should return 400 when url parameter is missing", async () => {
      const req = new Request("http://localhost/api/feed");
      const response = await handleProxyRequest(req, "text/xml");

      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toBe("Missing url parameter");
    });

    it("should return 403 for blocked internal addresses", async () => {
      const req = new Request(
        "http://localhost/api/feed?url=http://localhost:8080/feed.xml",
      );
      const response = await handleProxyRequest(req, "text/xml");

      expect(response.status).toBe(403);
      const body = await response.text();
      expect(body).toBe("Access to internal addresses is blocked");
    });

    it("should return 400 for invalid protocols", async () => {
      const req = new Request(
        "http://localhost/api/feed?url=ftp://example.com/feed.xml",
      );
      const response = await handleProxyRequest(req, "text/xml");

      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toBe("Only http and https URLs are allowed");
    });

    it("should fetch and return feed content for valid URLs", async () => {
      const mockFeedXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Test Article</title>
    </item>
  </channel>
</rss>`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "application/rss+xml" }),
        text: async () => mockFeedXml,
      });

      const req = new Request(
        "http://localhost/api/feed?url=https://example.com/feed.xml",
      );
      const response = await handleProxyRequest(req, "text/xml");

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe(mockFeedXml);
      expect(response.headers.get("content-type")).toBe("application/rss+xml");
    });

    it("should use default content-type when upstream does not provide one", async () => {
      const mockFeedXml = `<?xml version="1.0"?><rss version="2.0"></rss>`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () => mockFeedXml,
      });

      const req = new Request(
        "http://localhost/api/feed?url=https://example.com/feed.xml",
      );
      const response = await handleProxyRequest(req, "text/xml");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/xml");
    });

    it("should return 502 when upstream fetch fails", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Network connection failed"));

      const req = new Request(
        "http://localhost/api/feed?url=https://example.com/feed.xml",
      );
      const response = await handleProxyRequest(req, "text/xml");

      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).toContain("Proxy error");
      expect(body).toContain("Network connection failed");
    });
  });

  describe("/api/page endpoint", () => {
    it("should return 400 when url parameter is missing", async () => {
      const req = new Request("http://localhost/api/page");
      const response = await handleProxyRequest(req, "text/html");

      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toBe("Missing url parameter");
    });

    it("should fetch and return page content for valid URLs", async () => {
      const mockHtml = `<!DOCTYPE html>
<html>
  <head><title>Test Page</title></head>
  <body><h1>Test Content</h1></body>
</html>`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => mockHtml,
      });

      const req = new Request(
        "http://localhost/api/page?url=https://example.com/article",
      );
      const response = await handleProxyRequest(req, "text/html");

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe(mockHtml);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
    });

    it("should use default content-type when upstream does not provide one", async () => {
      const mockHtml = "<html><body>Test</body></html>";

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () => mockHtml,
      });

      const req = new Request(
        "http://localhost/api/page?url=https://example.com/article",
      );
      const response = await handleProxyRequest(req, "text/html");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html");
    });
  });

  describe("SSRF Protection", () => {
    const blockedAddresses = [
      "http://localhost/feed.xml",
      "http://127.0.0.1/feed.xml",
      "http://[::1]/feed.xml",
      "http://0.0.0.0/feed.xml",
      "http://10.0.0.1/feed.xml",
      "http://192.168.1.1/feed.xml",
      "http://172.16.0.1/feed.xml",
      "http://169.254.169.254/latest/meta-data/",
    ];

    blockedAddresses.forEach((url) => {
      it(`should block access to ${url}`, async () => {
        const req = new Request(
          `http://localhost/api/feed?url=${encodeURIComponent(url)}`,
        );
        const response = await handleProxyRequest(req, "text/xml");

        expect(response.status).toBe(403);
        const body = await response.text();
        expect(body).toBe("Access to internal addresses is blocked");
      });
    });
  });
});
