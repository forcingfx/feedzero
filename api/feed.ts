// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import {
  describeCatalogStorageMode,
  resolveCatalogStorage,
} from "../src/core/catalog/resolve-catalog-storage";
import { handleProxyRequest } from "../src/core/proxy/proxy-handler";
import {
  describeRateLimiterMode,
  resolveProxyRateLimiter,
} from "../src/core/proxy/resolve-rate-limiter";

console.log(
  `[feed-proxy] catalog=${describeCatalogStorageMode()} ratelimit=${describeRateLimiterMode()}`,
);

// Resolved once per cold start, not per request.
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
