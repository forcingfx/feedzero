import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { toWebRequest, sendWebResponse } from "./vite-dev-proxy.js";

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
        const { licenseStorage } = await ensureLicenseDeps();
        const { isFlagEnabled } = await import("./src/core/flags/flags.ts");
        const webReq = await toWebRequest(req);
        // PR W: when LAUNCH_PAID_TIER=1, /api/sync requires a Bearer license.
        const opts = isFlagEnabled("LAUNCH_PAID_TIER")
          ? {
              licenseAuth: {
                signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
                storage: licenseStorage,
              },
            }
          : {};
        const webRes = await syncHandler(webReq, syncAdapter, opts);
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

      server.middlewares.use("/api/health", async (req, res) => {
        const { handleHealthRequest } = await import(
          "./src/core/health/health-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleHealthRequest(webReq);
        await sendWebResponse(webRes, res);
      });

      // License + Stripe wiring. We share one resolved storage across all
      // endpoints so revocations performed via the webhook are immediately
      // visible to /api/license/verify in the same dev session. The resolvers
      // pick Upstash if UPSTASH_*/KV_REST_API_* env vars are set, otherwise
      // in-memory — dev typically runs without Upstash so this defaults to
      // memory. Same shape across all wrappers.
      let licenseStorage = null;
      let licenseIssuer = null;
      let stripeEventStore = null;

      async function ensureLicenseDeps() {
        if (!licenseStorage) {
          const [resolverMod, issuerMod, eventResolverMod] = await Promise.all([
            import("./src/core/license/resolve-storage.ts"),
            import("./src/core/license/issuer.ts"),
            import("./src/core/stripe/resolve-seen-event-store.ts"),
          ]);
          licenseStorage = await resolverMod.resolveLicenseStorage();
          stripeEventStore = await eventResolverMod.resolveSeenEventStore();
          licenseIssuer = new issuerMod.LicenseIssuerImpl({
            signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
            storage: licenseStorage,
          });
        }
        return { licenseStorage, licenseIssuer, stripeEventStore };
      }

      server.middlewares.use("/api/stripe/webhook", async (req, res) => {
        const { licenseIssuer, stripeEventStore } = await ensureLicenseDeps();
        const [{ handleStripeWebhook }, { isFlagEnabled }] = await Promise.all([
          import("./src/core/stripe/webhook-handler.ts"),
          import("./src/core/flags/flags.ts"),
        ]);
        const webReq = await toWebRequest(req);
        const webRes = await handleStripeWebhook(webReq, {
          signingSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
          issuer: licenseIssuer,
          eventStore: stripeEventStore,
          killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
        });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/license/verify", async (req, res) => {
        const { licenseStorage } = await ensureLicenseDeps();
        const { handleLicenseVerifyRequest } = await import(
          "./src/core/license/verify-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleLicenseVerifyRequest(webReq, {
          signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
          storage: licenseStorage,
        });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/license/issue", async (req, res) => {
        const { licenseIssuer } = await ensureLicenseDeps();
        const [{ handleLicenseIssueRequest }, { isFlagEnabled }] = await Promise.all([
          import("./src/core/license/issue-handler.ts"),
          import("./src/core/flags/flags.ts"),
        ]);
        const webReq = await toWebRequest(req);
        const webRes = await handleLicenseIssueRequest(webReq, {
          issuer: licenseIssuer,
          adminApiKey: process.env.ADMIN_API_KEY ?? "",
          killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
        });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/checkout/create-session", async (req, res) => {
        const [
          { handleCreateCheckoutSession },
          { resolveAllowedPrices },
          { isFlagEnabled },
        ] = await Promise.all([
          import("./src/core/stripe/checkout-handler.ts"),
          import("./src/core/stripe/allowed-prices.ts"),
          import("./src/core/flags/flags.ts"),
        ]);
        const webReq = await toWebRequest(req);
        const webRes = await handleCreateCheckoutSession(webReq, {
          // Lazy Stripe construction — handler short-circuits 4xx/503 paths
          // before the SDK is touched, so dev/test without STRIPE_SECRET_KEY
          // still hits clean 4xx responses instead of crashing the import.
          client: {
            create: async (params, opts) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const session = await stripe.checkout.sessions.create(params, opts);
              return { url: session.url, id: session.id };
            },
          },
          allowedPrices: resolveAllowedPrices(),
          killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
        });
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
