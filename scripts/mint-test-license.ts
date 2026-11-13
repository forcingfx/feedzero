/**
 * Operator CLI — mint a Supporter test license outside Stripe.
 *
 * Use it to exercise gated features (Signal, Signal Briefings, smart
 * filters, rules, unlimited feeds) on a build where the paid tier is
 * live, without running a checkout. The token verifies against whatever
 * deployment shares the signing key you mint with:
 *
 *   production (my.feedzero.app)
 *     vercel env pull .env.production --environment=production
 *     npx tsx scripts/mint-test-license.ts --label signal-qa
 *     rm .env.production          # contains LICENSE_SIGNING_KEY in cleartext
 *
 *   local dev server
 *     export LICENSE_SIGNING_KEY=any-string-of-32-or-more-characters
 *     npx tsx scripts/mint-test-license.ts
 *     VITE_PAID_TIER_VISIBLE=1 npm run dev   # same shell, so verify shares the key
 *
 * Then in the app: Settings → Subscription → "Activate existing license",
 * paste the token. The tier badge reads Supporter and Signal unlocks.
 *
 * Flags:
 *   --days <n>      lifetime in days (default 30)
 *   --label <slug>  kebab-case suffix on the sentinel customer id, so
 *                   several test tokens stay distinguishable in logs
 *
 * The customer id is the sentinel "test-license[-label]", never a Stripe
 * cus_* id, and nothing is written to license storage. To revoke a leaked
 * token, add its keyId (printed below) to the revocation list.
 *
 * This file is the I/O shell only. The logic lives in
 * src/core/license/mint-sentinel-license.ts (tested in isolation).
 */

import {
  daysToSeconds,
  mintSentinelLicense,
  parseMintTestLicenseArgs,
  TEST_LICENSE_SENTINEL,
} from "../src/core/license/mint-sentinel-license";
import { applyEnvFileIfPresent } from "./lib/load-env-file";

const USAGE =
  "Usage: mint-test-license.ts [--days <n>] [--label <kebab-case-slug>]\n";

async function main(): Promise<number> {
  const parsed = parseMintTestLicenseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n${USAGE}`);
    return 2;
  }

  applyEnvFileIfPresent(".env.production", process.env);
  const secret = process.env.LICENSE_SIGNING_KEY;
  if (!secret) {
    process.stderr.write(
      "LICENSE_SIGNING_KEY is not set.\n" +
        "  production: vercel env pull .env.production --environment=production\n" +
        "  local dev:  export LICENSE_SIGNING_KEY=<the value your dev server uses>\n",
    );
    return 1;
  }

  const minted = await mintSentinelLicense(
    {
      sentinel: TEST_LICENSE_SENTINEL,
      label: parsed.value.label,
      tier: "personal",
      ttlSec: daysToSeconds(parsed.value.days),
      nowSec: Math.floor(Date.now() / 1000),
    },
    { secret },
  );
  if (!minted.ok) {
    process.stderr.write(`${minted.error}\n${USAGE}`);
    return 2;
  }

  const { token, payload, expiresOn } = minted.value;
  process.stdout.write(
    [
      "",
      "=== Supporter test license (paste into Settings → Subscription → Activate existing license) ===",
      "",
      token,
      "",
      `tier=${payload.tier} customer=${payload.customerId} keyId=${payload.keyId}`,
      `expires=${expiresOn}`,
      "",
      "Verifies only against a deployment using the same LICENSE_SIGNING_KEY.",
      "",
    ].join("\n"),
  );
  return 0;
}

process.exit(await main());
