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
  res.end(await webRes.text());
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
      let syncHandler = null;
      let syncAdapter = null;

      async function ensureProxyHandler() {
        if (!proxyHandler) {
          const mod = await import("./src/core/proxy/proxy-handler.ts");
          proxyHandler = mod.handleProxyRequest;
        }
        return proxyHandler;
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

      server.middlewares.use("/api/feed", async (req, res) => {
        const handler = await ensureProxyHandler();
        const webReq = await toWebRequest(req);
        const webRes = await handler(webReq, "text/xml");
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/page", async (req, res) => {
        const handler = await ensureProxyHandler();
        const webReq = await toWebRequest(req);
        const webRes = await handler(webReq, "text/html");
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/sync", async (req, res) => {
        const { syncHandler, syncAdapter } = await ensureSyncHandler();
        const webReq = await toWebRequest(req);
        const webRes = await syncHandler(webReq, syncAdapter);
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
