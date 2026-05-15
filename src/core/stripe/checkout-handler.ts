/**
 * Shared `/api/checkout/create-session` handler.
 *
 * Creates a Stripe Checkout Session for a subscription purchase. The
 * frontend POSTs `{priceId, successUrl, cancelUrl, customerEmail?}`, the
 * handler validates inputs, calls Stripe, returns the hosted Checkout URL.
 * The frontend redirects the user there.
 *
 * Stripe doc references (per the stripe-best-practices memory):
 *  - https://docs.stripe.com/checkout/quickstart — Checkout Session shape
 *  - https://docs.stripe.com/api/checkout/sessions/create
 *  - .agents/skills/stripe-best-practices/references/billing.md
 *
 * Critical security controls:
 *  1. Price-ID allowlist. Never trust client-supplied priceId — an attacker
 *     could pass `price_attacker_$0.01` and get a "Pro" license for a penny.
 *     The allowlist is server-controlled (env var or constant).
 *  2. Success/cancel URL scheme allowlist (http/https only) — prevents
 *     `javascript:` and other dangerous schemes from reaching Stripe's
 *     redirect chain.
 *  3. Idempotency key derived from request shape — accidental double-clicks
 *     within ~5 min collapse to one Checkout Session, preventing double-charge.
 *  4. KILL_SIGNUPS gate — operator can disable new signups without redeploy.
 *
 * The handler does NOT include the Stripe SDK directly. It receives a
 * minimal `CheckoutClient` interface so unit tests can pass a fake. The
 * Vercel/Hono wrapper constructs a real Stripe client from
 * `STRIPE_SECRET_KEY` and passes it in.
 */

import { newTraceId } from "../../utils/trace-id";
import { logError } from "../../utils/log-error";

export const SUPPORTED_METHODS: readonly string[] = ["POST"];
const ROUTE = "/api/checkout/create-session";

/**
 * Minimal subset of `stripe.checkout.sessions.create` we depend on. Defining
 * it here means tests pass a fake without pulling in the Stripe SDK.
 */
export interface CheckoutClient {
  create(
    params: {
      mode: "subscription";
      line_items: Array<{ price: string; quantity: number }>;
      success_url: string;
      cancel_url: string;
      customer_email?: string;
      /**
       * Force the customer to check a "I agree to the Terms" box before pay.
       * Stripe docs: https://docs.stripe.com/api/checkout/sessions/create
       * Requires a Terms of Service URL set in Dashboard → Settings → Public
       * details. Our Terms (feedzero.app/legal/terms § 6) embed the Art. 16(m)
       * waiver of the EU 14-day withdrawal right for digital subscriptions —
       * without this checkbox the waiver is unenforceable.
       */
      consent_collection?: { terms_of_service: "required" | "none" };
    },
    opts?: { idempotencyKey?: string },
  ): Promise<{ url: string | null; id: string }>;
}

export interface CheckoutHandlerOptions {
  client: CheckoutClient;
  /**
   * Server-controlled list of acceptable price IDs. Requests for any other
   * priceId are rejected with 400. Critical security control — see top-of-file.
   */
  allowedPrices: readonly string[];
  killSignups?: () => boolean;
}

interface OkBody {
  ok: true;
  url: string;
  sessionId: string;
}
interface ErrBody {
  ok: false;
  error: string;
  traceId: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function okResponse(body: OkBody, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function clientError(
  message: string,
  status: number,
  traceId: string,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId } satisfies ErrBody),
    { status, headers: JSON_HEADERS },
  );
}

function serverError(
  message: string,
  errClass: string,
  status: number,
  traceId: string,
  method: string,
): Response {
  logError({ route: ROUTE, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId } satisfies ErrBody),
    { status, headers: JSON_HEADERS },
  );
}

interface CreateArgs {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

type ParseResult =
  | { ok: true; args: CreateArgs }
  | { ok: false; error: string };

async function parseBody(
  request: Request,
  allowedPrices: readonly string[],
): Promise<ParseResult> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;

  const priceId = obj.priceId;
  if (typeof priceId !== "string" || priceId.length === 0) {
    return { ok: false, error: "missing or invalid 'priceId'" };
  }
  if (!allowedPrices.includes(priceId)) {
    return { ok: false, error: "priceId not in allowlist" };
  }

  const successUrl = obj.successUrl;
  if (typeof successUrl !== "string" || !isHttpUrl(successUrl)) {
    return { ok: false, error: "'successUrl' must be an http(s) URL" };
  }

  const cancelUrl = obj.cancelUrl;
  if (typeof cancelUrl !== "string" || !isHttpUrl(cancelUrl)) {
    return { ok: false, error: "'cancelUrl' must be an http(s) URL" };
  }

  const customerEmail = obj.customerEmail;
  if (customerEmail !== undefined && typeof customerEmail !== "string") {
    return { ok: false, error: "'customerEmail' must be a string if provided" };
  }

  const args: CreateArgs = { priceId, successUrl, cancelUrl };
  if (typeof customerEmail === "string") args.customerEmail = customerEmail;
  return { ok: true, args };
}

/**
 * Accept only http: and https:. Rejects javascript:, data:, file:, etc.
 * URL parsing failure also rejects.
 */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Idempotency key for the Checkout Session. Stripe collapses retries with
 * the same key into one session. We derive from the request shape + a
 * 5-min time bucket so:
 *   - Double-clicks within 5 min → one session (good — no double-charge)
 *   - User changes mind, retries 10 min later → new session (good — actually new intent)
 */
function deriveIdempotencyKey(args: CreateArgs): string {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const email = args.customerEmail ?? "anon";
  return `cs:${args.priceId}:${email}:${bucket}`;
}

export async function handleCreateCheckoutSession(
  request: Request,
  options: CheckoutHandlerOptions,
): Promise<Response> {
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  if (options.killSignups?.()) {
    return clientError("signups disabled", 503, traceId);
  }

  const parsed = await parseBody(request, options.allowedPrices);
  if (!parsed.ok) {
    return clientError(parsed.error, 400, traceId);
  }

  let session;
  try {
    session = await options.client.create(
      {
        mode: "subscription",
        line_items: [{ price: parsed.args.priceId, quantity: 1 }],
        success_url: parsed.args.successUrl,
        cancel_url: parsed.args.cancelUrl,
        // Force the EU 14-day-withdrawal-waiver checkbox. See the
        // CheckoutClient.create JSDoc for the why; without this, the waiver
        // text in our Terms is unenforceable against an EU consumer.
        consent_collection: { terms_of_service: "required" },
        ...(parsed.args.customerEmail
          ? { customer_email: parsed.args.customerEmail }
          : {}),
      },
      { idempotencyKey: deriveIdempotencyKey(parsed.args) },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe checkout failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method,
    );
  }

  if (!session.url) {
    return serverError(
      "stripe returned no checkout url",
      "StripeNoUrl",
      502,
      traceId,
      method,
    );
  }

  return okResponse(
    { ok: true, url: session.url, sessionId: session.id },
    200,
  );
}
