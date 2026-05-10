import { handleCreateCheckoutSession } from "../../src/core/stripe/checkout-handler";
import { resolveAllowedPrices } from "../../src/core/stripe/allowed-prices";
import { isFlagEnabled } from "../../src/core/flags/flags";

const allowedPrices = resolveAllowedPrices();

export async function POST(req: Request): Promise<Response> {
  return handleCreateCheckoutSession(req, {
    // Lazy: Stripe SDK constructed only if the handler reaches the API call
    // (i.e. after kill-switch, body validation, allowlist all pass). Lets
    // tests/dev hit 4xx/503 paths without needing STRIPE_SECRET_KEY set.
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
