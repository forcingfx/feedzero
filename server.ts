import { Hono } from "hono";
import { compress } from "hono/compress";
import { handleProxyRequest } from "./src/core/proxy/proxy-handler";
import { handleFeedbackRequest } from "./src/core/feedback/feedback-handler";
import { handleBriefingRequest } from "./src/core/briefings/briefing-proxy-handler";
import { handleSyncRequest } from "./src/core/sync/sync-handler";
import { handleSyncStatsRequest } from "./src/core/sync/sync-stats-handler";
import { handleFaviconRequest } from "./src/core/favicon/favicon-handler";
import { handleCatalogRequest } from "./src/core/catalog/catalog-handler";
import { handleHealthRequest } from "./src/core/health/health-handler";
import { handleStripeWebhook } from "./src/core/stripe/webhook-handler";
import { handleLicenseVerifyRequest } from "./src/core/license/verify-handler";
import { handleLicenseIssueRequest } from "./src/core/license/issue-handler";
import {
  handleLicenseRetrieveRequest,
  type SessionRetriever,
} from "./src/core/license/retrieve-handler";
import {
  handlePortalRequest,
  type PortalClient,
  type PortalSessionRetriever,
} from "./src/core/stripe/portal-handler";
import { handleLicenseRecoverRequest } from "./src/core/license/recover-handler";
import { handleIssueFromRecoveryRequest } from "./src/core/license/issue-from-recovery-handler";
import { handleCreateCheckoutSession } from "./src/core/stripe/checkout-handler";
import { resolveAllowedPrices } from "./src/core/stripe/allowed-prices";
import type { SeenEventStore } from "./src/core/stripe/seen-event-store";
import { LicenseIssuerImpl } from "./src/core/license/issuer";
import {
  MemoryLicenseStorage,
  type LicenseStorage,
} from "./src/core/license/storage";
import type { SigningKey } from "./src/core/license/sign";
import { isFlagEnabled } from "./src/core/flags/flags";
import { createMemoryAdapter } from "./src/core/sync/adapters/memory-adapter";
import { createMemoryCatalogAdapter } from "./src/core/catalog/adapters/memory-adapter";
import { resolveAdapter } from "./src/core/sync/adapters/resolve-adapter";
import { createFeedCache } from "./src/core/proxy/feed-cache";
import type { SyncStorageAdapter } from "./src/core/sync/types";
import type { CatalogStorageAdapter } from "./src/core/catalog/catalog-types";
import type { FeedCache } from "./src/core/proxy/feed-cache";

/**
 * Test- and runtime-injectable bundle of license dependencies.
 * Tests pass a {@link MemoryLicenseStorage} + a known signing secret; the
 * production runtime reads from env. Bundled together so callers don't have
 * to thread three positional optional args.
 */
export interface LicenseDeps {
  signingKey: SigningKey;
  storage: LicenseStorage;
  /** STRIPE_WEBHOOK_SECRET. Required for the webhook to verify signatures. */
  webhookSigningSecret?: string;
  /** Caller-injected for the verify handler in tests. Defaults to wallclock. */
  nowSec?: number;
  /**
   * Optional Stripe event-id dedup store. If present, the webhook handler
   * skips re-dispatch on duplicate `event.id`. Tests typically pass a
   * MemorySeenEventStore; production wires Upstash via resolveSeenEventStore.
   */
  eventStore?: SeenEventStore;
  /**
   * Optional Stripe Checkout session retriever for `/api/license/retrieve`.
   * Tests pass a fake; production wraps the live Stripe SDK lazily so we
   * don't construct it on startup.
   */
  sessions?: SessionRetriever;
  /**
   * Optional Stripe Customer Portal session creator for `/api/billing/portal`.
   * Tests pass a fake; production lazy-constructs via the Stripe SDK.
   */
  portal?: PortalClient;
  /** Optional override for the portal handler's session retriever. */
  portalSessions?: PortalSessionRetriever;
  /**
   * Optional Stripe customers.list client for /api/license/recover. Tests
   * pass a fake; production lazy-constructs via the Stripe SDK.
   */
  customers?: import("./src/core/license/recover-handler").CustomersClient;
  /**
   * Optional Stripe subscriptions.retrieve client for
   * /api/license/issue-from-recovery. Tests pass a fake; production
   * lazy-constructs via the Stripe SDK.
   */
  subscriptions?: import("./src/core/license/issue-from-recovery-handler").SubscriptionsClient;
}

function buildLicenseDeps(): LicenseDeps {
  return {
    signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
    storage: new MemoryLicenseStorage(),
    webhookSigningSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  };
}

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
  licenseDeps?: LicenseDeps,
): Hono {
  const syncAdapter = adapter ?? createMemoryAdapter();
  const catalog = catalogAdapter ?? createMemoryCatalogAdapter();
  const license = licenseDeps ?? buildLicenseDeps();
  const issuer = new LicenseIssuerImpl({
    signingKey: license.signingKey,
    storage: license.storage,
  });
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

  // Gzip/deflate compression for any compressible response above the
  // default 1 KB threshold. Self-host parity with Vercel's edge — the
  // hosted deployment compresses at the CDN automatically. Without
  // this, a returning user pulling a 2 MB encrypted vault over
  // /api/sync downloads the full ciphertext on every reload; with it,
  // typical JSON+base64 responses compress 70–80%. Mounted AFTER the
  // rate-limit middleware so 429 short-circuits don't pay the
  // compression cost.
  app.use("*", compress());

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
  // /api/icon dispatches on query-param shape so we stay under Vercel's
  // 12-function Hobby cap: ?domain=… → resolve the site's favicon;
  // anything else → proxy a known image URL with SSRF guards. The Vercel
  // wrapper at api/icon.ts applies the same dispatch.
  app.get("/api/icon", (c) => {
    const url = new URL(c.req.url);
    if (url.searchParams.get("domain")) {
      return handleFaviconRequest(c.req.raw);
    }
    return handleProxyRequest(c.req.raw, "image/x-icon", { cache: feedCache });
  });
  // Cloud sync is a Free-tier feature — the handler runs without licenseAuth.
  // The `licenseAuth` option is still exported by sync-handler.ts for any
  // future gate that needs it; this wiring layer simply never sets it.
  app.all("/api/sync", (c) => handleSyncRequest(c.req.raw, syncAdapter));
  app.get("/api/stats-sync", (c) => handleSyncStatsRequest(c.req.raw, syncAdapter));
  app.post("/api/feedback", (c) => handleFeedbackRequest(c.req.raw));
  app.post("/api/briefing", (c) => handleBriefingRequest(c.req.raw));
  app.get("/api/catalog", (c) => handleCatalogRequest(c.req.raw, catalog));
  app.get("/api/health", (c) => handleHealthRequest(c.req.raw));

  app.post("/api/stripe/webhook", (c) =>
    handleStripeWebhook(c.req.raw, {
      signingSecret: license.webhookSigningSecret ?? "",
      issuer,
      eventStore: license.eventStore,
      killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
    }),
  );

  app.post("/api/license/verify", (c) =>
    handleLicenseVerifyRequest(c.req.raw, {
      signingKey: license.signingKey,
      storage: license.storage,
      nowSec: license.nowSec,
    }),
  );

  app.post("/api/license/issue", (c) =>
    handleLicenseIssueRequest(c.req.raw, {
      issuer,
      adminApiKey: process.env.ADMIN_API_KEY ?? "",
      killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
    }),
  );

  app.post("/api/license/retrieve", (c) =>
    handleLicenseRetrieveRequest(c.req.raw, {
      sessions: license.sessions ?? {
        retrieve: async (sessionId: string) => {
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
      storage: license.storage,
      signingKey: license.signingKey,
      nowSec: license.nowSec,
    }),
  );

  app.post("/api/license/portal", (c) =>
    handlePortalRequest(c.req.raw, {
      portal: license.portal ?? {
        create: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.billingPortal.sessions.create(params);
          return { url: session.url };
        },
      },
      sessions: license.portalSessions ?? {
        retrieve: async (sessionId: string) => {
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
      signingKey: license.signingKey,
      storage: license.storage,
      nowSec: license.nowSec,
    }),
  );

  app.post("/api/license/recover", (c) =>
    handleLicenseRecoverRequest(c.req.raw, {
      customers: license.customers ?? {
        list: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const list = await stripe.customers.list({
            email: params.email,
            limit: params.limit ?? 1,
          });
          return {
            data: list.data.map((cust) => ({
              id: cust.id,
              email: cust.email ?? null,
            })),
          };
        },
      },
      portal: license.portal ?? {
        create: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.billingPortal.sessions.create(params);
          return { url: session.url };
        },
      },
      signingKey: license.signingKey,
      returnUrlBase: `${new URL(c.req.url).origin}/billing/issued`,
    }),
  );

  app.post("/api/license/issue-from-recovery", (c) =>
    handleIssueFromRecoveryRequest(c.req.raw, {
      signingKey: license.signingKey,
      storage: license.storage,
      subscriptions: license.subscriptions ?? {
        retrieve: async (subscriptionId) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          return { status: sub.status };
        },
      },
    }),
  );

  app.post("/api/checkout/create-session", (c) =>
    handleCreateCheckoutSession(c.req.raw, {
      // The Stripe SDK is constructed LAZILY inside `create` so that the
      // handler's pre-checks (kill-switch, body validation, allowlist) can
      // short-circuit before we ever touch the SDK. This keeps tests sane
      // (no need to set STRIPE_SECRET_KEY just to test 400/503 paths) and
      // means a missing STRIPE_SECRET_KEY surfaces as a clean 502 from the
      // handler's catch block, not a crash.
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
    }),
  );

  return app;
}

/* istanbul ignore next -- only runs when executed directly */
async function startServer(): Promise<void> {
  const { serve } = await import("@hono/node-server");
  const { serveStatic } = await import("@hono/node-server/serve-static");
  const { resolveLicenseStorage } = await import(
    "./src/core/license/resolve-storage"
  );
  const { resolveSeenEventStore } = await import(
    "./src/core/stripe/resolve-seen-event-store"
  );

  const adapter = resolveAdapter();
  const cache = createFeedCache();
  const catalog = createMemoryCatalogAdapter();
  // Pre-resolve the license storage and Stripe-event dedup store so
  // createApp stays synchronous. Both pick Upstash when UPSTASH_*/KV_* env
  // vars are set, in-memory otherwise.
  const [licenseStorage, eventStore] = await Promise.all([
    resolveLicenseStorage(),
    resolveSeenEventStore(),
  ]);
  const licenseDeps: LicenseDeps = {
    signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
    storage: licenseStorage,
    webhookSigningSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    eventStore,
  };
  const app = createApp(adapter, cache, catalog, licenseDeps);

  // Long-lived immutable caching for hashed asset filenames (everything
  // under /assets/ comes out of Vite with a content hash in its name, so
  // the URL changes whenever the bytes change). Without this, every
  // self-host visitor re-downloads ~430 KB of vendor chunks on each
  // revisit — defeats the per-vendor split. The hosted (Vercel)
  // deployment sets the same header automatically for hashed assets.
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
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
