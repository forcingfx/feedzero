import { handleCatalogRequest } from "../src/core/catalog/catalog-handler";
import {
  resolveCatalogStorage,
  describeCatalogStorageMode,
} from "../src/core/catalog/resolve-catalog-storage";

// Module-load logging. Surfaces which storage backend resolved so a
// regression to memory mode (which silently zeroes the stats on every cold
// start) is visible in the first Vercel deploy log entry.
console.log(`[catalog] storage=${describeCatalogStorageMode()}`);

const adapterPromise = resolveCatalogStorage();

export async function GET(req: Request): Promise<Response> {
  return handleCatalogRequest(req, await adapterPromise);
}
