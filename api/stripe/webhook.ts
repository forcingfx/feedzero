import { handleStripeWebhook } from "../../src/core/stripe/webhook-handler";
import { LicenseIssuerImpl } from "../../src/core/license/issuer";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";
import { isFlagEnabled } from "../../src/core/flags/flags";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Resolve storage once at module load — Vercel keeps the function instance
// warm across invocations so this isn't repeated per request. Upstash when
// env vars are present, MemoryLicenseStorage otherwise (dev/preview).
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
  return handleStripeWebhook(req, {
    signingSecret: webhookSecret,
    issuer,
    killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
  });
}
