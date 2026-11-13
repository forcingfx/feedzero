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
 *   # Mint the token (script auto-loads .env.production if present)
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
 *
 * For a short-lived Supporter token to test gated features by hand, use
 * scripts/mint-test-license.ts instead. Both are shells over
 * src/core/license/mint-sentinel-license.ts.
 */

import {
  mintSentinelLicense,
  SMOKE_LICENSE_SENTINEL,
} from "../src/core/license/mint-sentinel-license";
import { applyEnvFileIfPresent } from "./lib/load-env-file";

applyEnvFileIfPresent(".env.production", process.env);

const SIGNING_KEY = process.env.LICENSE_SIGNING_KEY;
if (!SIGNING_KEY) {
  console.error(
    "[mint-smoke-license] LICENSE_SIGNING_KEY env var is required.\n" +
      "  Run: vercel env pull .env.production --environment=production\n" +
      `  Then: npx tsx scripts/mint-smoke-license.ts\n` +
      "  (The script auto-loads .env.production if present in cwd.)\n",
  );
  process.exit(1);
}

const FIVE_YEARS_SEC = 5 * 365 * 24 * 3600;

const minted = await mintSentinelLicense(
  {
    sentinel: SMOKE_LICENSE_SENTINEL,
    // Pre-repricing wire tier; `normalizeTier` maps it onto the paid tier.
    // Kept so a rotated smoke token looks exactly like the one CI holds.
    tier: "pro",
    ttlSec: FIVE_YEARS_SEC,
    nowSec: Math.floor(Date.now() / 1000),
  },
  { secret: SIGNING_KEY },
);
if (!minted.ok) {
  console.error(`[mint-smoke-license] ${minted.error}`);
  process.exit(1);
}

console.log("");
console.log("=== Smoke license token (copy this to GitHub Actions secret) ===");
console.log("");
console.log(minted.value.token);
console.log("");
console.log(`Expires: ${minted.value.expiresOn}`);
console.log(
  "Add as: https://github.com/forcingfx/feedzero/settings/secrets/actions",
);
console.log("Secret name: SMOKE_LICENSE_TOKEN");
console.log("");
