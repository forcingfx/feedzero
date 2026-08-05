// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { handleCatalogRequest } from "../src/core/catalog/catalog-handler";
import {
  describeCatalogStorageMode,
  resolveCatalogStorage,
} from "../src/core/catalog/resolve-catalog-storage";

console.log(`[catalog] storage=${describeCatalogStorageMode()}`);

// Resolved once per cold start, not per request.
const adapterPromise = resolveCatalogStorage();

export async function GET(req: Request): Promise<Response> {
  return handleCatalogRequest(req, await adapterPromise);
}
