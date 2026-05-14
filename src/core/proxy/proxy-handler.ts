import { validateProxyUrl } from "./validate-url.ts";
import type { FeedCache } from "./feed-cache.ts";
import type { CatalogStorageAdapter } from "../catalog/catalog-types.ts";
import { cleanFeedContent } from "../cleaner/cleaner.ts";

/**
 * HTTP methods the proxy handler accepts.
 * Every routing layer (Vercel exports, Hono, Vite dev) must accept
 * all of these. Tested by the routing contract in server.test.ts.
 */
export const SUPPORTED_METHODS: readonly string[] = ["GET", "POST"];

/**
 * Per-client rate-limit hook. Caller injects a `limiter` and a
 * `clientIdFor` function that derives the bucket key from the Request.
 * The handler calls these BEFORE URL validation so invalid-URL probing
 * still consumes the bucket. Returns 429 with `Retry-After` on deny.
 * Both fields are required when `rateLimit` is set.
 *
 * Why an interface, not a concrete limiter type: keeps proxy-handler
 * decoupled from the production Upstash limiter (and from `@upstash/redis`)
 * so unit tests inject a fake.
 */
export interface ProxyRateLimit {
  limiter: {
    check(
      clientId: string,
    ): Promise<{ allowed: boolean; retryAfterSec?: number }>;
  };
  clientIdFor(req: Request): Promise<string>;
}

export interface ProxyOptions {
  /** Optional feed cache for deduplication across users. */
  cache?: FeedCache;
  /** Optional catalog adapter — records anonymous feed request counts. */
  catalogAdapter?: CatalogStorageAdapter;
  /** Strip trackers and tracking params from feed content before returning. */
  cleanContent?: boolean;
  /**
   * Optional per-client rate limiter. When set, the handler checks the
   * limiter at request entry (before URL validation) and short-circuits
   * with 429 if the client is over budget. Opt-in: omitting this leaves
   * behavior unchanged (matches self-host / dev paths that don't run
   * an Upstash-backed limiter).
   */
  rateLimit?: ProxyRateLimit;
}

/**
 * Shared proxy logic for serverless functions.
 * Validates the target URL, fetches it, and returns the response.
 * If a cache is provided, feed responses are cached by URL with a TTL.
 */
export async function handleProxyRequest(
  req: Request,
  defaultContentType: string,
  options?: ProxyOptions,
): Promise<Response> {
  // Rate-limit BEFORE URL validation so an attacker spraying invalid URLs
  // still consumes their bucket. See rate-limiter test
  // "checks the limiter BEFORE URL validation" for the regression guard.
  if (options?.rateLimit) {
    const clientId = await options.rateLimit.clientIdFor(req);
    const result = await options.rateLimit.limiter.check(clientId);
    if (!result.allowed) {
      // RFC 6585 §4: 429 SHOULD include Retry-After. We always send it.
      return new Response(
        JSON.stringify({ ok: false, error: "rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(result.retryAfterSec ?? 60),
          },
        },
      );
    }
  }

  const target = await extractTargetUrl(req);

  const validation = validateProxyUrl(target);
  if (!validation.ok) {
    const status =
      validation.error === "Access to internal addresses is blocked"
        ? 403
        : 400;
    return new Response(validation.error, { status });
  }

  const url = validation.value.href;
  const cache = options?.cache;

  // Check cache first
  if (cache) {
    const cached = cache.get(url);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { "Content-Type": cached.contentType },
      });
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      headers: { "User-Agent": "FeedZero/1.0 (RSS Reader)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const contentType =
      response.headers.get("content-type") || defaultContentType;
    const body = await response.arrayBuffer();

    // Cache successful feed/page responses
    if (cache && response.status >= 200 && response.status < 400) {
      cache.set(url, body, contentType, response.status);
    }

    // Record anonymous feed request in catalog (fire-and-forget)
    if (options?.catalogAdapter && response.status >= 200 && response.status < 400) {
      options.catalogAdapter.upsert(url).catch(() => {});
    }

    // Clean text-based feed content (XML, HTML) if enabled
    const isTextContent = /xml|html|text/i.test(contentType);
    if (options?.cleanContent && isTextContent && response.status >= 200 && response.status < 400) {
      const text = new TextDecoder().decode(body);
      const cleaned = cleanFeedContent(text);
      return new Response(cleaned, {
        status: response.status,
        headers: { "Content-Type": contentType },
      });
    }

    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": contentType },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(
      JSON.stringify({
        level: "error",
        context: "proxy",
        target: url,
        error: message,
        timestamp: new Date().toISOString(),
      }),
    );
    return new Response(`Proxy error: ${message}`, { status: 502 });
  }
}

/** Extract target URL from POST body (preferred) or GET query param (fallback). */
async function extractTargetUrl(req: Request): Promise<string | null> {
  if (req.method === "POST") {
    try {
      const body = (await req.json()) as { url?: string };
      return body.url ?? null;
    } catch {
      return null;
    }
  }
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get("url");
}
