/**
 * Shared `/api/license/issue-from-recovery` handler.
 *
 * Step 4 of the cross-device recovery flow (see recover-handler.ts for
 * the full design). The user has come back from the Stripe Customer Portal
 * with a signed recovery token in the URL. We:
 *
 *   1. Validate the recovery token's HMAC signature + expiry.
 *   2. Defense-in-depth: confirm the subscription is still active in Stripe
 *      (the customer may have cancelled while in the portal).
 *   3. Look up the LicenseRecord in our storage and re-sign a fresh license
 *      token so the customer's local app can activate.
 *
 * Why a separate endpoint from /api/license/retrieve: retrieve takes a
 * Stripe `session_id` (which is checkout-flow-specific) and looks the
 * customer up via stripe.checkout.sessions.retrieve. The recovery flow
 * has no session_id — it has a `customerId` we already signed. Mixing
 * the two would force a "this OR that" pattern in the request body that
 * complicates threat-modeling.
 */

import { signLicense } from "./sign";
import { verifyRecoveryToken, type SigningKey } from "./recover-handler";
import type { LicenseStorage, LicenseRecord } from "./storage";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";
import { logError } from "../../../packages/core/src/utils/log-error";

const ROUTE = "/api/license/issue-from-recovery";

/** Methods this handler dispatches. Consumed by the routing contract tests. */
export const SUPPORTED_METHODS = ["POST"] as const;

/** Minimal subset of stripe.subscriptions.retrieve we depend on. */
export interface SubscriptionsClient {
  retrieve(subscriptionId: string): Promise<{ status: string }>;
}

export interface IssueFromRecoveryHandlerOptions {
  signingKey: SigningKey;
  storage: LicenseStorage;
  subscriptions: SubscriptionsClient;
  /** Override for tests. Defaults to Math.floor(Date.now()/1000). */
  nowSec?: () => number;
}

interface OkBody {
  ok: true;
  token: string;
  tier: string;
}
interface ErrBody {
  ok: false;
  error: string;
  traceId: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

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

export async function handleIssueFromRecoveryRequest(
  request: Request,
  options: IssueFromRecoveryHandlerOptions,
): Promise<Response> {
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return clientError("invalid JSON body", 400, traceId);
  }
  const recoveryToken = (body as { recoveryToken?: unknown })?.recoveryToken;
  if (typeof recoveryToken !== "string" || recoveryToken.length === 0) {
    return clientError("missing 'recoveryToken'", 400, traceId);
  }

  const nowSec = options.nowSec ? options.nowSec() : Math.floor(Date.now() / 1000);
  const verified = await verifyRecoveryToken(
    recoveryToken,
    options.signingKey,
    nowSec,
  );
  if (!verified.ok) {
    // 401 because the signed token IS the credential — bad signature or
    // expiry means "not authenticated" rather than "bad request shape".
    return clientError(verified.error, 401, traceId);
  }
  const { customerId } = verified.value;

  // Defense in depth: even though we signed the recovery token, the customer
  // may have cancelled the subscription in the portal before clicking Return.
  // Look up the first record for this customer to find the subscription id,
  // then verify with Stripe before issuing.
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
  if (records.value.length === 0) {
    return clientError("no license record for customer", 404, traceId);
  }

  const candidate = await pickActiveUnrevokedRecord(
    records.value,
    nowSec,
    options.storage,
  );
  if (!candidate) {
    return clientError("no active license record for customer", 404, traceId);
  }

  // Verify subscription is still active in Stripe. Only meaningful when the
  // record has a subscriptionId — older or admin-issued records may not.
  // In the no-subscriptionId case, the record being unrevoked + unexpired
  // is the strongest signal we have (cancellation routes through the
  // webhook which adds keyId to the revocation deny-list).
  if (candidate.subscriptionId) {
    let subStatus: string;
    try {
      const sub = await options.subscriptions.retrieve(candidate.subscriptionId);
      subStatus = sub.status;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return serverError(
        `stripe subscription lookup failed: ${message}`,
        "StripeApiError",
        502,
        traceId,
        method,
      );
    }

    // "active" and "trialing" are the legitimate paying states. Everything else
    // (canceled, unpaid, past_due, paused, incomplete*) means "no, don't issue
    // a fresh token".
    if (subStatus !== "active" && subStatus !== "trialing") {
      return clientError(
        `subscription is not active (status: ${subStatus})`,
        403,
        traceId,
      );
    }
  }

  const token = await signLicense(
    {
      tier: candidate.tier,
      customerId: candidate.customerId,
      keyId: candidate.keyId,
      issuedAtSec: candidate.issuedAtSec,
      expirySec: candidate.expirySec,
    },
    options.signingKey,
  );

  return new Response(
    JSON.stringify({ ok: true, token, tier: candidate.tier } satisfies OkBody),
    { status: 200, headers: JSON_HEADERS },
  );
}

/** Newest-first, unexpired, unrevoked. */
async function pickActiveUnrevokedRecord(
  records: readonly LicenseRecord[],
  nowSec: number,
  storage: LicenseStorage,
): Promise<LicenseRecord | null> {
  const sorted = [...records].sort((a, b) => b.issuedAtSec - a.issuedAtSec);
  for (const rec of sorted) {
    if (rec.expirySec <= nowSec) continue;
    const revoked = await storage.isRevoked(rec.keyId);
    if (!revoked.ok) return null;
    if (revoked.value) continue;
    return rec;
  }
  return null;
}
