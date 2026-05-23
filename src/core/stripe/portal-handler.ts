/**
 * Shared `/api/billing/portal` handler.
 *
 * Creates a Stripe Customer Portal session and returns its URL for the
 * client to redirect to. The portal lets paying customers cancel,
 * change payment method, and download past invoices — all self-serve,
 * no support tickets.
 *
 * Two authentication paths converge here:
 *
 *   Path A — sessionId (from /billing/success): the customer just
 *   completed Checkout, doesn't yet have a stored license token, but
 *   has the session ID in their URL. We use Stripe to map session →
 *   customer.
 *
 *   Path B — Authorization: Bearer fz_... (from Settings): the
 *   customer has been using the app, has the token in localStorage,
 *   and wants to manage their subscription. We verify the bearer and
 *   extract customerId from the signed payload directly. Cheaper —
 *   no Stripe round-trip for customer resolution.
 *
 * When both are present, the bearer wins. A signed verified license is
 * strictly more authoritative than a session ID URL parameter; if a
 * malicious actor learned someone else's session ID, the bearer
 * precedence prevents them from opening the victim's portal.
 *
 * The handler does NOT include the Stripe SDK directly. It receives
 * minimal `PortalClient` + `PortalSessionRetriever` interfaces so
 * tests pass fakes. The Vercel/Hono/Vite wrappers construct real
 * Stripe clients from `STRIPE_SECRET_KEY` and pass them in.
 */

import { verifyLicense } from "../license/verify";
import type { SigningKey } from "../license/sign";
import type { LicenseStorage } from "../license/storage";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";
import { logError } from "../../../packages/core/src/utils/log-error";

export const SUPPORTED_METHODS: readonly string[] = ["POST"];
const ROUTE = "/api/billing/portal";

/** Minimal subset of `stripe.billingPortal.sessions.create` we depend on. */
export interface PortalClient {
  create(params: {
    customer: string;
    return_url: string;
  }): Promise<{ url: string }>;
}

/** Minimal subset of `stripe.checkout.sessions.retrieve` we depend on. */
export interface PortalSessionRetriever {
  retrieve(sessionId: string): Promise<{ customer: string | null }>;
}

export interface PortalHandlerOptions {
  portal: PortalClient;
  sessions: PortalSessionRetriever;
  signingKey: SigningKey;
  storage: LicenseStorage;
  /** Caller-injected for tests. Defaults to Date.now()/1000. */
  nowSec?: number;
}

interface OkBody {
  ok: true;
  url: string;
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

const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

interface ParsedRequest {
  sessionId?: string;
  returnUrl: string;
  bearer?: string;
}

type ParseResult =
  | { ok: true; req: ParsedRequest }
  | { ok: false; error: string };

async function parseRequest(request: Request): Promise<ParseResult> {
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
  const returnUrl = obj.returnUrl;
  if (typeof returnUrl !== "string" || returnUrl.length === 0) {
    return { ok: false, error: "missing or invalid 'returnUrl'" };
  }
  if (!isHttpUrl(returnUrl)) {
    return { ok: false, error: "'returnUrl' must be an http(s) URL" };
  }

  const sessionId = obj.sessionId;
  let validatedSessionId: string | undefined;
  if (sessionId !== undefined) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return { ok: false, error: "invalid 'sessionId'" };
    }
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return { ok: false, error: "invalid sessionId format" };
    }
    validatedSessionId = sessionId;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearer = bearerMatch ? bearerMatch[1] : undefined;

  if (!validatedSessionId && !bearer) {
    return {
      ok: false,
      error: "provide either 'sessionId' or 'Authorization: Bearer'",
    };
  }

  return {
    ok: true,
    req: {
      sessionId: validatedSessionId,
      returnUrl,
      bearer,
    },
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

type CustomerResolution =
  | { ok: true; customerId: string }
  | { ok: false; status: number; error: string; errClass?: string };

async function resolveCustomerFromBearer(
  bearer: string,
  options: PortalHandlerOptions,
): Promise<CustomerResolution> {
  const verified = await verifyLicense(bearer, options.signingKey, {
    nowSec: options.nowSec,
  });
  if (!verified.ok) {
    return { ok: false, status: 401, error: verified.error };
  }
  const revoked = await options.storage.isRevoked(verified.value.keyId);
  if (!revoked.ok) {
    return {
      ok: false,
      status: 503,
      error: `license storage error: ${revoked.error}`,
      errClass: "LicenseStorageError",
    };
  }
  if (revoked.value) {
    return { ok: false, status: 401, error: "license revoked" };
  }
  return { ok: true, customerId: verified.value.customerId };
}

async function resolveCustomerFromSession(
  sessionId: string,
  options: PortalHandlerOptions,
): Promise<CustomerResolution> {
  try {
    const session = await options.sessions.retrieve(sessionId);
    if (!session.customer) {
      return { ok: false, status: 404, error: "session has no customer" };
    }
    return { ok: true, customerId: session.customer };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 502,
      error: `stripe session lookup failed: ${message}`,
      errClass: "StripeApiError",
    };
  }
}

export async function handlePortalRequest(
  request: Request,
  options: PortalHandlerOptions,
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

  // Bearer wins when both are present. A verified signed license is strictly
  // more authoritative than a session-ID URL param — see top-of-file note on
  // why this matters for session-ID leak resistance.
  const resolution = parsed.req.bearer
    ? await resolveCustomerFromBearer(parsed.req.bearer, options)
    : await resolveCustomerFromSession(parsed.req.sessionId!, options);

  if (!resolution.ok) {
    if (resolution.status >= 500) {
      return serverError(
        resolution.error,
        resolution.errClass ?? "InternalError",
        resolution.status,
        traceId,
        method,
      );
    }
    return clientError(resolution.error, resolution.status, traceId);
  }

  let session;
  try {
    session = await options.portal.create({
      customer: resolution.customerId,
      return_url: parsed.req.returnUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe portal create failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method,
    );
  }

  return okResponse({ ok: true, url: session.url });
}
