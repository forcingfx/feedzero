// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleBriefingRequest } from "../src/core/briefings/briefing-proxy-handler";

export async function POST(req: Request): Promise<Response> {
  return handleBriefingRequest(req);
}
