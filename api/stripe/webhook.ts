import { handleStripeWebhook } from "../../src/core/stripe/webhook-handler";
import { LicenseIssuerImpl } from "../../src/core/license/issuer";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";
import { resolveSeenEventStore } from "../../src/core/stripe/resolve-seen-event-store";
import { isFlagEnabled } from "../../src/core/flags/flags";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

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
