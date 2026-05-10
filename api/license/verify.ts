import { handleLicenseVerifyRequest } from "../../src/core/license/verify-handler";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
const storagePromise = resolveLicenseStorage();

export async function POST(req: Request): Promise<Response> {
  const storage = await storagePromise;
  return handleLicenseVerifyRequest(req, {
    signingKey: { secret: signingSecret },
    storage,
  });
}
