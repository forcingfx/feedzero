import { handleLicenseVerifyRequest } from "../../src/core/license/verify-handler";
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

/**
 * Vercel dynamic route catching /api/license/verify and /api/license/issue.
 * Consolidated into one function (instead of two separate files) so we stay
 * under the Hobby plan's 12-function-per-deployment ceiling. Each branch
 * delegates to the existing shared handler — same logic, same tests, same
 * behavior; only the file boundary changed.
 */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  if (action === "verify") {
    const storage = await storagePromise;
    return handleLicenseVerifyRequest(req, {
      signingKey: { secret: signingSecret },
      storage,
    });
  }

  if (action === "issue") {
    const issuer = await issuerPromise;
    return handleLicenseIssueRequest(req, {
      issuer,
      adminApiKey: process.env.ADMIN_API_KEY ?? "",
      killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
    });
  }

  return new Response(
    JSON.stringify({ ok: false, error: "unknown license action" }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}
