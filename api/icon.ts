// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleFaviconRequest } from "../src/core/favicon/favicon-handler";
import { handleProxyRequest } from "../src/core/proxy/proxy-handler";

// One function serves two request shapes (Vercel's 12-function Hobby cap):
// ?domain=<host> resolves the site's favicon; anything else proxies a known
// image URL. server.ts and vite.config.js apply the same dispatch —
// tests/api/icon-wrapper.test.ts holds this entry point to it.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("domain")) {
    return handleFaviconRequest(req);
  }
  return handleProxyRequest(req, "image/x-icon");
}
