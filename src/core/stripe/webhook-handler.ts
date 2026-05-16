/**
 * Shared Stripe webhook handler.
 *
 * Verifies the `Stripe-Signature` header against the raw request body using
 * HMAC-SHA256 (per Stripe's manual verification spec [1]), parses the event,
 * deduplicates by `event.id` if a {@link SeenEventStore} is configured, and
 * dispatches to per-event methods on a {@link LicenseIssuer} collaborator.
 *
 * Stripe sends each event up to 3 days (live mode) on retry — without
 * idempotency the issuer mints a duplicate license token on every retry.
 * The dedup check happens AFTER signature verification so an attacker
 * cannot fill the dedup store with garbage event IDs from unsigned probes.
 *
 * [1] https://stripe.com/docs/webhooks#verify-manually
 */

import type { Result } from "../../utils/result";
import type { SeenEventStore } from "./seen-event-store";
import { newTraceId } from "../../utils/trace-id";
import { logError } from "../../utils/log-error";

const ROUTE = "/api/stripe/webhook";

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
  /**
   * Optional kill-switch probe. When it returns true, the handler returns
   * 503 *after* signature verification but *before* dispatch. 503 makes
   * Stripe back off and retry, so events queue up safely while the operator
   * has signups paused (rather than being silently dropped). Defaults to
   * always-allow.
   */
  killSignups?: () => boolean;
  /**
   * Optional event-id dedup store. When configured, duplicate deliveries
   * (Stripe retries the same `event.id`) return 200 without re-dispatching.
   * When absent (e.g. tests, or if KV is unavailable), the handler falls
   * back to always-dispatch — relying on the issuer's own per-subscription
   * idempotency for safety.
   */
  eventStore?: SeenEventStore;
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

function clientError(
  message: string,
  status: number,
  traceId: string,
): Response {
  return jsonResponse({ ok: false, error: message, traceId }, status);
}

function serverError(
  message: string,
  errClass: string,
  status: number,
  traceId: string,
  method: string,
): Response {
  logError({ route: ROUTE, method, status, traceId, errClass, errMsg: message });
  return jsonResponse({ ok: false, error: message, traceId }, status);
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

  const expirySec = extractSubscriptionCurrentPeriodEnd(obj);
  if (expirySec === null) {
    return acceptedWithIssue("Missing current_period_end");
  }
  return outcomeFromIssuerResult(
    await issuer.recordRenewal({ customerId, subscriptionId, expirySec }),
  );
}

/**
 * Read `current_period_end` from a Subscription object, tolerant of API version drift.
 *
 * Legacy (pre-2026 dahlia): `subscription.current_period_end` at top level.
 * Dahlia+ (2026-04-22 onward): moved to `subscription.items.data[0].current_period_end`
 * — Stripe split billing periods per subscription item to support items that bill
 * on different cadences.
 *
 * We try the dahlia path first (where dahlia-and-newer events arrive) and fall
 * back to top-level for older API versions. Returning `null` triggers an
 * acceptedWithIssue 200 in the caller; the wrapper logs the miss so the API
 * version drift becomes visible in production logs.
 */
function extractSubscriptionCurrentPeriodEnd(
  obj: Record<string, unknown>,
): number | null {
  const items = obj.items as
    | { data?: Array<{ current_period_end?: unknown }> }
    | undefined;
  const itemEnd = items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  const topLevel = obj.current_period_end;
  return typeof topLevel === "number" ? topLevel : null;
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
  const subscriptionId = extractInvoiceSubscription(obj);
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
 * Read the related subscription id from an Invoice object, tolerant of API version drift.
 *
 * Legacy: `invoice.subscription` at top level.
 * Dahlia+ (2026-04-22 onward): moved to
 * `invoice.parent.subscription_details.subscription` — Stripe re-shaped invoices
 * to express their relationship to a subscription (or other parent) via a typed
 * `parent` discriminator.
 *
 * Returning `null` falls through to the "invoice.paid without subscription"
 * acceptedWithIssue 200, which the wrapper logs.
 */
function extractInvoiceSubscription(
  obj: Record<string, unknown>,
): string | null {
  const parent = obj.parent as
    | { subscription_details?: { subscription?: unknown } }
    | undefined;
  const newPath = parent?.subscription_details?.subscription;
  if (typeof newPath === "string") return newPath;
  return getString(obj, "subscription");
}

/**
 * Read the renewal period end from an Invoice's line items. Legacy and dahlia
 * both expose this at `lines.data[0].period.end` (the field itself didn't move
 * in dahlia), but kept as a small helper for symmetry and forward-readability.
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
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  const verified = await verifyAndParse(request, config);
  if (!verified.ok) {
    return clientError(verified.error, verified.status, traceId);
  }

  // Signature checked first so an attacker can't probe webhook behavior with
  // unsigned requests once they learn the kill switch is flipped.
  if (config.killSignups?.()) {
    return clientError("signups disabled", 503, traceId);
  }

  // Event-id dedup. Runs after signature verification (so unsigned probes
  // cannot pollute the dedup store) and after KILL_SIGNUPS (so a kill-switch
  // 503 still makes Stripe retry without burning the eventId).
  const event = verified.value.event;
  if (config.eventStore && event.id) {
    const newSeen = await config.eventStore.markSeenIfNew(event.id);
    if (!newSeen.ok) {
      // Storage failure — return 500 so Stripe retries.
      return serverError(newSeen.error, "EventStoreError", 500, traceId, method);
    }
    if (!newSeen.value) {
      // Duplicate delivery — Stripe doc: return 200 immediately, do not re-dispatch.
      return jsonResponse({ ok: true, alreadyProcessed: true }, 200);
    }
  }

  const outcome = await dispatchEvent(event, config.issuer);
  if (outcome.status >= 500) {
    // Issuer or downstream failure — log + return same status. We re-shape
    // the body to include traceId rather than passing outcome.body through.
    const errMsg =
      typeof (outcome.body as { error?: unknown })?.error === "string"
        ? (outcome.body as { error: string }).error
        : "dispatch failed";
    return serverError(errMsg, "DispatchFailed", outcome.status, traceId, method);
  }
  // 200-with-issue paths return success to Stripe (so it stops retrying) but
  // represent silent operational gaps — most often missing metadata or an
  // API-version drift in the event payload shape. Surface them in runtime
  // logs so they don't go unnoticed. We deliberately do not change status —
  // returning 5xx would cause Stripe to retry indefinitely on an issue that
  // is operator-side, not transient.
  if (
    outcome.status === 200 &&
    typeof outcome.body === "object" &&
    outcome.body !== null &&
    "issue" in outcome.body &&
    typeof (outcome.body as { issue: unknown }).issue === "string"
  ) {
    logError({
      route: ROUTE,
      method,
      status: 200,
      traceId,
      errClass: "AcceptedWithIssue",
      errMsg: (outcome.body as { issue: string }).issue,
    });
  }
  return jsonResponse(outcome.body, outcome.status);
}
