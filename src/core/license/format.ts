/**
 * License token payload encoding/decoding.
 *
 * Wire format (compact, colon-joined):
 *   v1:tier:expirySec:customerId:keyId:issuedAtSec
 *
 * The leading `v1:` reserves a forward-compatible bump path. If we ever need
 * a v2 with different fields, decoders can dispatch on the prefix.
 *
 * Why a custom format and not JWT:
 *   - JWT's algorithm-choice header is a footgun (alg=none, alg confusion).
 *   - JWT is heavier on the wire (~200 bytes vs ~80 for our payload).
 *   - We control both ends — we don't need third-party interop.
 *
 * Encoding/decoding is signature-agnostic. Signing happens in `sign.ts` and
 * verification in `verify.ts`; this module only handles the payload shape.
 */

import { ok, err, type Result } from "@/utils/result";

export type LicenseTier = "free" | "personal" | "pro";

const TIERS: readonly LicenseTier[] = ["free", "personal", "pro"] as const;

export interface LicensePayload {
  tier: LicenseTier;
  /** Unix epoch seconds when the license stops being valid. */
  expirySec: number;
  /** Stripe customer id (`cus_...`). */
  customerId: string;
  /** 32-char hex; the primary identifier used for revocation lookup. */
  keyId: string;
  /** Unix epoch seconds when the license was issued. */
  issuedAtSec: number;
}

const VERSION = "v1";

/**
 * Encode a payload to its wire string. Throws synchronously on inputs that
 * would corrupt the format — colons in `customerId` or `keyId` would create
 * extra fields and produce a token that decodes to garbage.
 */
export function encodeLicensePayload(payload: LicensePayload): string {
  if (payload.customerId.includes(":")) {
    throw new Error("customerId must not contain a colon (corrupts format)");
  }
  if (payload.keyId.includes(":")) {
    throw new Error("keyId must not contain a colon (corrupts format)");
  }
  return [
    VERSION,
    payload.tier,
    String(payload.expirySec),
    payload.customerId,
    payload.keyId,
    String(payload.issuedAtSec),
  ].join(":");
}

/**
 * Decode a wire string to a payload. Returns `Result` rather than throwing
 * because malformed input is expected at this boundary (untrusted clients).
 */
export function decodeLicensePayload(encoded: string): Result<LicensePayload> {
  if (!encoded) return err("empty input");

  const parts = encoded.split(":");
  if (parts.length !== 6) {
    return err(`invalid format: expected 6 fields, got ${parts.length}`);
  }

  const [version, tier, expirySecRaw, customerId, keyId, issuedAtSecRaw] =
    parts;

  if (version !== VERSION) {
    return err(`unknown version: ${version}`);
  }
  if (!isLicenseTier(tier)) {
    return err(`unknown tier: ${tier}`);
  }

  const expirySec = Number(expirySecRaw);
  if (!Number.isFinite(expirySec) || !Number.isInteger(expirySec)) {
    return err(`expiry must be an integer number, got ${expirySecRaw}`);
  }
  const issuedAtSec = Number(issuedAtSecRaw);
  if (!Number.isFinite(issuedAtSec) || !Number.isInteger(issuedAtSec)) {
    return err(`issuedAt must be an integer number, got ${issuedAtSecRaw}`);
  }

  return ok({ tier, expirySec, customerId, keyId, issuedAtSec });
}

function isLicenseTier(value: string): value is LicenseTier {
  return (TIERS as readonly string[]).includes(value);
}
