import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../server";
import { SUPPORTED_METHODS } from "../src/core/sync/sync-handler";
import { SUPPORTED_METHODS as PROXY_SUPPORTED_METHODS } from "../src/core/proxy/proxy-handler";
import { SUPPORTED_METHODS as CATALOG_SUPPORTED_METHODS } from "../src/core/catalog/catalog-handler";
import { SUPPORTED_METHODS as FEEDBACK_SUPPORTED_METHODS } from "../src/core/feedback/feedback-handler";
import * as vercelSyncExports from "../api/sync";
import * as vercelFeedExports from "../api/feed";
import * as vercelPageExports from "../api/page";
import * as vercelCatalogExports from "../api/catalog";
import * as vercelFeedbackExports from "../api/feedback";

// Mock fetch globally for proxy handler tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("server", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("security headers", () => {
    it("sets Content-Security-Policy on HTML responses", async () => {
      const res = await createApp().request("/");
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
    });

    it("allows external HTTPS images in CSP", async () => {
      const res = await createApp().request("/");
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toContain("img-src 'self' data: https:");
    });

    it("does not set CSP on API responses", async () => {
      const res = await createApp().request("/api/feed");
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeNull();
    });

    it("sets Strict-Transport-Security on HTML responses", async () => {
      const res = await createApp().request("/");
      const hsts = res.headers.get("Strict-Transport-Security");
      expect(hsts).toBeTruthy();
      expect(hsts).toContain("max-age=");
    });

    it("sets X-Content-Type-Options on HTML responses", async () => {
      const res = await createApp().request("/");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("sets Referrer-Policy on HTML responses", async () => {
      const res = await createApp().request("/");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    });

    it("sets Permissions-Policy on HTML responses", async () => {
      const res = await createApp().request("/");
      const pp = res.headers.get("Permissions-Policy");
      expect(pp).toBeTruthy();
      expect(pp).toContain("camera=()");
    });

    it("sets X-Frame-Options on HTML responses", async () => {
      const res = await createApp().request("/");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });
  });

  describe("GET /api/feed", () => {
    it("proxies feed requests", async () => {
      mockFetch.mockResolvedValue(
        new Response("<rss></rss>", {
          headers: { "content-type": "text/xml" },
        }),
      );

      const res = await createApp().request(
        "/api/feed?url=https://example.com/feed.xml",
      );

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("<rss></rss>");
    });

    it("returns 400 for missing url param", async () => {
      const res = await createApp().request("/api/feed");
      expect(res.status).toBe(400);
    });

    it("blocks internal addresses", async () => {
      const res = await createApp().request(
        "/api/feed?url=http://127.0.0.1/secret",
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/page", () => {
    it("proxies page requests", async () => {
      mockFetch.mockResolvedValue(
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
      );

      const res = await createApp().request(
        "/api/page?url=https://example.com/article",
      );

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("<html></html>");
    });
  });

  describe("sync routes", () => {
    it("PUT /api/sync stores a vault", async () => {
      const app = createApp();
      const vaultId = "a".repeat(64);

      const res = await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          vault: { version: 1, iv: [1, 2, 3], ciphertext: "abc" },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it("GET /api/sync retrieves a stored vault", async () => {
      const app = createApp();
      const vaultId = "b".repeat(64);

      // Store first
      await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          vault: { version: 1, iv: [1, 2, 3], ciphertext: "abc" },
        }),
      });

      // Retrieve
      const res = await app.request(`/api/sync?vaultId=${vaultId}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.vault.version).toBe(1);
    });

    it("GET /api/sync returns 404 for missing vault", async () => {
      const res = await createApp().request(
        `/api/sync?vaultId=${"c".repeat(64)}`,
      );
      expect(res.status).toBe(404);
    });

    it("returns 405 for unsupported method", async () => {
      const res = await createApp().request("/api/sync", { method: "PATCH" });
      expect(res.status).toBe(405);
    });
  });

  describe("sync routing contract", () => {
    it("SUPPORTED_METHODS lists every method the handler accepts", () => {
      expect(SUPPORTED_METHODS).toContain("GET");
      expect(SUPPORTED_METHODS).toContain("PUT");
      expect(SUPPORTED_METHODS).toContain("DELETE");
    });

    it("Vercel serverless function exports a handler for every supported method", () => {
      for (const method of SUPPORTED_METHODS) {
        expect(
          vercelSyncExports,
          `api/sync.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelSyncExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Vercel serverless function does not export unsupported methods", () => {
      const allHttpMethods = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ];
      const unsupported = allHttpMethods.filter(
        (m) => !SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelSyncExports,
          `api/sync.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts every supported method", async () => {
      const app = createApp();
      for (const method of SUPPORTED_METHODS) {
        const vaultId = "a".repeat(64);
        const res = await app.request(`/api/sync?vaultId=${vaultId}`, {
          method,
        });
        expect(
          res.status,
          `Hono server returned unexpected status for ${method}`,
        ).not.toBe(405);
      }
    });
  });

  describe("rate limiting", () => {
    it("allows requests within the limit and blocks after exceeding it", async () => {
      const app = createApp();
      mockFetch.mockResolvedValue(
        new Response("<rss/>", {
          headers: { "content-type": "text/xml" },
        }),
      );

      // First request should succeed
      const first = await app.request(
        "/api/feed?url=https://example.com/feed.xml",
      );
      expect(first.status).toBe(200);

      // Exhaust the remaining limit
      for (let i = 1; i < 100; i++) {
        await app.request("/api/feed?url=https://example.com/feed.xml");
      }

      // The 101st request should be rate-limited
      const blocked = await app.request(
        "/api/feed?url=https://example.com/feed.xml",
      );
      expect(blocked.status).toBe(429);
    });
  });

  describe("diagnostics endpoint", () => {
    it("GET /api/diagnostics returns health status", async () => {
      const app = createApp();
      const res = await app.request("/api/diagnostics");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("status", "ok");
      expect(data).toHaveProperty("timestamp");
    });
  });

  describe("feed stats endpoint", () => {
    it("GET /api/stats/feeds returns empty array without cache", async () => {
      const app = createApp();
      const res = await app.request("/api/stats/feeds");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.feeds).toEqual([]);
    });

    it("GET /api/stats/feeds returns feed request counts with cache", async () => {
      const { createFeedCache } = await import(
        "../src/core/proxy/feed-cache"
      );
      const cache = createFeedCache();
      const app = createApp(undefined, cache);

      mockFetch.mockResolvedValue(
        new Response("<rss/>", {
          headers: { "content-type": "text/xml" },
        }),
      );

      // Make two requests to the same feed
      await app.request("/api/feed?url=https://example.com/feed.xml");
      await app.request("/api/feed?url=https://example.com/feed.xml");

      const res = await app.request("/api/stats/feeds");
      const data = await res.json();
      expect(data.feeds.length).toBeGreaterThan(0);
      const feed = data.feeds.find(
        (f: { url: string }) => f.url === "https://example.com/feed.xml",
      );
      expect(feed.requests).toBe(2);
      expect(feed.cached).toBe(true);
    });

    it("second request for same feed is served from cache", async () => {
      const { createFeedCache } = await import(
        "../src/core/proxy/feed-cache"
      );
      const cache = createFeedCache();
      const app = createApp(undefined, cache);

      mockFetch.mockResolvedValue(
        new Response("<rss/>", {
          headers: { "content-type": "text/xml" },
        }),
      );

      await app.request("/api/feed?url=https://example.com/feed.xml");
      mockFetch.mockClear();

      // Second request should hit cache, not fetch again
      const res = await app.request(
        "/api/feed?url=https://example.com/feed.xml",
      );
      expect(res.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("sync stats endpoint", () => {
    it("GET /api/stats-sync returns vault count", async () => {
      const app = createApp();

      // Store a vault first
      const vaultId = "a".repeat(64);
      await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          vault: { version: 1, iv: [1, 2, 3], ciphertext: "abc" },
        }),
      });

      const res = await app.request("/api/stats-sync");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ ok: true, vaults: 1 });
    });

    it("GET /api/stats-sync returns zero with no vaults", async () => {
      const app = createApp();
      const res = await app.request("/api/stats-sync");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ ok: true, vaults: 0 });
    });
  });

  describe("proxy routing contract", () => {
    it("PROXY_SUPPORTED_METHODS lists GET and POST", () => {
      expect(PROXY_SUPPORTED_METHODS).toContain("GET");
      expect(PROXY_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/feed.ts exports a handler for every supported method", () => {
      for (const method of PROXY_SUPPORTED_METHODS) {
        expect(
          vercelFeedExports,
          `api/feed.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelFeedExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Vercel api/page.ts exports a handler for every supported method", () => {
      for (const method of PROXY_SUPPORTED_METHODS) {
        expect(
          vercelPageExports,
          `api/page.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelPageExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Vercel proxy functions do not export unsupported methods", () => {
      const allHttpMethods = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ];
      const unsupported = allHttpMethods.filter(
        (m) => !PROXY_SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelFeedExports,
          `api/feed.ts should not export ${method}`,
        ).not.toHaveProperty(method);
        expect(
          vercelPageExports,
          `api/page.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts every supported proxy method", async () => {
      const app = createApp();
      for (const method of PROXY_SUPPORTED_METHODS) {
        mockFetch.mockResolvedValue(
          new Response("<rss/>", {
            headers: { "content-type": "text/xml" },
          }),
        );
        const res = await app.request(
          "/api/feed?url=https://example.com/feed.xml",
          { method },
        );
        expect(
          res.status,
          `Hono server returned 405 for ${method} /api/feed`,
        ).not.toBe(405);
      }
    });
  });

  describe("feedback endpoint", () => {
    const ORIGINAL_ENV = { ...process.env };
    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it("returns 503 when GitHub credentials are not configured", async () => {
      delete process.env.GITHUB_FEEDBACK_TOKEN;
      delete process.env.GITHUB_REPO;
      // Also unset the legacy GitLab vars so we don't accidentally fall back to them.
      delete process.env.GITLAB_FEEDBACK_TOKEN;
      delete process.env.GITLAB_PROJECT_ID;

      const res = await createApp().request("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello" }),
      });

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toMatch(/not configured/i);
    });

    it("returns 400 when message is missing", async () => {
      process.env.GITHUB_FEEDBACK_TOKEN = "fake-token";
      process.env.GITHUB_REPO = "forcingfx/feedzero";

      const res = await createApp().request("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toMatch(/required/i);
    });

    it("posts a GitHub issue and returns ok when credentials are valid", async () => {
      process.env.GITHUB_FEEDBACK_TOKEN = "fake-token";
      process.env.GITHUB_REPO = "forcingfx/feedzero";

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ number: 1, html_url: "https://github.com/forcingfx/feedzero/issues/1" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const res = await createApp().request("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Great app!" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      // Verify it called the GitHub issues API with the right payload shape:
      // - URL: /repos/{owner}/{repo}/issues
      // - Authorization: Bearer <token>
      // - Accept: application/vnd.github+json (recommended pinning)
      // - body labels is an ARRAY (GitHub) not a comma-string (GitLab)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/forcingfx/feedzero/issues",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer fake-token",
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          }),
        }),
      );

      const callArgs = mockFetch.mock.calls.at(-1);
      const sentBody = JSON.parse(callArgs![1].body);
      expect(sentBody.title).toMatch(/^Feedback: /);
      expect(sentBody.body).toBe("Great app!");
      expect(sentBody.labels).toEqual(["feedback"]);
    });

    it("rejects non-POST methods (Hono returns 404 for unregistered method)", async () => {
      const res = await createApp().request("/api/feedback", {
        method: "GET",
      });
      // Hono only registered POST for /api/feedback, so a GET hits the
      // 404 "Not Found" path rather than reaching the handler's 405 branch.
      expect([404, 405]).toContain(res.status);
    });
  });

  describe("feedback routing contract", () => {
    it("FEEDBACK_SUPPORTED_METHODS lists POST", () => {
      expect(FEEDBACK_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/feedback.ts exports a handler for every supported method", () => {
      for (const method of FEEDBACK_SUPPORTED_METHODS) {
        expect(
          vercelFeedbackExports,
          `api/feedback.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelFeedbackExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Vercel api/feedback.ts does not export unsupported methods", () => {
      const allHttpMethods = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ];
      const unsupported = allHttpMethods.filter(
        (m) => !FEEDBACK_SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelFeedbackExports,
          `api/feedback.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts POST /api/feedback", async () => {
      const app = createApp();
      const res = await app.request("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "test" }),
      });
      // Endpoint is registered: status is whatever the handler returns,
      // not 404 (route missing) or 405 (method not allowed).
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
    });
  });

  describe("catalog routing contract", () => {
    it("CATALOG_SUPPORTED_METHODS lists GET", () => {
      expect(CATALOG_SUPPORTED_METHODS).toContain("GET");
    });

    it("Vercel api/catalog.ts exports a handler for every supported method", () => {
      for (const method of CATALOG_SUPPORTED_METHODS) {
        expect(
          vercelCatalogExports,
          `api/catalog.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelCatalogExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Hono server accepts GET /api/catalog", async () => {
      const app = createApp();
      const res = await app.request("/api/catalog?action=count");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.count).toBe(0);
    });
  });

});
