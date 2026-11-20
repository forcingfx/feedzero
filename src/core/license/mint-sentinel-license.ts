/**
 * Library surface for the operator CLIs that mint a license outside Stripe:
 *
 *   - `scripts/mint-test-license.ts` — a Supporter token for exercising
 *     gated features (Signal, smart filters, rules) on a real build.
 *   - `scripts/mint-smoke-license.ts` — the long-lived token CI stores as
 *     `SMOKE_LICENSE_TOKEN` for the cross-device sync smoke.
 *
 * Both tokens carry a *sentinel* customer id ("test-license", "smoke-license")
 * instead of a Stripe `cus_*` id, so they are grep-able in logs, never
 * collide with a paying customer, and can be revoked by keyId like any other
 * license. Nothing here touches storage: a sentinel token is deliberately
 * not persisted, so `find-license.ts` cannot mistake it for a customer.
 *
 * Pure and framework-agnostic — no `process`, no filesystem — so the shells
 * stay I/O only and these functions are testable without Node typing.
 * Mirrors the `find-license.ts` / `admin-find-license.ts` split.
 */

import type { LicensePayload, LicenseTier } from "./format";
import { signLicense, type SigningKey } from "./sign";
import { err, ok, type Result } from "../../../packages/core/src/utils/result";

/** Customer id prefix for tokens minted by `scripts/mint-test-license.ts`. */
export const TEST_LICENSE_SENTINEL = "test-license";

/** Customer id for the CI smoke token (`scripts/mint-smoke-license.ts`). */
export const SMOKE_LICENSE_SENTINEL = "smoke-license";

/**
 * A month is long enough to test a feature end to end and short enough
 * that a leaked test token is self-limiting without a revocation.
 */
export const DEFAULT_TEST_LICENSE_DAYS = 30;

const DAY_SEC = 24 * 3600;
const KEY_ID_BYTE_LENGTH = 16;

/** Lower-case kebab-case only: safe in the colon-joined wire format and in URLs. */
const LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A label that reads like a Stripe id would defeat the sentinel's purpose. */
const STRIPE_CUSTOMER_PREFIX = "cus_";

export interface SentinelLicenseArgs {
  /** Grep-able stand-in for the Stripe customer id. */
  sentinel: string;
  /** Optional suffix so several tokens minted from the same sentinel stay distinguishable. */
  label?: string;
  tier: LicenseTier;
  /** Lifetime in seconds from `nowSec`. Must be positive. */
  ttlSec: number;
  /** Unix epoch seconds. Caller-injected for testability. */
  nowSec: number;
  /** Caller-injected for testability. Defaults to 16 random bytes as hex. */
  generateKeyId?: () => string;
}

export interface MintedSentinelLicense {
  /** The signed wire token to hand to the operator. */
  token: string;
  payload: LicensePayload;
  /** `YYYY-MM-DD` for the operator's eyes; the payload keeps the exact second. */
  expiresOn: string;
}

/**
 * Build the payload for a sentinel license. Validates the inputs the
 * operator controls (label, ttl) so `encodeLicensePayload` never has to
 * throw on a colon and a zero-day token cannot be minted by accident.
 */
export function buildSentinelLicensePayload(
  args: SentinelLicenseArgs,
): Result<LicensePayload> {
  if (!Number.isInteger(args.ttlSec) || args.ttlSec <= 0) {
    return err(`ttlSec must be a positive integer, got ${args.ttlSec}`);
  }
  const customerId = sentinelCustomerId(args.sentinel, args.label);
  if (!customerId.ok) return customerId;

  return ok({
    tier: args.tier,
    customerId: customerId.value,
    keyId: (args.generateKeyId ?? randomKeyId)(),
    issuedAtSec: args.nowSec,
    expirySec: args.nowSec + args.ttlSec,
  });
}

/**
 * Build and sign a sentinel license in one step. Async because
 * `signLicense` rides on Web Crypto's `subtle.sign`.
 */
export async function mintSentinelLicense(
  args: SentinelLicenseArgs,
  key: SigningKey,
): Promise<Result<MintedSentinelLicense>> {
  const payload = buildSentinelLicensePayload(args);
  if (!payload.ok) return payload;

  const token = await signLicense(payload.value, key);
  return ok({
    token,
    payload: payload.value,
    expiresOn: isoDate(payload.value.expirySec),
  });
}

export interface MintTestLicenseArgs {
  days: number;
  label: string | undefined;
}

/**
 * Parse `scripts/mint-test-license.ts` argv: `[--days <n>] [--label <slug>]`.
 * Unknown flags are errors so a typo cannot silently mint the defaults.
 */
export function parseMintTestLicenseArgs(
  argv: readonly string[],
): Result<MintTestLicenseArgs> {
  let days = DEFAULT_TEST_LICENSE_DAYS;
  let label: string | undefined;

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) return err(`${flag} requires a value`);

    if (flag === "--days") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return err(`--days must be a positive integer, got ${value}`);
      }
      days = parsed;
    } else if (flag === "--label") {
      label = value;
    } else {
      return err(`unknown flag: ${flag}`);
    }
  }

  return ok({ days, label });
}

/** Convert the CLI's day count to the payload's seconds. */
export function daysToSeconds(days: number): number {
  return days * DAY_SEC;
}

function sentinelCustomerId(
  sentinel: string,
  label: string | undefined,
): Result<string> {
  if (label === undefined) return ok(sentinel);
  if (!LABEL_PATTERN.test(label)) {
    return err(
      `label must be lower-case letters, digits and single dashes, got "${label}"`,
    );
  }
  if (label.startsWith(STRIPE_CUSTOMER_PREFIX)) {
    return err(`label must not look like a Stripe customer id: "${label}"`);
  }
  return ok(`${sentinel}-${label}`);
}

function isoDate(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

/** 32-char hex, the same convention `issuer.ts` uses for real licenses. */
function randomKeyId(): string {
  const bytes = new Uint8Array(KEY_ID_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
