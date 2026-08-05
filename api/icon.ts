// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleProxyRequest } from "../src/core/proxy/proxy-handler";

export async function GET(req: Request): Promise<Response> {
  return handleProxyRequest(req, "image/x-icon");
}
