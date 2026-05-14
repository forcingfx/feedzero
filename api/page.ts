import { handleProxyRequest } from "../src/core/proxy/proxy-handler";
import {
  resolveProxyRateLimiter,
  describeRateLimiterMode,
} from "../src/core/proxy/resolve-rate-limiter";

// Module-load logging — surfaces whether the rate limiter is active on
// the article-extractor proxy. Same threat surface as /api/feed.
console.log(`[page-proxy] ratelimit=${describeRateLimiterMode()}`);

const rateLimitPromise = resolveProxyRateLimiter();

async function dispatch(
  req: Request,
  contentType: string,
): Promise<Response> {
  const rateLimit = await rateLimitPromise;
  return handleProxyRequest(req, contentType, {
    ...(rateLimit ? { rateLimit } : {}),
  });
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req, "text/html");
}

export async function POST(req: Request): Promise<Response> {
  return dispatch(req, "text/html");
}
