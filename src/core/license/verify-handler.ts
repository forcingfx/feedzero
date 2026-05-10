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

export const SUPPORTED_METHODS: readonly string[] = ["POST"];

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
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function jsonResponse(body: OkBody | ErrBody, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleLicenseVerifyRequest(
  request: Request,
  options: VerifyHandlerOptions,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  const tokenResult = await readTokenFromBody(request);
  if (!tokenResult.ok) {
    return jsonResponse({ ok: false, error: tokenResult.error }, 400);
  }

  const verified = await verifyLicense(tokenResult.token, options.signingKey, {
    nowSec: options.nowSec,
  });
  if (!verified.ok) {
    return jsonResponse({ ok: false, error: verified.error }, 401);
  }

  const revoked = await options.storage.isRevoked(verified.value.keyId);
  if (!revoked.ok) {
    return jsonResponse(
      { ok: false, error: `license storage error: ${revoked.error}` },
      503,
    );
  }
  if (revoked.value) {
    return jsonResponse({ ok: false, error: "license revoked" }, 401);
  }

  return jsonResponse({ ok: true, license: verified.value }, 200);
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
