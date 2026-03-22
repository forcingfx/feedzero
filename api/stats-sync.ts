/**
 * Vercel Serverless Function: Sync Stats Endpoint
 *
 * Returns the number of encrypted vaults stored on the server.
 * No user-identifiable information is exposed — just a count.
 */
import { handleSyncStatsRequest } from "../src/core/sync/sync-stats-handler.ts";
import { createVercelBlobAdapter } from "../src/core/sync/adapters/vercel-blob-adapter.ts";

const adapter = createVercelBlobAdapter();

export async function GET(req: Request): Promise<Response> {
  return handleSyncStatsRequest(req, adapter);
}
