/**
 * Vercel Serverless Function: Sync Endpoint
 *
 * Stores and retrieves encrypted vault blobs for zero-knowledge sync.
 * Delegates to the shared sync handler with a resolved storage adapter.
 */
import { handleSyncRequest } from "../core/sync/sync-handler.ts";
import { resolveAdapter } from "../core/sync/adapters/resolve-adapter.ts";

const adapter = resolveAdapter();

export async function GET(req: Request): Promise<Response> {
  return handleSyncRequest(req, adapter);
}

export async function PUT(req: Request): Promise<Response> {
  return handleSyncRequest(req, adapter);
}

export async function DELETE(req: Request): Promise<Response> {
  return handleSyncRequest(req, adapter);
}
