// Thin Vercel wrapper — see ADR 007 and tests/scripts/api-wrappers.test.ts.
// This file MUST keep importing from src/: scripts/build-api.js uses it as an
// esbuild entry point and overwrites it in place at build time. Committing
// that build output detaches the endpoint from src/ permanently, and handler
// changes silently stop deploying.
import { isFlagEnabled } from "../../src/core/flags/flags";
import { handleIssueFromRecoveryRequest } from "../../src/core/license/issue-from-recovery-handler";
import { handleLicenseIssueRequest } from "../../src/core/license/issue-handler";
import { LicenseIssuerImpl } from "../../src/core/license/issuer";
import { resolveLicenseStorage } from "../../src/core/license/resolve-storage";
import { handleLicenseRetrieveRequest } from "../../src/core/license/retrieve-handler";
import { handleLicenseRecoverRequest } from "../../src/core/license/recover-handler";
import { handleLicenseVerifyRequest } from "../../src/core/license/verify-handler";
import { handlePortalRequest } from "../../src/core/stripe/portal-handler";

const signingSecret = process.env.LICENSE_SIGNING_KEY ?? "";

// Resolved once per cold start, not per request.
const storagePromise = resolveLicenseStorage();
const issuerPromise = storagePromise.then(
  (storage) =>
    new LicenseIssuerImpl({
      signingKey: { secret: signingSecret },
      storage,
    }),
);

/** Stripe SDK constructed lazily so unrelated actions never need the key. */
async function stripeClient() {
  const { default: Stripe } = await import("stripe");
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
}

/** Checkout-session lookup, shared by the `retrieve` and `portal` actions. */
const sessions = {
  retrieve: async (sessionId: string) => {
    const stripe = await stripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customer =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? null);
    return { customer };
  },
};

/** Billing-portal creation, shared by the `portal` and `recover` actions. */
const portal = {
  create: async (params: { customer: string; return_url: string }) => {
    const stripe = await stripeClient();
    const session = await stripe.billingPortal.sessions.create(params);
    return { url: session.url };
  },
};

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

  if (action === "retrieve") {
    const storage = await storagePromise;
    return handleLicenseRetrieveRequest(req, {
      sessions,
      storage,
      signingKey: { secret: signingSecret },
    });
  }

  if (action === "portal") {
    const storage = await storagePromise;
    return handlePortalRequest(req, {
      sessions,
      portal,
      signingKey: { secret: signingSecret },
      storage,
    });
  }

  if (action === "recover") {
    return handleLicenseRecoverRequest(req, {
      customers: {
        list: async (params) => {
          const stripe = await stripeClient();
          const list = await stripe.customers.list({
            email: params.email,
            limit: params.limit ?? 1,
          });
          return {
            data: list.data.map((c) => ({ id: c.id, email: c.email ?? null })),
          };
        },
      },
      portal,
      signingKey: { secret: signingSecret },
      returnUrlBase: `${new URL(req.url).origin}/billing/issued`,
    });
  }

  if (action === "issue-from-recovery") {
    const storage = await storagePromise;
    return handleIssueFromRecoveryRequest(req, {
      signingKey: { secret: signingSecret },
      storage,
      subscriptions: {
        retrieve: async (subscriptionId) => {
          const stripe = await stripeClient();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          return { status: sub.status };
        },
      },
    });
  }

  return new Response(
    JSON.stringify({ ok: false, error: "unknown license action" }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}
