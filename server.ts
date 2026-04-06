import { Hono } from "hono";
import { handleProxyRequest } from "./src/core/proxy/proxy-handler";
import { handleFeedbackRequest } from "./src/core/feedback/feedback-handler";
import { handleSyncRequest } from "./src/core/sync/sync-handler";
import { handleSyncStatsRequest } from "./src/core/sync/sync-stats-handler";
import { handleFaviconRequest } from "./src/core/favicon/favicon-handler";
import { handleCatalogRequest } from "./src/core/catalog/catalog-handler";
import { handleChangelogRequest } from "./src/core/changelog/changelog-handler";
import { createMemoryAdapter } from "./src/core/sync/adapters/memory-adapter";
import { createMemoryCatalogAdapter } from "./src/core/catalog/adapters/memory-adapter";
import { resolveAdapter } from "./src/core/sync/adapters/resolve-adapter";
import { createFeedCache } from "./src/core/proxy/feed-cache";
import type { SyncStorageAdapter } from "./src/core/sync/types";
import type { CatalogStorageAdapter } from "./src/core/catalog/catalog-types";
import type { FeedCache } from "./src/core/proxy/feed-cache";

/**
 * Simple in-memory rate limiter using a sliding window per IP.
 * Returns true if the request should be allowed, false if rate-limited.
 */
function createRateLimiter(maxRequests = 100, windowMs = 60_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function isAllowed(ip: string): boolean {
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= maxRequests) return false;
    entry.count++;
    return true;
  };
}

/**
 * Creates the Hono app with all API routes mounted.
 * Accepts an optional storage adapter; defaults to resolveAdapter()
 * in production, memory adapter in tests.
 */
export function createApp(
  adapter?: SyncStorageAdapter,
  feedCache?: FeedCache,
  catalogAdapter?: CatalogStorageAdapter,
): Hono {
  const syncAdapter = adapter ?? createMemoryAdapter();
  const catalog = catalogAdapter ?? createMemoryCatalogAdapter();
  const app = new Hono();
  const isAllowed = createRateLimiter();

  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  app.use("*", async (c, next) => {
    await next();
    if (!c.req.path.startsWith("/api/")) {
      c.header("Content-Security-Policy", CSP);
      c.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
      c.header("X-Content-Type-Options", "nosniff");
      c.header("X-Frame-Options", "DENY");
      c.header("Referrer-Policy", "no-referrer");
      c.header(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=()",
      );
    }
  });

  // Rate limit API endpoints
  app.use("/api/*", async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!isAllowed(ip)) {
      return c.text("Too many requests", 429);
    }
    await next();
  });

  // Health/diagnostics endpoint
  app.get("/api/diagnostics", (c) =>
    c.json({
      status: "ok",
      version: "0.1.0-alpha",
      timestamp: new Date().toISOString(),
      cache: feedCache ? { entries: feedCache.size } : null,
    }),
  );

  // Anonymous aggregate feed stats — no user identity, no correlation
  app.get("/api/stats/feeds", (c) => {
    if (!feedCache) return c.json({ feeds: [] });
    return c.json({ feeds: feedCache.getStats() });
  });

  const proxyOpts = {
    ...(feedCache ? { cache: feedCache } : {}),
    catalogAdapter: catalog,
    cleanContent: true,
  };

  app.on(["GET", "POST"], "/api/feed", (c) =>
    handleProxyRequest(c.req.raw, "text/xml", proxyOpts),
  );
  app.on(["GET", "POST"], "/api/page", (c) =>
    handleProxyRequest(c.req.raw, "text/html", proxyOpts),
  );
  app.get("/api/icon", (c) =>
    handleProxyRequest(c.req.raw, "image/x-icon", { cache: feedCache }),
  );
  app.get("/api/favicon", (c) => handleFaviconRequest(c.req.raw));
  app.all("/api/sync", (c) => handleSyncRequest(c.req.raw, syncAdapter));
  app.get("/api/stats-sync", (c) => handleSyncStatsRequest(c.req.raw, syncAdapter));
  app.post("/api/feedback", (c) => handleFeedbackRequest(c.req.raw));
  app.get("/api/catalog", (c) => handleCatalogRequest(c.req.raw, catalog));
  app.get("/api/changelog.xml", (c) => handleChangelogRequest(c.req.raw));

  return app;
}

/* istanbul ignore next -- only runs when executed directly */
async function startServer(): Promise<void> {
  const { serve } = await import("@hono/node-server");
  const { serveStatic } = await import("@hono/node-server/serve-static");

  const adapter = resolveAdapter();
  const cache = createFeedCache();
  const catalog = createMemoryCatalogAdapter();
  const app = createApp(adapter, cache, catalog);

  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("/*", serveStatic({ path: "./dist/index.html" }));

  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: app.fetch, port });
  console.log(`FeedZero server running on http://localhost:${port}`);
}

const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("server.js"));

if (isDirectExecution) {
  startServer();
}
