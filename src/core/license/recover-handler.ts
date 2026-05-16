/**
 * Shared `/api/license/recover` handler.
 *
 * Cross-device license recovery via Stripe Customer Portal magic link:
 *
 *   1. User on Device B (no localStorage, no session_id) visits /billing/recover,
 *      enters their email.
 *   2. We look up the Stripe customer. If found, we mint a short-TTL HMAC-signed
 *      recovery token over `{customerId, exp}` and create a Stripe billing portal
 *      session whose return_url carries that token as a query param.
 *   3. Client redirects to the portal URL. Stripe's portal magic-link emails the
 *      customer; only the real owner of the email can complete the auth.
 *   4. On portal "Return to merchant", the user lands at /billing/issued, which
 *      validates the recovery token signature and issues the license token.
 *
 * Security: anyone can submit any email at step 1; the only thing that step
 * reveals to an attacker is "this URL accepts emails". The Stripe magic-link
 * gate at step 3 ensures only the real customer can complete the flow. We
 * return the same 200 shape for unknown emails (with no portalUrl) to avoid
 * leaking which emails are paying customers (enumeration protection).
 *
 * The signed recovery token is the binding between step 1 and step 4: only
 * a customerId that WE signed will be accepted by /billing/issued. Without
 * the signature, Stripe's portal redirect would be a vector for issuing
 * tokens to arbitrary customer IDs.
 */

import { hmacSha256, base64UrlEncode, base64UrlDecodeToString } from "./crypto";
import { newTraceId } from "../../utils/trace-id";
import { logError } from "../../utils/log-error";
import type { Result } from "../../utils/result";
import { ok, err } from "../../utils/result";

const ROUTE = "/api/license/recover";

/** Methods this handler dispatches. Consumed by the Hono/Vite/Vercel routing
 * contract tests in `tests/server.test.ts`. */
export const SUPPORTED_METHODS = ["POST"] as const;

/** Minimal subset of Stripe customers.list we depend on. */
export interface CustomersClient {
  list(params: { email: string; limit?: number }): Promise<{
    data: { id: string; email: string | null }[];
  }>;
}

/** Minimal subset of Stripe billingPortal.sessions.create we depend on. */
export interface PortalClient {
  create(params: {
    customer: string;
    return_url: string;
  }): Promise<{ url: string }>;
}

export interface SigningKey {
  secret: string;
}

export interface RecoverHandlerOptions {
  customers: CustomersClient;
  portal: PortalClient;
  signingKey: SigningKey;
  /** Base URL the portal will redirect back to (recovery token is appended as `?recovery=`). */
  returnUrlBase: string;
  /** Override for tests. Defaults to Math.floor(Date.now()/1000). */
  nowSec?: () => number;
  /** Token TTL in seconds. Default 900 (15 min). */
  ttlSec?: number;
}

interface OkBody {
  ok: true;
  portalUrl?: string;
}
interface ErrBody {
  ok: false;
  error: string;
  traceId: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function okResponse(body: OkBody): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

function clientError(message: string, status: number, traceId: string): Response {
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

// Pragmatic email shape check — full RFC 5322 is overkill and Stripe will
// reject true garbage anyway. We just want to filter obvious junk before
// hitting the Stripe API.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedRequest {
  email: string;
}

async function parseRequest(request: Request): Promise<Result<ParsedRequest>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return err("body must be a JSON object");
  }
  const obj = body as Record<string, unknown>;
  const email = obj.email;
  if (typeof email !== "string" || email.length === 0) {
    return err("missing 'email'");
  }
  if (email.length > 320 || !EMAIL_RE.test(email)) {
    return err("invalid email shape");
  }
  return ok({ email });
}

export async function handleLicenseRecoverRequest(
  request: Request,
  options: RecoverHandlerOptions,
): Promise<Response> {
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  const parsed = await parseRequest(request);
  if (!parsed.ok) {
    return clientError(parsed.error, 400, traceId);
  }

  let customer: { id: string; email: string | null } | null;
  try {
    const list = await options.customers.list({
      email: parsed.value.email,
      limit: 1,
    });
    customer = list.data[0] ?? null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe customer lookup failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method,
    );
  }

  // Enumeration protection: same shape whether the email is known or not.
  // Stripe's portal magic-link is the real auth gate; we just don't help
  // an attacker enumerate paying customers via this endpoint.
  if (!customer) {
    return okResponse({ ok: true });
  }

  const nowSec = options.nowSec ? options.nowSec() : Math.floor(Date.now() / 1000);
  const ttlSec = options.ttlSec ?? 900;
  const recoveryToken = await signRecoveryToken(
    { customerId: customer.id, exp: nowSec + ttlSec },
    options.signingKey,
  );

  const returnUrl = `${options.returnUrlBase}?recovery=${encodeURIComponent(recoveryToken)}`;

  let portalUrl: string;
  try {
    const session = await options.portal.create({
      customer: customer.id,
      return_url: returnUrl,
    });
    portalUrl = session.url;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe portal session failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method,
    );
  }

  return okResponse({ ok: true, portalUrl });
}

// ─── Recovery token format (separate from license tokens) ────────────────
//
// `<base64url(payload-json)>.<base64url(hmac-sha256(payload-json, secret))>`
//
// Payload: `{customerId: string, exp: number /* unix seconds */}`
//
// Distinct from license tokens (which use a colon-delimited string payload)
// so a leaked recovery token cannot be coerced into a license token.

export interface RecoveryPayload {
  customerId: string;
  exp: number;
}

export async function signRecoveryToken(
  payload: RecoveryPayload,
  key: SigningKey,
): Promise<string> {
  const json = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(json);
  const sigBytes = await hmacSha256(encodedPayload, key.secret);
  const encodedSig = base64UrlEncodeBytes(sigBytes);
  return `${encodedPayload}.${encodedSig}`;
}

export async function verifyRecoveryToken(
  token: string,
  key: SigningKey,
  nowSec?: number,
): Promise<Result<RecoveryPayload>> {
  if (typeof token !== "string" || !token.includes(".")) {
    return err("malformed recovery token");
  }
  const [encodedPayload, providedSig] = token.split(".");
  if (!encodedPayload || !providedSig) {
    return err("malformed recovery token");
  }

  const expectedSigBytes = await hmacSha256(encodedPayload, key.secret);
  const expectedSig = base64UrlEncodeBytes(expectedSigBytes);
  if (!timingSafeEqual(expectedSig, providedSig)) {
    return err("recovery token signature invalid");
  }

  const json = base64UrlDecodeToString(encodedPayload);
  if (!json) return err("recovery token payload undecodable");

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return err("recovery token payload not JSON");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { customerId?: unknown }).customerId !== "string" ||
    typeof (payload as { exp?: unknown }).exp !== "number"
  ) {
    return err("recovery token payload shape invalid");
  }

  const typed = payload as RecoveryPayload;
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  if (typed.exp <= now) {
    return err("recovery token expired");
  }
  return ok(typed);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
