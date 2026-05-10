/**
 * License token signing.
 *
 * Wire format: `fz_<base64url(payload)>.<base64url(signature)>`
 * - payload is the colon-joined wire string from `format.ts`
 * - signature is HMAC-SHA256(payload) using the server signing secret
 *
 * Determinism: HMAC-SHA256 of the same input under the same key is byte-equal,
 * so re-signing the same payload yields the same token. Tests rely on this.
 *
 * The signing secret is loaded by callers (typically from
 * `process.env.LICENSE_SIGNING_KEY`); this module is environment-agnostic to
 * keep it framework-portable and easy to test.
 */

import {
  encodeLicensePayload,
  type LicensePayload,
} from "./format";
import { hmacSha256, base64UrlEncode } from "./crypto";

/** Opaque wrapper so callers don't accidentally pass a stringly-typed token. */
export interface SigningKey {
  /** UTF-8 string secret. Min 32 bytes recommended; not enforced here. */
  secret: string;
}

const TOKEN_PREFIX = "fz_";
const PART_SEPARATOR = ".";

/**
 * Sign a payload and return the wire token. Async because Web Crypto's
 * `subtle.sign` is async — same API in browsers and Node 20+.
 */
export async function signLicense(
  payload: LicensePayload,
  key: SigningKey,
): Promise<string> {
  const encodedPayload = encodeLicensePayload(payload);
  const signature = await hmacSha256(encodedPayload, key.secret);
  return TOKEN_PREFIX + base64UrlEncode(encodedPayload) + PART_SEPARATOR + base64UrlEncode(signature);
}
