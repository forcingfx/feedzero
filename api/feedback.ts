// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleFeedbackRequest } from "../src/core/feedback/feedback-handler";

export async function POST(req: Request): Promise<Response> {
  return handleFeedbackRequest(req);
}
