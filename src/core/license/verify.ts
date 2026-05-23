/**
 * License token verification.
 *
 * Verifies the wire format `fz_<base64url(payload)>.<base64url(signature)>`:
 *   1. parses the token shape
 *   2. recomputes the HMAC and compares constant-time against the signature
 *   3. decodes the payload (delegating to `format.ts`)
 *   4. enforces expiry and "issuedAt not in the future" (clock-skew protection)
 *
 * Returns `Result<LicensePayload>` so callers handle malformed/expired/forged
 * inputs without exception flow. The token is untrusted user input; throwing
 * here would push the burden onto every caller.
 *
 * Revocation is checked separately by callers consulting `LicenseStorage` —
 * this module only does cryptographic + temporal validity. Keeping the layers
 * separate means we can verify a token without a DB round-trip when revocation
 * is checked elsewhere (e.g. when both already happened and we just need to
 * re-decode the payload).
 */

import {
  decodeLicensePayload,
  type LicensePayload,
} from "./format";
import type { SigningKey } from "./sign";
import {
  hmacSha256,
  base64UrlEncode,
  base64UrlDecodeToString,
} from "./crypto";
import { ok, err, type Result } from "../../../packages/core/src/utils/result";

const TOKEN_PREFIX = "fz_";

export interface VerifyOptions {
  /** Unix epoch seconds. Caller-injected for testability; defaults to Date.now()/1000. */
  nowSec?: number;
}

export async function verifyLicense(
  token: string,
  key: SigningKey,
  options: VerifyOptions = {},
): Promise<Result<LicensePayload>> {
  if (!token) return err("empty token");
  if (!token.startsWith(TOKEN_PREFIX)) {
    return err(`invalid token prefix (expected ${TOKEN_PREFIX})`);
  }

  const body = token.slice(TOKEN_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2) {
    return err(`invalid token format: expected 2 parts, got ${parts.length}`);
  }

  const [encodedPayloadB64, signatureB64] = parts;
  const encodedPayload = base64UrlDecodeToString(encodedPayloadB64);

  const expectedSignature = await hmacSha256(encodedPayload, key.secret);
  const expectedSignatureB64 = base64UrlEncode(expectedSignature);

  if (!constantTimeEqual(signatureB64, expectedSignatureB64)) {
    return err("invalid signature");
  }

  const payloadResult = decodeLicensePayload(encodedPayload);
  if (!payloadResult.ok) return payloadResult;
  const payload = payloadResult.value;

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (payload.issuedAtSec > nowSec) {
    return err(
      `token issuedAt is in the future (issuedAt=${payload.issuedAtSec}, now=${nowSec})`,
    );
  }
  // Boundary inclusive: a token expiring exactly at nowSec is still valid.
  if (payload.expirySec < nowSec) {
    return err(
      `token expired (expired=${payload.expirySec}, now=${nowSec})`,
    );
  }

  return ok(payload);
}

/**
 * Constant-time string comparison. Avoids early exit on first byte mismatch
 * so an attacker measuring response time cannot incrementally guess the
 * signature. Length mismatch returns false but does so after touching every
 * byte of the shorter string, so length is not directly leakable from
 * this function (length is, however, observable in network traffic — that's
 * outside this module's scope).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let dummy = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) dummy |= a.charCodeAt(i) ^ b.charCodeAt(i);
    void dummy;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
