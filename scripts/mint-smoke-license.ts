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
 */

import { readFileSync, existsSync } from "node:fs";
import { signLicense } from "../src/core/license/sign";

/**
 * Parse a `.env`-style file into key/value pairs. Handles double-quoted
 * values (the format Vercel CLI writes) so values containing shell
 * metacharacters survive without being mangled by `source` / `sed`.
 * Strips a single layer of surrounding `"..."` if present; leaves
 * unquoted values as-is.
 */
function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      value.startsWith('"') &&
      value.endsWith('"')
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Auto-load .env.production if it exists. Avoids brittle shell sourcing.
const ENV_FILE = ".env.production";
if (existsSync(ENV_FILE) && !process.env.LICENSE_SIGNING_KEY) {
  for (const [k, v] of Object.entries(loadEnvFile(ENV_FILE))) {
    if (!(k in process.env)) process.env[k] = v;
  }
}

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
