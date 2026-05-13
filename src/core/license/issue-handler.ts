/**
 * Shared `/api/license/issue` admin handler.
 *
 * Operator-only endpoint that mints a license bypassing Stripe. Used as:
 *  - Manual issuance fallback (founder licenses, comp accounts, refunds-as-renewal)
 *    when the Stripe webhook is unavailable or before live-mode activation.
 *  - The Stripe-free e2e verification path for storage roundtrips
 *    (issue → token → verify with same token → 200 + payload).
 *
 * Auth model: a single shared admin token compared constant-time against
 * `ADMIN_API_KEY` env. NOT a Stripe key — Stripe's RAK guidance does not
 * apply, but the same general principles do: env-var only, constant-time
 * compare, never log, fail-closed on missing config.
 *
 * Defense ordering (matches the Stripe webhook handler's pattern):
 *   1. Method check
 *   2. Admin auth verified
 *   3. KILL_SIGNUPS gate
 *   4. Body validation
 *   5. Issue
 *
 * Step 2 runs before step 3 so an attacker probing the kill switch must
 * still present a valid admin token.
 */

import { LicenseIssuerImpl } from "./issuer";
import type { LicenseRecord } from "./storage";
import { newTraceId } from "../../utils/trace-id";
import { logError } from "../../utils/log-error";

export const SUPPORTED_METHODS: readonly string[] = ["POST"];
const ROUTE = "/api/license/issue";

export interface IssueHandlerOptions {
  issuer: LicenseIssuerImpl;
  /**
   * Operator-only shared key. Empty/missing → handler refuses every request
   * with 503 "admin endpoint not configured" rather than accepting any
   * token. Fail-closed.
   */
  adminApiKey: string;
  /** Optional kill-switch probe. Returns true → handler returns 503 after auth. */
  killSignups?: () => boolean;
}

interface OkBody {
  ok: true;
  token: string;
  record: LicenseRecord;
}
interface ErrBody {
  ok: false;
  error: string;
  traceId: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const BEARER_SCHEME = "Bearer ";

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

/**
 * Constant-time string equality. Length mismatch returns false but loops
 * the shorter string anyway so the timing signal is uniform across the
 * compared bytes.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

function checkAdminAuth(
  authorizationHeader: string | null,
  adminApiKey: string,
): AuthResult {
  // Fail-closed: empty admin key means "endpoint not configured" — refuse
  // every request rather than accepting any token via "" === "".
  if (!adminApiKey) {
    return { ok: false, status: 503, error: "admin endpoint not configured" };
  }
  if (!authorizationHeader) {
    return { ok: false, status: 401, error: "missing Authorization header" };
  }
  if (!authorizationHeader.startsWith(BEARER_SCHEME)) {
    return {
      ok: false,
      status: 401,
      error: "invalid Authorization scheme (expected Bearer)",
    };
  }
  const token = authorizationHeader.slice(BEARER_SCHEME.length);
  if (!constantTimeEqual(token, adminApiKey)) {
    return { ok: false, status: 401, error: "invalid admin token" };
  }
  return { ok: true };
}

interface IssueArgs {
  customerId: string;
  tier: "personal" | "pro";
  subscriptionId?: string;
  expirySec?: number;
}

type BodyResult =
  | { ok: true; args: IssueArgs }
  | { ok: false; error: string };

async function readIssueArgsFromBody(request: Request): Promise<BodyResult> {
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

  const customerId = obj.customerId;
  if (typeof customerId !== "string" || customerId.length === 0) {
    return { ok: false, error: "missing or invalid 'customerId'" };
  }
  if (customerId.includes(":")) {
    return { ok: false, error: "'customerId' must not contain ':'" };
  }

  const tier = obj.tier;
  if (tier !== "personal" && tier !== "pro") {
    return { ok: false, error: "'tier' must be 'personal' or 'pro'" };
  }

  const subscriptionId = obj.subscriptionId;
  if (subscriptionId !== undefined && typeof subscriptionId !== "string") {
    return { ok: false, error: "'subscriptionId' must be a string if provided" };
  }

  const expirySec = obj.expirySec;
  if (
    expirySec !== undefined &&
    (typeof expirySec !== "number" || !Number.isInteger(expirySec))
  ) {
    return { ok: false, error: "'expirySec' must be an integer if provided" };
  }

  const args: IssueArgs = { customerId, tier };
  if (typeof subscriptionId === "string") args.subscriptionId = subscriptionId;
  if (typeof expirySec === "number") args.expirySec = expirySec;
  return { ok: true, args };
}

export async function handleLicenseIssueRequest(
  request: Request,
  options: IssueHandlerOptions,
): Promise<Response> {
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  const auth = checkAdminAuth(
    request.headers.get("Authorization"),
    options.adminApiKey,
  );
  if (!auth.ok) {
    // 503 ("admin endpoint not configured") is a server-config issue:
    // empty adminApiKey at boot is operator-actionable. 401 paths are
    // unauthenticated callers — client-side, no log.
    if (auth.status === 503) {
      return serverError(auth.error, "AdminEndpointNotConfigured", 503, traceId, method);
    }
    return clientError(auth.error, auth.status, traceId);
  }

  if (options.killSignups?.()) {
    return clientError("signups disabled", 503, traceId);
  }

  const body = await readIssueArgsFromBody(request);
  if (!body.ok) {
    return clientError(body.error, 400, traceId);
  }

  // Issuer needs a non-optional subscriptionId. Empty string is a sentinel
  // meaning "manually issued, not tied to a Stripe subscription" — matches
  // how `LicenseRecord.subscriptionId` is documented (optional for legacy +
  // admin-issued records).
  const issueResult = await options.issuer.issueWithToken({
    customerId: body.args.customerId,
    tier: body.args.tier,
    subscriptionId: body.args.subscriptionId ?? "",
    ...(body.args.expirySec !== undefined ? { expirySec: body.args.expirySec } : {}),
  });
  if (!issueResult.ok) {
    return serverError(
      `issue failed: ${issueResult.error}`,
      "IssueFailed",
      500,
      traceId,
      method,
    );
  }

  return okResponse(
    { ok: true, token: issueResult.value.token, record: issueResult.value.record },
    200,
  );
}
