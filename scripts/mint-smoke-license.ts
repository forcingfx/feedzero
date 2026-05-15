/**
 * One-off CLI: mint a long-lived license token for use as the
 * SMOKE_LICENSE_TOKEN GitHub Actions secret, which gates the data-
 * roundtrip assertions in tests/smoke/sync-cross-device.test.ts.
 *
 * The token is signed with the same LICENSE_SIGNING_KEY used by
 * production. It uses a sentinel customerId/keyId so it's identifiable
 * in logs but never matches a real Stripe customer. The keyId is not
 * added to the revocation deny-list, so production verify accepts it
 * until expiry (5 years by default).
 *
 * Usage:
 *
 *   # Pull the signing key from Vercel
 *   vercel env pull .env.production --environment=production
 *
 *   # Mint the token (5 years valid, "pro" tier)
 *   set -a; source .env.production; set +a
 *   npx tsx scripts/mint-smoke-license.ts
 *
 *   # Copy the printed token. Add it as a GitHub Actions repo secret
 *   # named SMOKE_LICENSE_TOKEN at:
 *   #   https://github.com/forcingfx/feedzero/settings/secrets/actions
 *
 *   # Delete the local env file (contains the signing key in cleartext)
 *   rm .env.production
 *
 * To rotate the smoke token: re-run this script and update the secret.
 * To revoke a leaked smoke token: add its keyId to the revocation list
 * via your existing license storage tooling; the smoke can no longer
 * authenticate. Generate a fresh one with this script.
 */

import { signLicense } from "../src/core/license/sign";

const SIGNING_KEY = process.env.LICENSE_SIGNING_KEY;
if (!SIGNING_KEY) {
  console.error(
    "[mint-smoke-license] LICENSE_SIGNING_KEY env var is required.\n" +
      "  Run: vercel env pull .env.production --environment=production\n" +
      "  Then: set -a; source .env.production; set +a\n",
  );
  process.exit(1);
}

const FIVE_YEARS_SEC = 5 * 365 * 24 * 3600;

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const nowSec = Math.floor(Date.now() / 1000);

const token = await signLicense(
  {
    tier: "pro",
    // Sentinel customerId — distinct from any real "cus_*" Stripe id so
    // it's grep-able in logs and obviously not a real customer.
    customerId: "smoke-license",
    keyId: randomHex(16),
    issuedAtSec: nowSec,
    expirySec: nowSec + FIVE_YEARS_SEC,
  },
  { secret: SIGNING_KEY },
);

const expiryDate = new Date((nowSec + FIVE_YEARS_SEC) * 1000)
  .toISOString()
  .slice(0, 10);

console.log("");
console.log("=== Smoke license token (copy this to GitHub Actions secret) ===");
console.log("");
console.log(token);
console.log("");
console.log(`Expires: ${expiryDate}`);
console.log(
  "Add as: https://github.com/forcingfx/feedzero/settings/secrets/actions",
);
console.log("Secret name: SMOKE_LICENSE_TOKEN");
console.log("");
