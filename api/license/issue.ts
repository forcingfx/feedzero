import { handleLicenseIssueRequest } from "../../src/core/license/issue-handler";
import { LicenseIssuerImpl } from "../../src/core/license/issuer";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";
import { isFlagEnabled } from "../../src/core/flags/flags";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";

const storagePromise = resolveLicenseStorage();
const issuerPromise = storagePromise.then(
  (storage) =>
    new LicenseIssuerImpl({
      signingKey: { secret: signingSecret },
      storage,
    }),
);

export async function POST(req: Request): Promise<Response> {
  const issuer = await issuerPromise;
  return handleLicenseIssueRequest(req, {
    issuer,
    adminApiKey: process.env.ADMIN_API_KEY ?? "",
    killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
  });
}
