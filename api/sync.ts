/**
 * Vercel Serverless Function: Sync Endpoint
 *
 * Stores and retrieves encrypted vault blobs for zero-knowledge sync.
 * Uses the Vercel Blob adapter directly — this route only runs on Vercel,
 * so we bypass resolveAdapter() to avoid bundling unused adapters and
 * depending on the SYNC_STORAGE env var.
 */
import { handleSyncRequest } from "../src/core/sync/sync-handler.ts";
import { createVercelBlobAdapter } from "../src/core/sync/adapters/vercel-blob-adapter.ts";

const adapter = createVercelBlobAdapter();

export async function GET(req: Request): Promise<Response> {
  return handleSyncRequest(req, adapter);
}

export async function PUT(req: Request): Promise<Response> {
  return handleSyncRequest(req, adapter);
}

export async function DELETE(req: Request): Promise<Response> {
  return handleSyncRequest(req, adapter);
}
