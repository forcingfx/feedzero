import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";
import { toWebRequest, sendWebResponse } from "./scripts/dev-proxy.js";
import { visualizer } from "rollup-plugin-visualizer";

// Inject the current package.json version as a build-time constant so
// the SPA and dev server can identify which build is running. The
// serverless side is fed by scripts/build-api.js's esbuild define.
const pkgVersion = JSON.parse(
  readFileSync(path.resolve("package.json"), "utf-8"),
).version;

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
        const webReq = await toWebRequest(req);
        // Cloud sync is a Free-tier feature — handler runs without
        // licenseAuth. The mechanism stays in sync-handler.ts for any
        // future gate; this wiring layer never sets it.
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

      server.middlewares.use("/api/license/retrieve", async (req, res) => {
        const { licenseStorage } = await ensureLicenseDeps();
        const { handleLicenseRetrieveRequest } = await import(
          "./src/core/license/retrieve-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleLicenseRetrieveRequest(webReq, {
          sessions: {
            retrieve: async (sessionId) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const session = await stripe.checkout.sessions.retrieve(sessionId);
              const customer =
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id ?? null;
              return { customer };
            },
          },
          storage: licenseStorage,
          signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
        });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/license/portal", async (req, res) => {
        const { licenseStorage } = await ensureLicenseDeps();
        const { handlePortalRequest } = await import(
          "./src/core/stripe/portal-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handlePortalRequest(webReq, {
          portal: {
            create: async (params) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const session = await stripe.billingPortal.sessions.create(params);
              return { url: session.url };
            },
          },
          sessions: {
            retrieve: async (sessionId) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const session = await stripe.checkout.sessions.retrieve(sessionId);
              const customer =
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id ?? null;
              return { customer };
            },
          },
          signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
          storage: licenseStorage,
        });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/license/recover", async (req, res) => {
        const { handleLicenseRecoverRequest } = await import(
          "./src/core/license/recover-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const origin = `${req.headers["x-forwarded-proto"] ?? "http"}://${req.headers.host ?? "localhost:3000"}`;
        const webRes = await handleLicenseRecoverRequest(webReq, {
          customers: {
            list: async (params) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const list = await stripe.customers.list({
                email: params.email,
                limit: params.limit ?? 1,
              });
              return {
                data: list.data.map((c) => ({ id: c.id, email: c.email ?? null })),
              };
            },
          },
          portal: {
            create: async (params) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const session = await stripe.billingPortal.sessions.create(params);
              return { url: session.url };
            },
          },
          signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
          returnUrlBase: `${origin}/billing/issued`,
        });
        await sendWebResponse(webRes, res);
      });

      server.middlewares.use("/api/license/issue-from-recovery", async (req, res) => {
        const { licenseStorage } = await ensureLicenseDeps();
        const { handleIssueFromRecoveryRequest } = await import(
          "./src/core/license/issue-from-recovery-handler.ts"
        );
        const webReq = await toWebRequest(req);
        const webRes = await handleIssueFromRecoveryRequest(webReq, {
          signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
          storage: licenseStorage,
          subscriptions: {
            retrieve: async (subscriptionId) => {
              const { default: Stripe } = await import("stripe");
              const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              return { status: sub.status };
            },
          },
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

// Opt-in bundle analysis: `ANALYZE=1 npm run build` emits dist/stats.html
// with a treemap of every chunk. Used to verify server-only deps (Stripe,
// @upstash/redis, @vercel/blob, the Hono server stack) stay out of the
// browser bundle and to catch new bloat in PR review.
const analyzePlugin =
  process.env.ANALYZE === "1"
    ? visualizer({
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      })
    : null;

export default defineConfig({
  server: {
    port: 3000,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkgVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      // Hard-exclude server-only deps from the client bundle. If Vite/Rollup
      // ever follows a stray import path that pulls them in, the build fails
      // loudly instead of silently shipping ~500 KB of unused SDK to every
      // visitor. The Hono server (server.ts) and Vercel wrappers (api/*.ts)
      // bundle these via scripts/build-api.js, not this build.
      external: ["stripe", "@upstash/redis", "@vercel/blob", "@hono/node-server"],
      output: {
        // Split low-churn vendor code into its own chunks so a typical
        // FeedZero release (which touches src/ but rarely a vendor lib)
        // only invalidates the small app chunk in the user's browser
        // cache. Asset filenames are already content-hashed; Vercel and
        // the self-host static server both serve them with long-lived
        // immutable Cache-Control. Without splits, every release forces
        // re-download of React + Radix + Dexie + Defuddle (~250 KB gz).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // React core — stable, rarely changes between FeedZero releases.
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/react-router/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          // Radix primitives + the umbrella export. Largest single vendor
          // surface; isolating it shrinks the diff a Radix bump produces.
          if (
            id.includes("/node_modules/@radix-ui/") ||
            id.includes("/node_modules/radix-ui/")
          ) {
            return "vendor-radix";
          }
          // IndexedDB layer.
          if (id.includes("/node_modules/dexie/")) {
            return "vendor-dexie";
          }
          // Feed parsing — loaded at boot for every refresh.
          if (id.includes("/node_modules/feedsmith/")) {
            return "vendor-feedsmith";
          }
          // DOMPurify — loaded at boot for sanitizing every feed body.
          if (id.includes("/node_modules/dompurify/")) {
            return "vendor-dompurify";
          }
          // Extraction-only pipeline. Defuddle is the bulk of the
          // production extractor; marked converts GitHub READMEs.
          // Both are pulled only when the user clicks "Extracted" or
          // the prefetch path runs after a refresh — keep them in a
          // lazy chunk so first paint doesn't pay for them.
          if (
            id.includes("/node_modules/defuddle/") ||
            id.includes("/node_modules/marked/")
          ) {
            return "vendor-extractor";
          }
          // Icon set — large but rarely versioned.
          if (id.includes("/node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          // Drag-and-drop primitives (folder reordering, sortable lists).
          if (id.includes("/node_modules/@dnd-kit/")) {
            return "vendor-dnd";
          }
          // Everything else falls into the default vendor bucket so we
          // don't fragment into dozens of tiny chunks.
          return "vendor";
        },
      },
    },
    // Raise the warning threshold to 800 KB — the React/Radix vendor
    // chunks legitimately exceed 500 KB unminified but are not a
    // first-paint concern (cached aggressively, lazy-parsed by V8).
    chunkSizeWarningLimit: 800,
  },
  plugins: [react(), tailwindcss(), apiProxyPlugin(), analyzePlugin].filter(
    Boolean,
  ),
});
