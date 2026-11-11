import { handleFaviconRequest } from "../favicon/favicon-handler.ts";
import { handleProxyRequest } from "./proxy-handler.ts";
import type { FeedCache } from "./feed-cache.ts";

/** Query value of `mode` that marks an article-body image request. */
export const ARTICLE_IMAGE_MODE = "article";

/**
 * Largest article-body image the proxy relays: 4 MiB. Body images are
 * often photographs well above the 2 MB thumbnail cap, but a Vercel
 * Function cannot return a response body above 4.5 MB, so a higher cap
 * would only buffer images it then fails to send. See ADR 034.
 */
export const ARTICLE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export interface IconRouteOptions {
  /** In-memory cache for favicon and thumbnail relays (self-host, dev). */
  cache?: FeedCache;
}

/**
 * Dispatch one /api/icon request by its query shape:
 *   ?domain=<host>             → favicon discovery
 *   ?url=<image>&mode=article  → article-body image, ARTICLE_IMAGE_MAX_BYTES
 *   ?url=<image>               → list thumbnail or favicon, default cap
 *
 * One route serves all three because the Vercel deployment is at the
 * 12-function cap. server.ts, vite.config.js and api/icon.ts all call
 * this, so the shapes cannot drift between entry points.
 */
export function handleIconRequest(
  req: Request,
  options: IconRouteOptions = {},
): Promise<Response> {
  const params = new URL(req.url, "http://localhost").searchParams;
  if (params.get("domain")) {
    return handleFaviconRequest(req);
  }
  if (params.get("mode") === ARTICLE_IMAGE_MODE) {
    // No server cache: body images are large and the browser HTTP cache
    // already serves repeats via the image Cache-Control header.
    return handleProxyRequest(req, "image/x-icon", {
      maxImageBytes: ARTICLE_IMAGE_MAX_BYTES,
    });
  }
  return handleProxyRequest(req, "image/x-icon", { cache: options.cache });
}
