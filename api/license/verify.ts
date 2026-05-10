import { handleLicenseVerifyRequest } from "../../src/core/license/verify-handler";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";

// Resolved once at module load — Vercel keeps the function warm so this is
// reused across invocations. Upstash in production, Memory in dev/preview.
// Critically: this storage instance shares its data with /api/stripe/webhook
// only via Upstash (in prod) — the Memory fallback is per-function-instance
// and revocations from one wrapper won't be visible to the other.
const storagePromise = resolveLicenseStorage();

export async function POST(req: Request): Promise<Response> {
  const storage = await storagePromise;
  return handleLicenseVerifyRequest(req, {
    signingKey: { secret: signingSecret },
    storage,
  });
}
