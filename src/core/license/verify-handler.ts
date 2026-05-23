/**
 * Shared `/api/license/verify` handler.
 *
 * Clients POST `{ token }` and the server replies with the verified payload
 * or a structured error. Used by clients on app start to confirm their stored
 * license is still cryptographically valid AND not on the deny-list.
 *
 * Why not reuse `authorizeLicense` directly: that helper reads the token from
 * an `Authorization: Bearer` header. Here the token sits in the POST body
 * (clients call this endpoint precisely *because* they aren't yet attaching
 * the token to a privileged request — it's the validity probe). The two
 * helpers share the same verify + revocation pipeline below the wire shape.
 */

import { verifyLicense } from "./verify";
import type { LicensePayload } from "./format";
import type { SigningKey } from "./sign";
import type { LicenseStorage } from "./storage";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";
import { logError } from "../../../packages/core/src/utils/log-error";

export const SUPPORTED_METHODS: readonly string[] = ["POST"];
const ROUTE = "/api/license/verify";

export interface VerifyHandlerOptions {
  signingKey: SigningKey;
  storage: LicenseStorage;
  /** Caller-injected for tests. Defaults to Date.now()/1000. */
  nowSec?: number;
}

interface OkBody {
  ok: true;
  license: LicensePayload;
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

/**
 * 4xx response — surfaces traceId for support correlation, no server log.
 */
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

/**
 * 5xx response — surfaces traceId AND emits a structured server-log line.
 */
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

export async function handleLicenseVerifyRequest(
  request: Request,
  options: VerifyHandlerOptions,
): Promise<Response> {
  const traceId = newTraceId();
  const method = request.method;

  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }

  const tokenResult = await readTokenFromBody(request);
  if (!tokenResult.ok) {
    return clientError(tokenResult.error, 400, traceId);
  }

  const verified = await verifyLicense(tokenResult.token, options.signingKey, {
    nowSec: options.nowSec,
  });
  if (!verified.ok) {
    return clientError(verified.error, 401, traceId);
  }

  const revoked = await options.storage.isRevoked(verified.value.keyId);
  if (!revoked.ok) {
    return serverError(
      `license storage error: ${revoked.error}`,
      "LicenseStorageError",
      503,
      traceId,
      method,
    );
  }
  if (revoked.value) {
    return clientError("license revoked", 401, traceId);
  }

  return okResponse({ ok: true, license: verified.value }, 200);
}

type TokenRead =
  | { ok: true; token: string }
  | { ok: false; error: string };

async function readTokenFromBody(request: Request): Promise<TokenRead> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const token = (parsed as { token?: unknown }).token;
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, error: "missing or invalid 'token' field" };
  }
  return { ok: true, token };
}
