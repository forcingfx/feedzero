// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleIconRequest } from "../src/core/proxy/icon-route";

// One function serves every /api/icon request shape (favicon, thumbnail,
// article image) to stay within Vercel's function cap. server.ts and
// vite.config.js call the same dispatcher; tests/api/icon-wrapper.test.ts
// holds this entry point to it.
export async function GET(req: Request): Promise<Response> {
  return handleIconRequest(req);
}
