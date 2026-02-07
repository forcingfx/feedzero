import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../server";
import { SUPPORTED_METHODS } from "../src/core/sync/sync-handler";
import * as vercelSyncExports from "../api/sync";

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

    it("does not set CSP on API responses", async () => {
      const res = await createApp().request("/api/feed");
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeNull();
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
});
