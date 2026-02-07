import { Hono } from "hono";
import { handleProxyRequest } from "./src/core/proxy/proxy-handler";
import { handleSyncRequest } from "./src/core/sync/sync-handler";
import { createMemoryAdapter } from "./src/core/sync/adapters/memory-adapter";
import { resolveAdapter } from "./src/core/sync/adapters/resolve-adapter";
import type { SyncStorageAdapter } from "./src/core/sync/types";

/**
 * Creates the Hono app with all API routes mounted.
 * Accepts an optional storage adapter; defaults to resolveAdapter()
 * in production, memory adapter in tests.
 */
export function createApp(adapter?: SyncStorageAdapter): Hono {
  const syncAdapter = adapter ?? createMemoryAdapter();
  const app = new Hono();

  app.get("/api/feed", (c) => handleProxyRequest(c.req.raw, "text/xml"));
  app.get("/api/page", (c) => handleProxyRequest(c.req.raw, "text/html"));
  app.get("/api/icon", (c) => handleProxyRequest(c.req.raw, "image/x-icon"));
  app.all("/api/sync", (c) => handleSyncRequest(c.req.raw, syncAdapter));

  return app;
}

/* istanbul ignore next -- only runs when executed directly */
async function startServer(): Promise<void> {
  const { serve } = await import("@hono/node-server");
  const { serveStatic } = await import("@hono/node-server/serve-static");

  const adapter = resolveAdapter();
  const app = createApp(adapter);

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
