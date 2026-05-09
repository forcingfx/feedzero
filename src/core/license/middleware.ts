/**
 * License authorization middleware (framework-agnostic).
 *
 * Wraps the cryptographic verification (`verifyLicense`) and the revocation
 * check (`LicenseStorage.isRevoked`) into a single call that the API layer
 * (Hono / Vercel serverless / Vite dev proxy) can invoke uniformly.
 *
 * Why this is a pure function and not an Express/Hono middleware:
 *  - Three different runtimes consume it (see CLAUDE.md "three-entry-point
 *    rule"). Each runtime turns a `Result` into its own response shape.
 *  - Returning `Result` keeps the test surface tiny — no need to fake a
 *    `next()` or a response object.
 *
 * Failure mode: if the revocation lookup itself errors (e.g. KV outage), we
 * fail closed and surface a "storage" error rather than auto-allowing or
 * auto-denying silently. See `docs/internal/strategy.md` §6.3 (license-key
 * model) and §6.4 (kill switches / revocation).
 */

import { verifyLicense } from "@/core/license/verify";
import type { LicensePayload } from "@/core/license/format";
import type { SigningKey } from "@/core/license/sign";
import type { LicenseStorage } from "@/core/license/storage";
import { ok, err, type Result } from "@/utils/result";

export interface LicenseAuthContext {
  /** The verified payload, with revocation already checked. */
  license: LicensePayload;
}

export interface LicenseAuthOptions {
  signingKey: SigningKey;
  storage: LicenseStorage;
  /** Caller-injected for tests. Defaults to Date.now()/1000. */
  nowSec?: number;
}

const BEARER_SCHEME = "Bearer ";

/**
 * Reads `Authorization: Bearer <token>` from the request, verifies the token,
 * checks the deny-list, and returns the license payload OR a structured error.
 * Pure function — does NOT short-circuit by writing to the response itself,
 * because callers (Hono / Vercel) handle the response shape.
 */
export async function authorizeLicense(
  request: Request,
  options: LicenseAuthOptions,
): Promise<Result<LicenseAuthContext>> {
  const tokenResult = parseBearerToken(request.headers.get("Authorization"));
  if (!tokenResult.ok) return tokenResult;

  const verifyResult = await verifyLicense(tokenResult.value, options.signingKey, {
    nowSec: options.nowSec,
  });
  if (!verifyResult.ok) return verifyResult;
  const payload = verifyResult.value;

  const revokedResult = await options.storage.isRevoked(payload.keyId);
  if (!revokedResult.ok) {
    return err(`license storage error: ${revokedResult.error}`);
  }
  if (revokedResult.value) {
    return err("license revoked");
  }

  return ok({ license: payload });
}

/**
 * Extract the bearer token from an Authorization header value.
 *
 * The scheme check is case-sensitive (`Bearer`, not `bearer`). RFC 7235 says
 * scheme tokens are case-insensitive, but every production caller of this
 * function controls both ends — being strict here surfaces client bugs early
 * rather than masking them.
 */
function parseBearerToken(headerValue: string | null): Result<string> {
  if (!headerValue) return err("missing Authorization header");
  if (!headerValue.startsWith(BEARER_SCHEME)) {
    return err("invalid Authorization scheme (expected Bearer)");
  }
  return ok(headerValue.slice(BEARER_SCHEME.length));
}
