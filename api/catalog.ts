// @ts-nocheck
// src/core/catalog/catalog-handler.ts
var API_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}
function errorResponse(message, status) {
  return jsonResponse({ ok: false, error: message }, status);
}
async function handleGet(request, adapter) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action === "popular") {
    return handlePopular(url, adapter);
  }
  if (action === "count") {
    return handleCount(adapter);
  }
  return handleGetFeed(url, adapter);
}
async function handleGetFeed(url, adapter) {
  const feedUrl = url.searchParams.get("url");
  if (!feedUrl) return errorResponse("Missing url parameter", 400);
  const result = await adapter.get(feedUrl);
  if (!result.ok) return errorResponse(result.error, 500);
  if (result.value === null) return errorResponse("Feed not found", 404);
  return jsonResponse({ ok: true, feed: result.value });
}
async function handlePopular(url, adapter) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const result = await adapter.popular(limit);
  if (!result.ok) return errorResponse(result.error, 500);
  return jsonResponse({ ok: true, feeds: result.value });
}
async function handleCount(adapter) {
  const result = await adapter.count();
  if (!result.ok) return errorResponse(result.error, 500);
  return jsonResponse({ ok: true, count: result.value });
}
var methodHandlers = {
  GET: handleGet
};
var SUPPORTED_METHODS = Object.keys(methodHandlers);
async function handleCatalogRequest(request, adapter) {
  const handler = methodHandlers[request.method];
  if (!handler) return errorResponse("Method not allowed", 405);
  return handler(request, adapter);
}

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/catalog/adapters/memory-adapter.ts
function createMemoryCatalogAdapter() {
  const store = /* @__PURE__ */ new Map();
  return {
    async upsert(url) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const existing = store.get(url);
      if (existing) {
        existing.requestCount += 1;
        existing.lastRequestedAt = now;
      } else {
        store.set(url, {
          url,
          title: null,
          description: null,
          siteUrl: null,
          status: "active",
          requestCount: 1,
          lastRequestedAt: now,
          lastCrawledAt: null,
          errorCount: 0,
          lastError: null,
          createdAt: now
        });
      }
      return ok(true);
    },
    async get(url) {
      return ok(store.get(url) ?? null);
    },
    async popular(limit) {
      const sorted = [...store.values()].sort(
        (a, b) => b.requestCount - a.requestCount
      );
      return ok(sorted.slice(0, limit));
    },
    async updateMetadata(url, metadata) {
      const existing = store.get(url);
      if (existing) {
        Object.assign(existing, metadata);
      }
      return ok(true);
    },
    async count() {
      return ok(store.size);
    }
  };
}

// src/core/catalog/adapters/upstash-adapter.ts
var FEED_KEY_PREFIX = "catalog:feed:";
var RANKING_KEY = "catalog:ranking";
function feedKey(url) {
  return FEED_KEY_PREFIX + url;
}
async function tryUpstash(op) {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash catalog error: ${message}`);
  }
}
var UpstashCatalogAdapter = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async upsert(url) {
    return tryUpstash(async () => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const existing = await this.client.get(feedKey(url));
      const updated = existing ? {
        ...existing,
        requestCount: existing.requestCount + 1,
        lastRequestedAt: now
      } : {
        url,
        title: null,
        description: null,
        siteUrl: null,
        status: "active",
        requestCount: 1,
        lastRequestedAt: now,
        lastCrawledAt: null,
        errorCount: 0,
        lastError: null,
        createdAt: now
      };
      await this.client.set(feedKey(url), updated);
      await this.client.zadd(RANKING_KEY, {
        score: updated.requestCount,
        member: url
      });
      return true;
    });
  }
  async get(url) {
    return tryUpstash(async () => {
      const value = await this.client.get(feedKey(url));
      return value ?? null;
    });
  }
  async popular(limit) {
    return tryUpstash(async () => {
      const urls = await this.client.zrange(RANKING_KEY, 0, limit - 1, {
        rev: true
      });
      if (urls.length === 0) return [];
      const keys = urls.map(feedKey);
      const entries = await this.client.mget(...keys);
      return entries.filter((e) => e !== null);
    });
  }
  async updateMetadata(url, metadata) {
    return tryUpstash(async () => {
      const existing = await this.client.get(feedKey(url));
      if (!existing) return true;
      const merged = { ...existing, ...metadata };
      await this.client.set(feedKey(url), merged);
      return true;
    });
  }
  async count() {
    return tryUpstash(() => this.client.zcard(RANKING_KEY));
  }
};
function resolveUpstashCredentials(env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}
function hasUpstashCatalogCredentials(env = process.env) {
  return resolveUpstashCredentials(env) !== null;
}
async function createUpstashCatalogAdapter(env = process.env) {
  const creds = resolveUpstashCredentials(env);
  if (!creds) {
    throw new Error(
      "Upstash REST credentials not found. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or use the Vercel Marketplace Upstash integration which auto-injects KV_REST_API_URL + KV_REST_API_TOKEN."
    );
  }
  const { Redis } = await import("@upstash/redis");
  return new UpstashCatalogAdapter(
    new Redis({ url: creds.url, token: creds.token })
  );
}

// src/core/catalog/resolve-catalog-storage.ts
async function resolveCatalogStorage(env = process.env) {
  if (hasUpstashCatalogCredentials(env)) {
    return createUpstashCatalogAdapter(env);
  }
  return createMemoryCatalogAdapter();
}
function describeCatalogStorageMode(env = process.env) {
  return hasUpstashCatalogCredentials(env) ? "upstash" : "memory";
}

// api/catalog.ts
console.log(`[catalog] storage=${describeCatalogStorageMode()}`);
var adapterPromise = resolveCatalogStorage();
async function GET(req) {
  return handleCatalogRequest(req, await adapterPromise);
}
export {
  GET
};
