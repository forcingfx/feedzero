/**
 * Shared Stripe webhook handler.
 *
 * Verifies the `Stripe-Signature` header against the raw request body using
 * HMAC-SHA256 (per Stripe's manual verification spec [1]), parses the event,
 * and dispatches to per-event methods on a {@link LicenseIssuer} collaborator.
 *
 * Idempotency is the responsibility of the {@link LicenseIssuer}
 * implementation. The natural idempotency key is `subscriptionId` for
 * issue/renewal flows. A future PR can add an
 * `event:processed:<event.id>` set if duplicate-delivery becomes a problem
 * in production.
 *
 * [1] https://stripe.com/docs/webhooks#verify-manually
 */

import type { Result } from "@/utils/result";

export interface LicenseIssuer {
  issue(args: {
    customerId: string;
    tier: "personal" | "pro";
    subscriptionId: string;
  }): Promise<Result<void>>;
  revoke(args: {
    customerId: string;
    subscriptionId: string;
    reason: string;
  }): Promise<Result<void>>;
  recordRenewal(args: {
    customerId: string;
    subscriptionId: string;
    expirySec: number;
  }): Promise<Result<void>>;
}

/**
 * HTTP methods this handler accepts. Used by routing contract tests in
 * server.test.ts to enforce that the Hono server, the Vercel wrapper, and
 * the shared handler all agree on which methods are supported.
 */
export const SUPPORTED_METHODS: readonly string[] = ["POST"];

export interface WebhookConfig {
  /** STRIPE_WEBHOOK_SECRET — the signing secret from the Stripe dashboard. */
  signingSecret: string;
  /** Replay-window tolerance in seconds. Default 300 (Stripe's recommendation). */
  toleranceSec?: number;
  issuer: LicenseIssuer;
}

const DEFAULT_TOLERANCE_SEC = 300;

interface ParsedSignature {
  ts: number;
  v1: string;
}

/**
 * Parse a Stripe-Signature header of the form `t=<ts>,v1=<sig>[,v0=<legacy>]`.
 * v0 (legacy) signatures are intentionally ignored. Returns null on any
 * structural problem so the caller can return 400.
 */
export function parseStripeSignatureHeader(
  header: string,
): ParsedSignature | null {
  const parts = header.split(",");
  let ts: number | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) ts = parsed;
    } else if (key === "v1") {
      v1 = value;
    }
  }
  if (ts === null || v1 === null || v1.length === 0) return null;
  return { ts, v1 };
}

/**
 * Constant-time compare two equal-length hex strings. Returns false when
 * lengths differ (still constant-time within the matching prefix).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

interface VerifiedPayload {
  event: StripeEvent;
}

type VerifyResult =
  | { ok: true; value: VerifiedPayload }
  | { ok: false; status: 400; error: string };

async function verifyAndParse(
  request: Request,
  config: WebhookConfig,
): Promise<VerifyResult> {
  const sigHeader = request.headers.get("Stripe-Signature");
  if (!sigHeader) {
    return { ok: false, status: 400, error: "Missing Stripe-Signature header" };
  }
  const parsed = parseStripeSignatureHeader(sigHeader);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "Malformed Stripe-Signature header",
    };
  }

  const tolerance = config.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.ts) > tolerance) {
    return { ok: false, status: 400, error: "Timestamp outside tolerance" };
  }

  // Read raw body BEFORE parsing — we must HMAC the exact bytes Stripe signed.
  const rawBody = await request.text();
  const expected = await hmacSha256Hex(
    config.signingSecret,
    `${parsed.ts}.${rawBody}`,
  );
  if (!constantTimeEqual(expected, parsed.v1)) {
    return { ok: false, status: 400, error: "Invalid signature" };
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
  return { ok: true, value: { event } };
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface DispatchOutcome {
  status: number;
  body: unknown;
}

const OK_RESPONSE: DispatchOutcome = { status: 200, body: { ok: true } };

/**
 * Map a Result from a {@link LicenseIssuer} call to a DispatchOutcome.
 * Errors become 500 so Stripe retries with exponential backoff.
 */
function outcomeFromIssuerResult(result: Result<void>): DispatchOutcome {
  if (!result.ok) {
    return { status: 500, body: { ok: false, error: result.error } };
  }
  return OK_RESPONSE;
}

/**
 * Build a 200 outcome that surfaces a non-fatal data issue. We return 200
 * so Stripe stops retrying (the webhook *did* fire correctly), but record
 * the issue in the response body for our own observability.
 */
function acceptedWithIssue(issue: string): DispatchOutcome {
  return { status: 200, body: { ok: true, issue } };
}

function getString(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key];
  return typeof val === "string" ? val : null;
}

function extractTier(
  subscription: Record<string, unknown>,
): "personal" | "pro" | null {
  const items = subscription.items as
    | { data?: Array<{ price?: { metadata?: { tier?: unknown } } }> }
    | undefined;
  const tier = items?.data?.[0]?.price?.metadata?.tier;
  return tier === "personal" || tier === "pro" ? tier : null;
}

async function handleSubscriptionCreated(
  obj: Record<string, unknown>,
  issuer: LicenseIssuer,
): Promise<DispatchOutcome> {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  const tier = extractTier(obj);
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  if (!tier) {
    // Typically means the Stripe Price was not configured with `tier`
    // metadata. We accept the webhook so Stripe stops retrying but surface
    // the issue for our own observability.
    return acceptedWithIssue("Missing tier metadata on price");
  }
  return outcomeFromIssuerResult(
    await issuer.issue({ customerId, subscriptionId, tier }),
  );
}

async function handleSubscriptionDeleted(
  obj: Record<string, unknown>,
  issuer: LicenseIssuer,
): Promise<DispatchOutcome> {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }
  return outcomeFromIssuerResult(
    await issuer.revoke({
      customerId,
      subscriptionId,
      reason: "subscription_deleted",
    }),
  );
}

async function handleSubscriptionUpdated(
  obj: Record<string, unknown>,
  issuer: LicenseIssuer,
): Promise<DispatchOutcome> {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "id");
  if (!customerId || !subscriptionId) {
    return acceptedWithIssue("Missing customer or subscription id");
  }

  if (isCancellationUpdate(obj)) {
    return outcomeFromIssuerResult(
      await issuer.revoke({
        customerId,
        subscriptionId,
        reason: "subscription_deleted",
      }),
    );
  }

  const expirySec = obj.current_period_end;
  if (typeof expirySec !== "number") {
    return acceptedWithIssue("Missing current_period_end");
  }
  return outcomeFromIssuerResult(
    await issuer.recordRenewal({ customerId, subscriptionId, expirySec }),
  );
}

function isCancellationUpdate(obj: Record<string, unknown>): boolean {
  return (
    obj.cancel_at_period_end === true && getString(obj, "status") === "canceled"
  );
}

async function handleInvoicePaid(
  obj: Record<string, unknown>,
  issuer: LicenseIssuer,
): Promise<DispatchOutcome> {
  const customerId = getString(obj, "customer");
  const subscriptionId = getString(obj, "subscription");
  if (!customerId || !subscriptionId) {
    return {
      status: 200,
      body: { ok: true, ignored: "invoice.paid without subscription" },
    };
  }
  const expirySec = extractInvoicePeriodEnd(obj);
  if (expirySec === null) {
    return acceptedWithIssue("Missing line item period.end");
  }
  return outcomeFromIssuerResult(
    await issuer.recordRenewal({ customerId, subscriptionId, expirySec }),
  );
}

/**
 * Invoice events carry the renewal period end inside
 * `lines.data[0].period.end` rather than at the top level.
 */
function extractInvoicePeriodEnd(
  obj: Record<string, unknown>,
): number | null {
  const lines = obj.lines as
    | { data?: Array<{ period?: { end?: unknown } }> }
    | undefined;
  const end = lines?.data?.[0]?.period?.end;
  return typeof end === "number" ? end : null;
}

async function dispatchEvent(
  event: StripeEvent,
  issuer: LicenseIssuer,
): Promise<DispatchOutcome> {
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case "customer.subscription.created":
      return handleSubscriptionCreated(obj, issuer);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(obj, issuer);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(obj, issuer);
    case "invoice.paid":
      return handleInvoicePaid(obj, issuer);
    default:
      // Accept-and-ignore unknown types so Stripe stops retrying.
      return {
        status: 200,
        body: { ok: true, ignored: event.type ?? "unknown" },
      };
  }
}

export async function handleStripeWebhook(
  request: Request,
  config: WebhookConfig,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const verified = await verifyAndParse(request, config);
  if (!verified.ok) {
    return jsonResponse({ ok: false, error: verified.error }, verified.status);
  }

  const outcome = await dispatchEvent(verified.value.event, config.issuer);
  return jsonResponse(outcome.body, outcome.status);
}
