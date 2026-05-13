import { handleSyncRequest } from "../src/core/sync/sync-handler";
import { resolveAdapter } from "../src/core/sync/adapters/resolve-adapter";
import { resolveLicenseStorage } from "../src/core/license/resolve-storage";
import { isFlagEnabled } from "../src/core/flags/flags";

const syncAdapter = resolveAdapter();
const licenseStoragePromise = resolveLicenseStorage();

async function buildOptions() {
  if (!isFlagEnabled("LAUNCH_PAID_TIER")) return {};
  return {
    licenseAuth: {
      signingKey: { secret: process.env.LICENSE_SIGNING_KEY ?? "" },
      storage: await licenseStoragePromise,
    },
  };
}

async function dispatch(req: Request): Promise<Response> {
  return handleSyncRequest(req, syncAdapter, await buildOptions());
}

export async function GET(req: Request): Promise<Response> { return dispatch(req); }
export async function PUT(req: Request): Promise<Response> { return dispatch(req); }
export async function DELETE(req: Request): Promise<Response> { return dispatch(req); }
export async function HEAD(req: Request): Promise<Response> { return dispatch(req); }
