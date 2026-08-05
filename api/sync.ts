// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { resolveAdapter } from "../src/core/sync/adapters/resolve-adapter";
import { handleSyncRequest } from "../src/core/sync/sync-handler";

// Cloud sync is a Free-tier feature — this wiring layer never sets
// `licenseAuth`. The mechanism still lives in sync-handler.ts for any future
// gate that needs it.
const syncAdapter = resolveAdapter();

async function dispatch(req: Request): Promise<Response> {
  return handleSyncRequest(req, syncAdapter);
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function PUT(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return dispatch(req);
}

export async function HEAD(req: Request): Promise<Response> {
  return dispatch(req);
}
