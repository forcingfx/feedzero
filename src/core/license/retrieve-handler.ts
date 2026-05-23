/**
 * Shared `/api/license/retrieve` handler.
 *
 * The billing-success page calls this after a Stripe Checkout completes. The
 * Stripe webhook (`/api/stripe/webhook`) issues the license asynchronously; if
 * the user lands on /billing/success before the webhook has finished, there
 * is no token to display. This endpoint closes that race by:
 *
 *   1. Resolving the Stripe `session_id` → customerId via the Stripe API.
 *   2. Looking up the most recent unrevoked, unexpired LicenseRecord for that
 *      customer in our LicenseStorage.
 *   3. Re-signing the record's payload (HMAC is deterministic, so the token
 *      is identical to the one originally minted by the webhook).
 *   4. Returning the token to the client, or 202 "still processing" if the
 *      webhook hasn't fired yet — the client retries.
 *
 * Why re-sign instead of store the token: the token IS the signed payload;
 * storing it would duplicate state. Re-deriving from the record keeps
 * Upstash small and avoids a second source of truth.
 *
 * Authorization model: we don't verify session_id ownership — anyone with a
 * Stripe Checkout session ID can retrieve the associated license. Session IDs
 * are random secrets Stripe issues to one buyer; treating them as bearer
 * credentials matches Stripe's own URL-bearer pattern on the success page.
 */

import { signLicense, type SigningKey } from "./sign";
import type { LicenseRecord, LicenseStorage } from "./storage";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";
import { logError } from "../../../packages/core/src/utils/log-error";

export const SUPPORTED_METHODS: readonly string[] = ["POST"];
const ROUTE = "/api/license/retrieve";

/**
 * Minimal subset of `stripe.checkout.sessions.retrieve` we depend on.
 * Defined here so tests pass a fake without pulling in the Stripe SDK.
 */
export interface SessionRetriever {
  retrieve(sessionId: string): Promise<{ customer: string | null }>;
}

export interface RetrieveHandlerOptions {
  sessions: SessionRetriever;
  storage: LicenseStorage;
  signingKey: SigningKey;
  /** Caller-injected for tests. Defaults to Date.now()/1000. */
  nowSec?: number;
}

interface OkBody {
  ok: true;
  token: string;
}
interface PendingBody {
  ok: false;
  pending: true;
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

function pendingResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, pending: true } satisfies PendingBody),
    { status: 202, headers: JSON_HEADERS },
  );
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
  logError({
    route: ROUTE,
    method,
    status,
    traceId,
    errClass,
    errMsg: message,
  });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId } satisfies ErrBody),
    { status, headers: JSON_HEADERS },
  );
}

export async function handleLicenseRetrieveRequest(
  request: Request,
  options: RetrieveHandlerOptions,
): Promise<Response> {
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  const parsed = await parseBody(request);
  if (!parsed.ok) {
    return clientError(parsed.error, 400, traceId);
  }

  let customerId: string | null;
  try {
    const session = await options.sessions.retrieve(parsed.sessionId);
    customerId = session.customer;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe session lookup failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method,
    );
  }

  if (!customerId) {
    return clientError("session has no customer", 404, traceId);
  }

  const records = await options.storage.listByCustomer(customerId);
  if (!records.ok) {
    return serverError(
      `license storage error: ${records.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method,
    );
  }

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const candidate = await findActiveUnrevokedRecord(
    records.value,
    nowSec,
    options.storage,
  );
  if (!candidate.ok) {
    return serverError(
      `license storage error: ${candidate.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method,
    );
  }
  if (candidate.value === null) {
    return pendingResponse();
  }

  const token = await signLicense(
    {
      tier: candidate.value.tier,
      customerId: candidate.value.customerId,
      keyId: candidate.value.keyId,
      issuedAtSec: candidate.value.issuedAtSec,
      expirySec: candidate.value.expirySec,
    },
    options.signingKey,
  );

  return okResponse({ ok: true, token });
}

type ParseResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

/**
 * Stripe Checkout session IDs are `cs_test_<alnum>` or `cs_live_<alnum>`. We
 * defensively reject any other shape so a malicious caller cannot smuggle URL
 * path traversal, control characters, or scripting payloads into our error
 * logs or downstream Stripe SDK calls.
 */
const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

async function parseBody(request: Request): Promise<ParseResult> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const sessionId = (parsed as { sessionId?: unknown }).sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ok: false, error: "missing or invalid 'sessionId' field" };
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { ok: false, error: "invalid sessionId format" };
  }
  return { ok: true, sessionId };
}

/**
 * Walk records newest-first, returning the first one that is unexpired AND
 * not on the revocation deny-list. Returns ok(null) when no candidate exists
 * — the caller treats that as "pending, retry later".
 *
 * Why check revocation in addition to expirySec: revocation is signaled via
 * `LicenseStorage.isRevoked`, NOT by mutating the record's `status` field
 * (see `issuer.ts:113-119` — revokeAllForCustomer adds to deny-list without
 * touching records). Trusting `status === "active"` would surface revoked
 * tokens to customers who already cancelled.
 */
async function findActiveUnrevokedRecord(
  records: readonly LicenseRecord[],
  nowSec: number,
  storage: LicenseStorage,
): Promise<{ ok: true; value: LicenseRecord | null } | { ok: false; error: string }> {
  const fresh = [...records]
    .filter((r) => r.expirySec >= nowSec)
    .sort((a, b) => b.issuedAtSec - a.issuedAtSec);

  for (const record of fresh) {
    const revoked = await storage.isRevoked(record.keyId);
    if (!revoked.ok) return revoked;
    if (!revoked.value) {
      return { ok: true, value: record };
    }
  }
  return { ok: true, value: null };
}
