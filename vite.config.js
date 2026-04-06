import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * Converts a Node IncomingMessage to a Web Request object.
 */
async function toWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyStr = Buffer.concat(chunks).toString();

  const url = new URL(req.url, "http://localhost");
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers: { "Content-Type": req.headers["content-type"] || "" },
    ...(hasBody ? { body: bodyStr } : {}),
  });
}

/**
 * Sends a Web Response through a Node ServerResponse.
 */
async function sendWebResponse(webRes, res) {
  res.statusCode = webRes.status;
  for (const [key, value] of webRes.headers.entries()) {
    res.setHeader(key, value);
  }
  res.end(Buffer.from(await webRes.arrayBuffer()));
}

/**
 * Dev server API proxy plugin.
 * All handlers are lazy-imported to avoid Node loading issues at config time.
 * Proxy and sync handler chains use only relative imports (no @/ aliases).
 */
function apiProxyPlugin() {
  return {
    name: "api-proxy",
    configureServer(server) {
      let proxyHandler = null;
      let feedCache = null;
      let syncHandler = null;
      let syncAdapter = null;
      let catalogAdapter = null;
      let catalogHandler = null;

      async function ensureProxyHandler() {
        if (!proxyHandler) {
          const [proxyMod, cacheMod, catalogMod] = await Promise.all([
            import("./src/core/proxy/proxy-handler.ts"),
            import("./src/core/proxy/feed-cache.ts"),
            import("./src/core/catalog/adapters/memory-adapter.ts"),
          ]);
          proxyHandler = proxyMod.handleProxyRequest;
          feedCache = cacheMod.createFeedCache();
          catalogAdapter = catalogMod.createMemoryCatalogAdapter();
        }
        return proxyHandler;
      }

      async function ensureCatalogHandler() {
        if (!catalogHandler) {
          await ensureProxyHandler(); // ensures catalogAdapter exists
          const mod = await import("./src/core/catalog/catalog-handler.ts");
          catalogHandler = mod.handleCatalogRequest;
        }
        return { catalogHandler, catalogAdapter };
      }

      async function ensureSyncHandler() {
        if (!syncHandler) {
          const [handlerMod, adapterMod] = await Promise.all([
            import("./src/core/sync/sync-handler.ts"),
            import("./src/core/sync/adapters/memory-adapter.ts"),
          ]);
          syncHandler = handlerMod.handleSyncRequest;
          syncAdapter = adapterMod.createMemoryAdapter();
        }
        return { syncHandler, syncAdapter };
      }

      const proxyOpts = () => ({ cache: feedCache, catalogAdapter, cleanContent: true });

      server.middlewares.use("/api/feed", async (req, res) => {
        const handler = await ensureProxyHandler();
        const webReq = await toWebRequest(req);
        const webRes = await handler(webReq, "text/xml", proxyOpts());
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/page", async (req, res) => {
        const handler = await ensureProxyHandler();
        const webReq = await toWebRequest(req);
        const webRes = await handler(webReq, "text/html", proxyOpts());
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/icon", async (req, res) => {
        const handler = await ensureProxyHandler();
        const webReq = await toWebRequest(req);
        const webRes = await handler(webReq, "image/x-icon", { cache: feedCache });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/favicon", async (req, res) => {
        const { handleFaviconRequest } = await import(
          "./src/core/favicon/favicon-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleFaviconRequest(webReq);
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/changelog.xml", async (req, res) => {
        const { handleChangelogRequest } = await import(
          "./src/core/changelog/changelog-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleChangelogRequest(webReq);
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/stats-sync", async (req, res) => {
        const { syncAdapter } = await ensureSyncHandler();
        const { handleSyncStatsRequest } = await import(
          "./src/core/sync/sync-stats-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleSyncStatsRequest(webReq, syncAdapter);
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/sync", async (req, res) => {
        const { syncHandler, syncAdapter } = await ensureSyncHandler();
        const webReq = await toWebRequest(req);
        const webRes = await syncHandler(webReq, syncAdapter);
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/catalog", async (req, res) => {
        const { catalogHandler, catalogAdapter } = await ensureCatalogHandler();
        const webReq = await toWebRequest(req);
        const webRes = await catalogHandler(webReq, catalogAdapter);
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/feedback", async (req, res) => {
        const { handleFeedbackRequest } = await import(
          "./src/core/feedback/feedback-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleFeedbackRequest(webReq);
        await sendWebResponse(webRes, res);
      });
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), tailwindcss(), apiProxyPlugin()],
});
