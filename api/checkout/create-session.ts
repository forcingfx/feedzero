// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { isFlagEnabled } from "../../src/core/flags/flags";
import { resolveAllowedPrices } from "../../src/core/stripe/allowed-prices";
import { handleCreateCheckoutSession } from "../../src/core/stripe/checkout-handler";

const allowedPrices = resolveAllowedPrices();

export async function POST(req: Request): Promise<Response> {
  return handleCreateCheckoutSession(req, {
    // Lazy: the Stripe SDK is constructed only if the handler reaches the API
    // call (i.e. after kill-switch, body validation and allowlist all pass).
    // Lets tests/dev hit 4xx/503 paths without STRIPE_SECRET_KEY set.
    client: {
      create: async (params, opts) => {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
        const session = await stripe.checkout.sessions.create(params, opts);
        return { url: session.url, id: session.id };
      },
    },
    allowedPrices,
    killSignups: () => isFlagEnabled("KILL_SIGNUPS"),
  });
}
