/**
 * Browser-environment preflight for the cryptographic primitives FeedZero
 * relies on.
 *
 * Two failure modes the user can hit:
 *
 *   1. `isSecureContext === false` — page loaded over plain HTTP from a
 *      non-localhost origin (typical self-host setup before the user wires
 *      a TLS reverse proxy). Web Crypto API is unavailable not because
 *      the browser is old, but because browsers gate it behind a secure
 *      context. The fix is operational: HTTPS or `http://localhost`.
 *
 *   2. `crypto.subtle === undefined` — extremely rare in 2026; happens
 *      under iOS Lockdown Mode and in genuinely old browsers.
 *
 * Pre-2026-05 code conflated these two: it only checked (2) and produced
 * a message about iOS Lockdown Mode, which sent self-hosters hitting (1)
 * down a wrong path. See feedback issue #88 for the field report.
 *
 * Pure function — environment is passed in — so we can test both branches
 * without mocking `globalThis`.
 */

export interface SecureContextInput {
  isSecureContext: boolean;
  crypto: Pick<Crypto, "subtle"> | undefined;
  /** Optional — surfaced in the UI when known so the user sees their actual origin. */
  origin?: string;
}

export type SecureContextProblemKind = "insecure-context" | "crypto-missing";

export type SecureContextResult =
  | { ok: true }
  | {
      ok: false;
      kind: SecureContextProblemKind;
      error: string;
      origin?: string;
    };

export const INSECURE_CONTEXT_MESSAGE =
  "FeedZero needs to load over HTTPS or http://localhost. " +
  "Browsers only expose the Web Crypto API (which we use to encrypt your " +
  "data at rest) in a secure context. Put a TLS reverse proxy in front " +
  "of the server, or open the app via http://localhost on the host itself.";

export const CRYPTO_MISSING_MESSAGE =
  "Your browser does not expose the Web Crypto API. This typically means " +
  "iOS Lockdown Mode or a very old browser. Disable Lockdown Mode for this " +
  "site, or use a current desktop browser.";

export function checkSecureContext(
  env: SecureContextInput,
): SecureContextResult {
  if (!env.isSecureContext) {
    return {
      ok: false,
      kind: "insecure-context",
      error: INSECURE_CONTEXT_MESSAGE,
      origin: env.origin,
    };
  }
  if (!env.crypto?.subtle) {
    return {
      ok: false,
      kind: "crypto-missing",
      error: CRYPTO_MISSING_MESSAGE,
    };
  }
  return { ok: true };
}
