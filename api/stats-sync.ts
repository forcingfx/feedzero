import { handleSyncStatsRequest } from "../src/core/sync/sync-stats-handler";
import {
  resolveAdapter,
  describeAdapterMode,
} from "../src/core/sync/adapters/resolve-adapter";

// Module-load logging — surfaces the resolved sync adapter, same diagnostic
// that caught the 2026-05-12 sync regression (see PR #43 observability).
console.log(`[stats-sync] adapter=${describeAdapterMode()}`);

// resolveAdapter() picks Upstash when its credentials are present (post-#45),
// Vercel Blob if its token is present, filesystem otherwise. The previous
// version of this file hardcoded createVercelBlobAdapter(), which is why
// the Vaults stat read zero after the Upstash migration.
const adapter = resolveAdapter();

export async function GET(req: Request): Promise<Response> {
  return handleSyncStatsRequest(req, adapter);
}
