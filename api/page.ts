// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleProxyRequest } from "../src/core/proxy/proxy-handler";
import {
  describeRateLimiterMode,
  resolveProxyRateLimiter,
} from "../src/core/proxy/resolve-rate-limiter";

console.log(`[page-proxy] ratelimit=${describeRateLimiterMode()}`);

const rateLimitPromise = resolveProxyRateLimiter();

async function dispatch(
  req: Request,
  contentType: string,
): Promise<Response> {
  const rateLimit = await rateLimitPromise;
  return handleProxyRequest(req, contentType, {
    // Article-page fetches mimic a real browser visit so the FeedZero
    // identifier doesn't get blocked by Cloudflare-class WAFs on article
    // URLs. See pick-user-agent.ts for the policy.
    routeKind: "page",
    ...(rateLimit ? { rateLimit } : {}),
  });
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req, "text/html");
}

export async function POST(req: Request): Promise<Response> {
  return dispatch(req, "text/html");
}
