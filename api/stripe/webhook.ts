// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { isFlagEnabled } from "../../src/core/flags/flags";
import { LicenseIssuerImpl } from "../../src/core/license/issuer";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";
import { resolveSeenEventStore } from "../../src/core/stripe/resolve-seen-event-store";
import { handleStripeWebhook } from "../../src/core/stripe/webhook-handler";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Resolved once per cold start, not per request.
const storagePromise = resolveLicenseStorage();
const eventStorePromise = resolveSeenEventStore();
const issuerPromise = storagePromise.then(
  (storage) =>
    new LicenseIssuerImpl({
      signingKey: { secret: signingSecret },
      storage,
    }),
);

export async function POST(req: Request): Promise<Response> {
  const [issuer, eventStore] = await Promise.all([
    issuerPromise,
    eventStorePromise,
  ]);
  return handleStripeWebhook(req, {
    signingSecret: webhookSecret,
    issuer,
    eventStore,
    killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
  });
}
