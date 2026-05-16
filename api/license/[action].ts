import { handleLicenseVerifyRequest } from "../../src/core/license/verify-handler";
import { handleLicenseIssueRequest } from "../../src/core/license/issue-handler";
import { handleLicenseRetrieveRequest } from "../../src/core/license/retrieve-handler";
import { handleLicenseRecoverRequest } from "../../src/core/license/recover-handler";
import { handleIssueFromRecoveryRequest } from "../../src/core/license/issue-from-recovery-handler";
import { handlePortalRequest } from "../../src/core/stripe/portal-handler";
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
 * Vercel dynamic route catching /api/license/{verify,issue,retrieve,portal}.
 * Consolidated into one function (instead of four separate files) so we stay
 * under the Hobby plan's 12-function-per-deployment ceiling. Each branch
 * delegates to the existing shared handler — same logic, same tests, same
 * behavior; only the file boundary changed.
 *
 * `portal` is co-located here for hosting-boundary reasons, not semantic
 * ones: Stripe Customer Portal sessions are billing operations, but
 * keeping them under /api/license/* keeps the function count tight.
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

  if (action === "retrieve") {
    const storage = await storagePromise;
    return handleLicenseRetrieveRequest(req, {
      sessions: {
        retrieve: async (sessionId: string) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          const customer =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null;
          return { customer };
        },
      },
      storage,
      signingKey: { secret: signingSecret },
    });
  }

  if (action === "portal") {
    const storage = await storagePromise;
    return handlePortalRequest(req, {
      sessions: {
        retrieve: async (sessionId: string) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          const customer =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null;
          return { customer };
        },
      },
      portal: {
        create: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.billingPortal.sessions.create(params);
          return { url: session.url };
        },
      },
      signingKey: { secret: signingSecret },
      storage,
    });
  }

  if (action === "recover") {
    return handleLicenseRecoverRequest(req, {
      customers: {
        list: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const list = await stripe.customers.list({
            email: params.email,
            limit: params.limit ?? 1,
          });
          return {
            data: list.data.map((c) => ({ id: c.id, email: c.email ?? null })),
          };
        },
      },
      portal: {
        create: async (params) => {
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
          const session = await stripe.billingPortal.sessions.create(params);
          return { url: session.url };
        },
      },
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
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
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
