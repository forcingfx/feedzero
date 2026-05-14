import { handleProxyRequest } from "../src/core/proxy/proxy-handler";
import {
  resolveCatalogStorage,
  describeCatalogStorageMode,
} from "../src/core/catalog/resolve-catalog-storage";

// Module-load logging — surfaces which catalog backend resolved. Before
// the persistent-catalog fix, this lambda ran an in-memory adapter that
// silently dropped all upserts on every cold start, which is why the
// stats page showed zero feeds tracked. The log line catches a future
// regression to memory mode on the first deploy.
console.log(`[feed-proxy] catalog=${describeCatalogStorageMode()}`);

const catalogPromise = resolveCatalogStorage();

async function dispatch(
  req: Request,
  contentType: string,
): Promise<Response> {
  const catalogAdapter = await catalogPromise;
  // `cleanContent: true` mirrors server.ts (the Hono entry point used for
  // self-hosting). `catalogAdapter` is fire-and-forget: the proxy returns
  // the feed response immediately and the catalog upsert runs in the
  // background. Failures are swallowed.
  return handleProxyRequest(req, contentType, {
    catalogAdapter,
    cleanContent: true,
  });
}

export async function GET(req: Request): Promise<Response> {
  return dispatch(req, "text/xml");
}

export async function POST(req: Request): Promise<Response> {
  return dispatch(req, "text/xml");
}
