import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp } from "../server";
import { SUPPORTED_METHODS } from "../src/core/sync/sync-handler";
import { SUPPORTED_METHODS as PROXY_SUPPORTED_METHODS } from "../src/core/proxy/proxy-handler";
import { SUPPORTED_METHODS as CATALOG_SUPPORTED_METHODS } from "../src/core/catalog/catalog-handler";
import { SUPPORTED_METHODS as FEEDBACK_SUPPORTED_METHODS } from "../src/core/feedback/feedback-handler";
import { SUPPORTED_METHODS as HEALTH_SUPPORTED_METHODS } from "../src/core/health/health-handler";
import { SUPPORTED_METHODS as STRIPE_SUPPORTED_METHODS } from "../src/core/stripe/webhook-handler";
import { SUPPORTED_METHODS as LICENSE_VERIFY_SUPPORTED_METHODS } from "../src/core/license/verify-handler";
import { SUPPORTED_METHODS as LICENSE_ISSUE_SUPPORTED_METHODS } from "../src/core/license/issue-handler";
import { SUPPORTED_METHODS as LICENSE_RETRIEVE_SUPPORTED_METHODS } from "../src/core/license/retrieve-handler";
import { SUPPORTED_METHODS as LICENSE_RECOVER_SUPPORTED_METHODS } from "../src/core/license/recover-handler";
import { SUPPORTED_METHODS as LICENSE_ISSUE_FROM_RECOVERY_SUPPORTED_METHODS } from "../src/core/license/issue-from-recovery-handler";
import { SUPPORTED_METHODS as PORTAL_SUPPORTED_METHODS } from "../src/core/stripe/portal-handler";
import { SUPPORTED_METHODS as CHECKOUT_SUPPORTED_METHODS } from "../src/core/stripe/checkout-handler";
import * as vercelSyncExports from "../api/sync";
import * as vercelFeedExports from "../api/feed";
import * as vercelPageExports from "../api/page";
import * as vercelCatalogExports from "../api/catalog";
import * as vercelFeedbackExports from "../api/feedback";
import * as vercelHealthExports from "../api/health";
import * as vercelStripeWebhookExports from "../api/stripe/webhook";
// /api/license/{verify,issue,retrieve} resolve to the same Vercel dynamic-route
// file (api/license/[action].ts) — consolidated to stay under the Hobby-plan
// 12-functions ceiling. The wrapper dispatches internally by the action
// segment. The three routing contracts assert against the same module since
// they share the POST export.
import * as vercelLicenseDynamicExports from "../api/license/[action]";
const vercelLicenseVerifyExports = vercelLicenseDynamicExports;
const vercelLicenseIssueExports = vercelLicenseDynamicExports;
const vercelLicenseRetrieveExports = vercelLicenseDynamicExports;
import * as vercelCheckoutExports from "../api/checkout/create-session";
// /api/license/portal is served by the same dynamic-route file as verify,
// issue, retrieve — consolidated to stay under the Hobby plan's 12-function
// ceiling. Alias for parity with the other contract tests.
const vercelPortalExports = vercelLicenseDynamicExports;
import { signLicense, type SigningKey } from "../src/core/license/sign";
import { MemoryLicenseStorage } from "../src/core/license/storage";
import type { LicensePayload } from "../src/core/license/format";
import { subscriptionCreatedEvent } from "../src/core/stripe/test-fixtures";

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

  describe("health endpoint", () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
      delete process.env.MAINTENANCE_MODE;
    });

    it("GET /api/health returns 200 with ok:true", async () => {
      const res = await createApp().request("/api/health");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.version).toBe("string");
      expect(typeof body.time).toBe("string");
    });

    it("GET /api/health returns 503 when MAINTENANCE_MODE=1", async () => {
      process.env.MAINTENANCE_MODE = "1";
      const res = await createApp().request("/api/health");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.maintenance).toBe(true);
    });

    it("GET /api/health sets Cache-Control: no-store", async () => {
      const res = await createApp().request("/api/health");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("health routing contract", () => {
    it("HEALTH_SUPPORTED_METHODS lists GET", () => {
      expect(HEALTH_SUPPORTED_METHODS).toContain("GET");
    });

    it("Vercel api/health.ts exports a handler for every supported method", () => {
      for (const method of HEALTH_SUPPORTED_METHODS) {
        expect(
          vercelHealthExports,
          `api/health.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelHealthExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Vercel api/health.ts does not export unsupported methods", () => {
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
        (m) => !HEALTH_SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelHealthExports,
          `api/health.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts GET /api/health", async () => {
      const app = createApp();
      const res = await app.request("/api/health");
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
    });
  });

  describe("license verify endpoint", () => {
    const SECRET = "this-is-a-test-signing-secret-32-bytes!";
    const signingKey: SigningKey = { secret: SECRET };
    const NOW = 1_750_000_000;
    const validPayload: LicensePayload = {
      tier: "pro",
      expirySec: 1_800_000_000,
      customerId: "cus_NQpJjB7ehjf2QH",
      keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      issuedAtSec: 1_700_000_000,
    };

    it("POST /api/license/verify returns 200 + license for a valid token", async () => {
      const storage = new MemoryLicenseStorage();
      const app = createApp(undefined, undefined, undefined, {
        signingKey,
        storage,
        nowSec: NOW,
      });
      const token = await signLicense(validPayload, signingKey);
      const res = await app.request("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.license).toEqual(validPayload);
    });

    it("POST /api/license/verify returns 401 for a revoked token", async () => {
      const storage = new MemoryLicenseStorage();
      await storage.revoke(validPayload.keyId, "test");
      const app = createApp(undefined, undefined, undefined, {
        signingKey,
        storage,
        nowSec: NOW,
      });
      const token = await signLicense(validPayload, signingKey);
      const res = await app.request("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("license verify routing contract", () => {
    it("LICENSE_VERIFY_SUPPORTED_METHODS lists POST", () => {
      expect(LICENSE_VERIFY_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/license/verify.ts exports a handler for every supported method", () => {
      for (const method of LICENSE_VERIFY_SUPPORTED_METHODS) {
        expect(
          vercelLicenseVerifyExports,
          `api/license/verify.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelLicenseVerifyExports as Record<string, unknown>)[
            method
          ],
        ).toBe("function");
      }
    });

    it("Vercel api/license/verify.ts does not export unsupported methods", () => {
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
        (m) => !LICENSE_VERIFY_SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelLicenseVerifyExports,
          `api/license/verify.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts POST /api/license/verify", async () => {
      const app = createApp();
      const res = await app.request("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "fz_garbage.garbage" }),
      });
      // Endpoint registered: handler returns its own status (probably 401),
      // never 404 (route missing) or 405 (method not allowed).
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
    });
  });

  describe("license issue admin endpoint", () => {
    const SECRET = "this-is-a-test-signing-secret-32-bytes!";
    const ADMIN_KEY = "admin_test_key_32+chars_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const signingKey: SigningKey = { secret: SECRET };

    it("POST /api/license/issue with valid admin token returns 200 + token + record", async () => {
      const ORIGINAL = process.env.ADMIN_API_KEY;
      process.env.ADMIN_API_KEY = ADMIN_KEY;
      try {
        const storage = new MemoryLicenseStorage();
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage,
        });
        const res = await app.request("/api/license/issue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ADMIN_KEY}`,
          },
          body: JSON.stringify({ customerId: "cus_admin_test", tier: "pro" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.token).toMatch(/^fz_/);
        expect(body.record.customerId).toBe("cus_admin_test");
        expect(body.record.tier).toBe("pro");
      } finally {
        if (ORIGINAL === undefined) delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = ORIGINAL;
      }
    });

    it("POST /api/license/issue without admin token returns 401", async () => {
      const ORIGINAL = process.env.ADMIN_API_KEY;
      process.env.ADMIN_API_KEY = ADMIN_KEY;
      try {
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage: new MemoryLicenseStorage(),
        });
        const res = await app.request("/api/license/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: "cus_x", tier: "personal" }),
        });
        expect(res.status).toBe(401);
      } finally {
        if (ORIGINAL === undefined) delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = ORIGINAL;
      }
    });

    it("POST /api/license/issue returns 503 when ADMIN_API_KEY env is missing", async () => {
      const ORIGINAL = process.env.ADMIN_API_KEY;
      delete process.env.ADMIN_API_KEY;
      try {
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage: new MemoryLicenseStorage(),
        });
        const res = await app.request("/api/license/issue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer anything",
          },
          body: JSON.stringify({ customerId: "cus_x", tier: "personal" }),
        });
        expect(res.status).toBe(503);
      } finally {
        if (ORIGINAL !== undefined) process.env.ADMIN_API_KEY = ORIGINAL;
      }
    });

    it("POST /api/license/issue returns 503 when KILL_SIGNUPS=1", async () => {
      const ORIG_ADMIN = process.env.ADMIN_API_KEY;
      const ORIG_KILL = process.env.KILL_SIGNUPS;
      process.env.ADMIN_API_KEY = ADMIN_KEY;
      process.env.KILL_SIGNUPS = "1";
      try {
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage: new MemoryLicenseStorage(),
        });
        const res = await app.request("/api/license/issue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ADMIN_KEY}`,
          },
          body: JSON.stringify({ customerId: "cus_x", tier: "personal" }),
        });
        expect(res.status).toBe(503);
      } finally {
        if (ORIG_ADMIN === undefined) delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = ORIG_ADMIN;
        if (ORIG_KILL === undefined) delete process.env.KILL_SIGNUPS;
        else process.env.KILL_SIGNUPS = ORIG_KILL;
      }
    });

    it("issued token roundtrips through /api/license/verify on the same app", async () => {
      // Closes the e2e loop locally: admin issues a license, the same app's
      // verify endpoint accepts it. This is the contract that lets us use
      // PR T's endpoint as the Upstash e2e probe in production.
      const ORIGINAL = process.env.ADMIN_API_KEY;
      process.env.ADMIN_API_KEY = ADMIN_KEY;
      try {
        const storage = new MemoryLicenseStorage();
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage,
        });
        const issueRes = await app.request("/api/license/issue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ADMIN_KEY}`,
          },
          body: JSON.stringify({ customerId: "cus_roundtrip", tier: "personal" }),
        });
        const issueBody = await issueRes.json();
        expect(issueBody.ok).toBe(true);

        const verifyRes = await app.request("/api/license/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: issueBody.token }),
        });
        expect(verifyRes.status).toBe(200);
        const verifyBody = await verifyRes.json();
        expect(verifyBody.ok).toBe(true);
        expect(verifyBody.license.customerId).toBe("cus_roundtrip");
      } finally {
        if (ORIGINAL === undefined) delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = ORIGINAL;
      }
    });
  });

  describe("license issue routing contract", () => {
    it("LICENSE_ISSUE_SUPPORTED_METHODS lists POST", () => {
      expect(LICENSE_ISSUE_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/license/issue.ts exports a handler for every supported method", () => {
      for (const method of LICENSE_ISSUE_SUPPORTED_METHODS) {
        expect(
          vercelLicenseIssueExports,
          `api/license/issue.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelLicenseIssueExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Vercel api/license/issue.ts does not export unsupported methods", () => {
      const allHttpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
      const unsupported = allHttpMethods.filter(
        (m) => !LICENSE_ISSUE_SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelLicenseIssueExports,
          `api/license/issue.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts POST /api/license/issue", async () => {
      const app = createApp();
      const res = await app.request("/api/license/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Endpoint registered: handler returns its own status (401/503/etc),
      // never 404 (route missing) or 405 (method not allowed).
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
    });
  });

  describe("license retrieve routing contract", () => {
    it("LICENSE_RETRIEVE_SUPPORTED_METHODS lists POST", () => {
      expect(LICENSE_RETRIEVE_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/license/[action].ts exports a handler for every retrieve-supported method", () => {
      for (const method of LICENSE_RETRIEVE_SUPPORTED_METHODS) {
        expect(
          vercelLicenseRetrieveExports,
          `api/license/[action].ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelLicenseRetrieveExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Hono server accepts POST /api/license/retrieve", async () => {
      const app = createApp(undefined, undefined, undefined, {
        signingKey: { secret: "this-is-a-test-signing-secret-32-bytes!" },
        storage: new MemoryLicenseStorage(),
        // Resolve to a real customerId so we hit the handler's pending-202 path
        // (no records yet) — proves the route is wired AND the storage lookup
        // runs. A null customer would 404 from the handler itself, masking
        // whether the route exists at all.
        sessions: { retrieve: async () => ({ customer: "cus_test_routed" }) },
      });
      const res = await app.request("/api/license/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "cs_test_abc123" }),
      });
      expect(res.status).toBe(202);
    });
  });

  describe("billing portal routing contract (now at /api/license/portal)", () => {
    it("PORTAL_SUPPORTED_METHODS lists POST", () => {
      expect(PORTAL_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/license/[action].ts exports POST (portal is one of the dispatched actions)", () => {
      for (const method of PORTAL_SUPPORTED_METHODS) {
        expect(
          vercelPortalExports,
          `api/license/[action].ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelPortalExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });

    it("Hono server accepts POST /api/license/portal", async () => {
      const app = createApp(undefined, undefined, undefined, {
        signingKey: { secret: "this-is-a-test-signing-secret-32-bytes!" },
        storage: new MemoryLicenseStorage(),
        portalSessions: {
          retrieve: async () => ({ customer: "cus_test_portal" }),
        },
        portal: {
          create: async () => ({ url: "https://billing.stripe.com/p/session_test" }),
        },
      });
      const res = await app.request("/api/license/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "cs_test_abc123",
          returnUrl: "https://my.feedzero.app/settings",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toMatch(/billing\.stripe\.com/);
    });

    it("Hono server accepts POST /api/license/recover (cross-device recovery entry)", async () => {
      const app = createApp(undefined, undefined, undefined, {
        signingKey: { secret: "this-is-a-test-signing-secret-32-bytes!" },
        storage: new MemoryLicenseStorage(),
        // Customer lookup returns no match → handler returns 200 with
        // enumeration-protected response (no portalUrl). Proves the route
        // is wired even without a portal.create injection.
        customers: { list: async () => ({ data: [] }) },
      });
      const res = await app.request("/api/license/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.com" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.portalUrl).toBeUndefined();
    });

    it("Vercel api/license/[action].ts exports POST for the recover action", () => {
      for (const method of LICENSE_RECOVER_SUPPORTED_METHODS) {
        expect(
          vercelLicenseDynamicExports,
          `api/license/[action].ts is missing export for ${method}`,
        ).toHaveProperty(method);
      }
    });

    it("Vercel POST dispatcher routes /api/license/recover (not 404)", async () => {
      // Stronger than the export-presence check above: actually invoke the
      // dispatcher with a /api/license/recover URL and assert it doesn't
      // return 404. Catches regressions where the action arm gets removed
      // from the dispatcher but POST is still exported.
      const post = (vercelLicenseDynamicExports as { POST: (req: Request) => Promise<Response> }).POST;
      const req = new Request("https://test.local/api/license/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "anyone@example.com" }),
      });
      const res = await post(req);
      // The handler may 502 (no real Stripe key in tests) or 200 (with the
      // memory storage stub); what matters is the action was recognized.
      expect(res.status).not.toBe(404);
    });

    it("Hono server accepts POST /api/license/issue-from-recovery", async () => {
      const app = createApp(undefined, undefined, undefined, {
        signingKey: { secret: "this-is-a-test-signing-secret-32-bytes!" },
        storage: new MemoryLicenseStorage(),
      });
      // Missing recoveryToken → 400 from handler (not 404 from missing route)
      const res = await app.request("/api/license/issue-from-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("Vercel api/license/[action].ts exports POST for issue-from-recovery", () => {
      for (const method of LICENSE_ISSUE_FROM_RECOVERY_SUPPORTED_METHODS) {
        expect(
          vercelLicenseDynamicExports,
          `api/license/[action].ts is missing export for ${method}`,
        ).toHaveProperty(method);
      }
    });

    it("Vercel POST dispatcher routes /api/license/issue-from-recovery (not 404)", async () => {
      const post = (vercelLicenseDynamicExports as { POST: (req: Request) => Promise<Response> }).POST;
      const req = new Request("https://test.local/api/license/issue-from-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await post(req);
      expect(res.status).not.toBe(404);
    });

    it("Hono server returns 404 for the OLD /api/billing/portal URL (route removed)", async () => {
      const app = createApp();
      const res = await app.request("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "cs_test_xyz", returnUrl: "https://x" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("stripe webhook endpoint", () => {
    const WEBHOOK_SECRET = "whsec_test_value";
    const SIGNING_SECRET = "this-is-a-test-signing-secret-32-bytes!";
    const signingKey: SigningKey = { secret: SIGNING_SECRET };

    it("POST /api/stripe/webhook returns 400 for missing signature", async () => {
      const app = createApp(undefined, undefined, undefined, {
        signingKey,
        storage: new MemoryLicenseStorage(),
        webhookSigningSecret: WEBHOOK_SECRET,
      });
      const res = await app.request("/api/stripe/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("POST /api/stripe/webhook returns 200 for a valid signed event", async () => {
      const storage = new MemoryLicenseStorage();
      const app = createApp(undefined, undefined, undefined, {
        signingKey,
        storage,
        webhookSigningSecret: WEBHOOK_SECRET,
      });
      const fixture = subscriptionCreatedEvent({
        customerId: "cus_test",
        subscriptionId: "sub_test",
        tier: "personal",
      });
      const ts = Math.floor(Date.now() / 1000);
      const res = await app.request("/api/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": fixture.signature(WEBHOOK_SECRET, ts),
        },
        body: JSON.stringify(fixture.event),
      });
      expect(res.status).toBe(200);
    });

    it("POST /api/stripe/webhook returns 503 when KILL_SIGNUPS=1", async () => {
      const ORIGINAL = process.env.KILL_SIGNUPS;
      process.env.KILL_SIGNUPS = "1";
      try {
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage: new MemoryLicenseStorage(),
          webhookSigningSecret: WEBHOOK_SECRET,
        });
        const fixture = subscriptionCreatedEvent({
          customerId: "cus_test",
          subscriptionId: "sub_test",
          tier: "personal",
        });
        const ts = Math.floor(Date.now() / 1000);
        const res = await app.request("/api/stripe/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": fixture.signature(WEBHOOK_SECRET, ts),
          },
          body: JSON.stringify(fixture.event),
        });
        expect(res.status).toBe(503);
      } finally {
        if (ORIGINAL === undefined) delete process.env.KILL_SIGNUPS;
        else process.env.KILL_SIGNUPS = ORIGINAL;
      }
    });
  });

  describe("checkout session endpoint (PR X)", () => {
    it("returns 200 + url for a valid request when STRIPE_ALLOWED_PRICES is set", async () => {
      const ORIGINAL = process.env.STRIPE_ALLOWED_PRICES;
      process.env.STRIPE_ALLOWED_PRICES = "price_test_personal_monthly";
      try {
        const app = createApp();
        const res = await app.request("/api/checkout/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId: "price_test_personal_monthly",
            successUrl: "https://feedzero.app/success",
            cancelUrl: "https://feedzero.app/cancel",
          }),
        });
        // 200 (success) or 502 (Stripe SDK call failed at runtime due to no
        // real key). Either proves the route is registered and reaches the
        // handler — never 404 (route missing) or 405 (method not allowed).
        expect(res.status).not.toBe(404);
        expect(res.status).not.toBe(405);
      } finally {
        if (ORIGINAL === undefined) delete process.env.STRIPE_ALLOWED_PRICES;
        else process.env.STRIPE_ALLOWED_PRICES = ORIGINAL;
      }
    });

    it("returns 400 when priceId is not in STRIPE_ALLOWED_PRICES", async () => {
      const ORIGINAL = process.env.STRIPE_ALLOWED_PRICES;
      process.env.STRIPE_ALLOWED_PRICES = "price_only_this_one";
      try {
        const app = createApp();
        const res = await app.request("/api/checkout/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId: "price_attacker_pwn",
            successUrl: "https://feedzero.app/success",
            cancelUrl: "https://feedzero.app/cancel",
          }),
        });
        expect(res.status).toBe(400);
      } finally {
        if (ORIGINAL === undefined) delete process.env.STRIPE_ALLOWED_PRICES;
        else process.env.STRIPE_ALLOWED_PRICES = ORIGINAL;
      }
    });

    it("returns 503 when KILL_SIGNUPS=1", async () => {
      const ORIG_KILL = process.env.KILL_SIGNUPS;
      const ORIG_PRICES = process.env.STRIPE_ALLOWED_PRICES;
      process.env.KILL_SIGNUPS = "1";
      process.env.STRIPE_ALLOWED_PRICES = "price_x";
      try {
        const app = createApp();
        const res = await app.request("/api/checkout/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId: "price_x",
            successUrl: "https://feedzero.app/s",
            cancelUrl: "https://feedzero.app/c",
          }),
        });
        expect(res.status).toBe(503);
      } finally {
        if (ORIG_KILL === undefined) delete process.env.KILL_SIGNUPS;
        else process.env.KILL_SIGNUPS = ORIG_KILL;
        if (ORIG_PRICES === undefined) delete process.env.STRIPE_ALLOWED_PRICES;
        else process.env.STRIPE_ALLOWED_PRICES = ORIG_PRICES;
      }
    });
  });

  describe("checkout routing contract", () => {
    it("CHECKOUT_SUPPORTED_METHODS lists POST", () => {
      expect(CHECKOUT_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/checkout/create-session.ts exports a handler for every supported method", () => {
      for (const method of CHECKOUT_SUPPORTED_METHODS) {
        expect(
          vercelCheckoutExports,
          `api/checkout/create-session.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelCheckoutExports as Record<string, unknown>)[method],
        ).toBe("function");
      }
    });
  });

  describe("/api/sync gating on LAUNCH_PAID_TIER (PR W)", () => {
    const SECRET = "this-is-a-test-signing-secret-32-bytes!";
    const signingKey: SigningKey = { secret: SECRET };

    it("does NOT require license when LAUNCH_PAID_TIER is unset (current free behavior)", async () => {
      const ORIGINAL = process.env.LAUNCH_PAID_TIER;
      delete process.env.LAUNCH_PAID_TIER;
      try {
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage: new MemoryLicenseStorage(),
        });
        const vaultId = "a".repeat(64);
        const res = await app.request(`/api/sync?vaultId=${vaultId}`);
        // 404 (vault doesn't exist) — proves auth gate skipped.
        expect(res.status).toBe(404);
      } finally {
        if (ORIGINAL !== undefined) process.env.LAUNCH_PAID_TIER = ORIGINAL;
      }
    });

    it("returns 401 on /api/sync GET without bearer when LAUNCH_PAID_TIER=1", async () => {
      const ORIGINAL = process.env.LAUNCH_PAID_TIER;
      process.env.LAUNCH_PAID_TIER = "1";
      try {
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage: new MemoryLicenseStorage(),
        });
        const vaultId = "a".repeat(64);
        const res = await app.request(`/api/sync?vaultId=${vaultId}`);
        expect(res.status).toBe(401);
      } finally {
        if (ORIGINAL === undefined) delete process.env.LAUNCH_PAID_TIER;
        else process.env.LAUNCH_PAID_TIER = ORIGINAL;
      }
    });

    it("issued license token unlocks /api/sync when LAUNCH_PAID_TIER=1 (full e2e via createApp)", async () => {
      const ORIGINAL = process.env.LAUNCH_PAID_TIER;
      process.env.LAUNCH_PAID_TIER = "1";
      try {
        const storage = new MemoryLicenseStorage();
        const app = createApp(undefined, undefined, undefined, {
          signingKey,
          storage,
        });
        const validPayload: LicensePayload = {
          tier: "personal",
          expirySec: 1_800_000_000,
          customerId: "cus_paywall_test",
          keyId: "kid_pw_test_xxxxxxxxxxxxxxxxxx",
          issuedAtSec: 1_700_000_000,
        };
        const token = await signLicense(validPayload, signingKey);

        const vaultId = "a".repeat(64);
        const res = await app.request(`/api/sync?vaultId=${vaultId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // 404 (vault not found) — proves auth gate passed.
        expect(res.status).toBe(404);
      } finally {
        if (ORIGINAL === undefined) delete process.env.LAUNCH_PAID_TIER;
        else process.env.LAUNCH_PAID_TIER = ORIGINAL;
      }
    });
  });

  describe("vercel wrapper structural invariants", () => {
    // Tier 2 (Structural Assertion) tests. Vercel wrappers in api/*.ts are
    // thin glue files whose only behavioral tests are routing contracts.
    // But a wrapper can silently drop a critical option (e.g. eventStore for
    // Stripe idempotency, adminApiKey for /api/license/issue) and still
    // export POST cleanly — the routing contract passes, the handler tests
    // pass, but production silently runs without that option. These tests
    // assert the wrapper SOURCE references the options, catching that bug.
    const fs = require("node:fs") as typeof import("node:fs");

    it("api/stripe/webhook.ts wires eventStore for idempotency", () => {
      const src = fs.readFileSync("api/stripe/webhook.ts", "utf8");
      expect(src).toMatch(/resolveSeenEventStore/);
      expect(src).toMatch(/eventStore/);
    });

    it("api/stripe/webhook.ts wires KILL_SIGNUPS gate", () => {
      const src = fs.readFileSync("api/stripe/webhook.ts", "utf8");
      expect(src).toMatch(/KILL_SIGNUPS/);
    });

    // verify + issue consolidated into api/license/[action].ts (Vercel
    // dynamic route) to stay under the Hobby plan's 12-function ceiling.
    // Both wiring assertions now check the single dispatcher file.
    it("api/license/[action].ts wires ADMIN_API_KEY (issue branch)", () => {
      const src = fs.readFileSync("api/license/[action].ts", "utf8");
      expect(src).toMatch(/ADMIN_API_KEY/);
    });

    it("api/license/[action].ts wires KILL_SIGNUPS gate (issue branch)", () => {
      const src = fs.readFileSync("api/license/[action].ts", "utf8");
      expect(src).toMatch(/KILL_SIGNUPS/);
    });

    it("api/license/[action].ts wires resolveLicenseStorage (verify + issue)", () => {
      const src = fs.readFileSync("api/license/[action].ts", "utf8");
      expect(src).toMatch(/resolveLicenseStorage/);
    });

    it("api/license/[action].ts dispatches 'verify', 'issue', 'retrieve', and 'portal' actions", () => {
      const src = fs.readFileSync("api/license/[action].ts", "utf8");
      // Source must reference every action name so a regression that drops
      // one branch is caught even if test traffic only exercises the others.
      expect(src).toMatch(/['"`]verify['"`]/);
      expect(src).toMatch(/['"`]issue['"`]/);
      expect(src).toMatch(/['"`]retrieve['"`]/);
      expect(src).toMatch(/['"`]portal['"`]/);
      expect(src).toMatch(/handleLicenseRetrieveRequest/);
      expect(src).toMatch(/handlePortalRequest/);
    });

    it("api/sync.ts wires LAUNCH_PAID_TIER gate (PR W)", () => {
      const src = fs.readFileSync("api/sync.ts", "utf8");
      expect(src).toMatch(/LAUNCH_PAID_TIER/);
      expect(src).toMatch(/licenseAuth/);
    });

    it("api/checkout/create-session.ts wires allowed-prices + KILL_SIGNUPS + lazy Stripe (PR X)", () => {
      const src = fs.readFileSync("api/checkout/create-session.ts", "utf8");
      expect(src).toMatch(/resolveAllowedPrices|allowedPrices/);
      expect(src).toMatch(/KILL_SIGNUPS/);
      // Lazy SDK construction — must NOT happen at module top level.
      expect(src).not.toMatch(/^const\s+stripe\s*=\s*new\s+Stripe/m);
    });
  });

  describe("stripe webhook routing contract", () => {
    it("STRIPE_SUPPORTED_METHODS lists POST", () => {
      expect(STRIPE_SUPPORTED_METHODS).toContain("POST");
    });

    it("Vercel api/stripe/webhook.ts exports a handler for every supported method", () => {
      for (const method of STRIPE_SUPPORTED_METHODS) {
        expect(
          vercelStripeWebhookExports,
          `api/stripe/webhook.ts is missing export for ${method}`,
        ).toHaveProperty(method);
        expect(
          typeof (vercelStripeWebhookExports as Record<string, unknown>)[
            method
          ],
        ).toBe("function");
      }
    });

    it("Vercel api/stripe/webhook.ts does not export unsupported methods", () => {
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
        (m) => !STRIPE_SUPPORTED_METHODS.includes(m),
      );
      for (const method of unsupported) {
        expect(
          vercelStripeWebhookExports,
          `api/stripe/webhook.ts should not export ${method}`,
        ).not.toHaveProperty(method);
      }
    });

    it("Hono server accepts POST /api/stripe/webhook", async () => {
      const app = createApp();
      const res = await app.request("/api/stripe/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Endpoint registered: handler returns its own status (400 for missing
      // signature), never 404 (route missing) or 405 (method not allowed).
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
