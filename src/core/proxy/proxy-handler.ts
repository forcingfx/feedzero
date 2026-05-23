import { validateProxyUrl } from "./validate-url.ts";
import type { FeedCache } from "./feed-cache.ts";
import type { CatalogStorageAdapter } from "../catalog/catalog-types.ts";
import { cleanFeedContent } from "../cleaner/cleaner.ts";
import { pickUserAgent } from "./pick-user-agent.ts";
import { logError } from "../../../packages/core/src/utils/log-error";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";

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

  // Pluck conditional-fetch validators from the POST body so they can
  // ride upstream as standard HTTP cache headers. Clients (refresh
  // path in feed-service.ts) cache the upstream's ETag / Last-Modified
  // on the Feed record and replay them here so unchanged feeds resolve
  // as a free 304 instead of a full re-download of every item.
  const validators = await extractValidators(req);
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": pickUserAgent(process.env),
  };
  if (validators.etag) upstreamHeaders["If-None-Match"] = validators.etag;
  if (validators.lastModified)
    upstreamHeaders["If-Modified-Since"] = validators.lastModified;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      headers: upstreamHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const contentType =
      response.headers.get("content-type") || defaultContentType;

    // 304 Not Modified: empty body, propagate status so the client
    // treats it as "nothing changed; do not parse / write the DB".
    if (response.status === 304) {
      return new Response("", {
        status: 304,
        headers: buildResponseHeaders(contentType, response),
      });
    }

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
        headers: buildResponseHeaders(contentType, response),
      });
    }

    return new Response(body, {
      status: response.status,
      headers: buildResponseHeaders(contentType, response),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Privacy: the target URL is the user's subscribed feed. Logging it
    // would persist a list of "what user N is reading" in the operator's
    // log retention. Use the allow-listed logError so only error class +
    // message land in stdout; the user can quote the traceId in support.
    logError({
      route: "/api/feed",
      method: "POST",
      status: 502,
      traceId: newTraceId(),
      errClass: e instanceof Error ? e.constructor.name : "Error",
      errMsg: message,
    });
    return new Response(`Proxy error: ${message}`, { status: 502 });
  }
}

/**
 * Build the response headers for an upstream passthrough. Always sets
 * Content-Type. For 429/503, propagates Retry-After verbatim (RFC 7231 §7.1.3)
 * so the client can back off instead of hammering the origin. ETag and
 * Last-Modified are passed through whenever the upstream emits them so
 * the client can replay the validators on its next refresh. Image
 * responses (proxied favicons via /api/icon) get a long-lived
 * Cache-Control so the browser HTTP cache satisfies repeat fetches
 * without a server round-trip; other content types (feed XML, page HTML)
 * remain uncached because their freshness is driven by the refresh
 * cycle, not the HTTP cache layer.
 */
function buildResponseHeaders(
  contentType: string,
  upstream: Response,
): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (upstream.status === 429 || upstream.status === 503) {
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter) headers["Retry-After"] = retryAfter;
  }
  const etag = upstream.headers.get("ETag");
  if (etag) headers["ETag"] = etag;
  const lastModified = upstream.headers.get("Last-Modified");
  if (lastModified) headers["Last-Modified"] = lastModified;
  if (
    upstream.status >= 200 &&
    upstream.status < 300 &&
    /^image\//i.test(contentType)
  ) {
    headers["Cache-Control"] =
      "public, max-age=86400, stale-while-revalidate=604800";
  }
  return headers;
}

/**
 * Request body parsing is intentionally separated from URL extraction:
 * a single POST body can carry several optional fields (target URL,
 * conditional-fetch validators) and we want to parse the body once.
 */
interface ProxyBody {
  url: string | null;
  etag: string | null;
  lastModified: string | null;
}

async function parseBody(req: Request): Promise<ProxyBody> {
  if (req.method !== "POST") {
    return { url: null, etag: null, lastModified: null };
  }
  try {
    const body = (await req.clone().json()) as {
      url?: string;
      etag?: string;
      lastModified?: string;
    };
    return {
      url: body.url ?? null,
      etag: body.etag ?? null,
      lastModified: body.lastModified ?? null,
    };
  } catch {
    return { url: null, etag: null, lastModified: null };
  }
}

/** Extract target URL from POST body (preferred) or GET query param (fallback). */
async function extractTargetUrl(req: Request): Promise<string | null> {
  if (req.method === "POST") {
    const body = await parseBody(req);
    return body.url;
  }
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get("url");
}

/** Extract conditional-fetch validators from POST body; GET has none. */
async function extractValidators(
  req: Request,
): Promise<{ etag: string | null; lastModified: string | null }> {
  if (req.method !== "POST") return { etag: null, lastModified: null };
  const body = await parseBody(req);
  return { etag: body.etag, lastModified: body.lastModified };
}
