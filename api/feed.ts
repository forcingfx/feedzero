import { handleProxyRequest } from "../src/core/proxy/proxy-handler";
import {
  resolveCatalogStorage,
  describeCatalogStorageMode,
} from "../src/core/catalog/resolve-catalog-storage";
import {
  resolveProxyRateLimiter,
  describeRateLimiterMode,
} from "../src/core/proxy/resolve-rate-limiter";

// Module-load logging — surfaces which catalog backend resolved and
// whether the rate limiter is active. Mirrors PR #43's pattern.
console.log(
  `[feed-proxy] catalog=${describeCatalogStorageMode()} ratelimit=${describeRateLimiterMode()}`,
);

const catalogPromise = resolveCatalogStorage();
const rateLimitPromise = resolveProxyRateLimiter();

async function dispatch(
  req: Request,
  contentType: string,
): Promise<Response> {
  const [catalogAdapter, rateLimit] = await Promise.all([
    catalogPromise,
    rateLimitPromise,
  ]);
  return handleProxyRequest(req, contentType, {
    catalogAdapter,
    cleanContent: true,
    ...(rateLimit ? { rateLimit } : {}),
  });
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req, "text/xml");
}

export async function POST(req: Request): Promise<Response> {
  return dispatch(req, "text/xml");
}
