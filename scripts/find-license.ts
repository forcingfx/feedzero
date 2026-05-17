/**
 * Operator CLI — look up (and optionally reissue) a customer's license.
 *
 * The universal fallback when self-serve recovery at /billing/recover
 * fails: deliverability issues, customer used a different email at
 * checkout, license needs a manual tier change, edge cases. This script
 * reads license records from production storage and (with --reissue)
 * mints a fresh signed token using the production signing key.
 *
 * Usage:
 *
 *   # Pull production env (one-time per session)
 *   vercel env pull .env.production --environment=production
 *
 *   # Look up a customer by email
 *   npx tsx scripts/find-license.ts --email customer@example.com
 *
 *   # Look up by customer id (skips Stripe call)
 *   npx tsx scripts/find-license.ts --customer cus_PqRsTuVwXyZ
 *
 *   # Reissue a fresh token (tier inferred from most recent active record)
 *   npx tsx scripts/find-license.ts --customer cus_PqRsTuVwXyZ --reissue
 *
 *   # When done, delete the local env (contains LICENSE_SIGNING_KEY in cleartext)
 *   rm .env.production
 *
 * Security notes:
 *   - Reissued tokens print to stdout only. Never log to a file. Never
 *     paste into chat. The single legitimate destination is the operator's
 *     reply to the customer's support email.
 *   - The script is read-only by default. --reissue is opt-in and writes
 *     a new LicenseRecord to production storage (auditable in future
 *     lookups). The original active record is left in place.
 *
 * This file is the I/O shell only. The pure logic lives in
 * src/core/license/admin-find-license.ts (testable in isolation).
 */

import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  findLicenseByEmail,
  findLicenseByCustomer,
  reissueLicenseFor,
  type LookupValue,
} from "../src/core/license/admin-find-license";
import type { CustomersClient } from "../src/core/stripe/find-customer-by-email";
import { LicenseIssuerImpl } from "../src/core/license/issuer";
import type { LicenseRecord } from "../src/core/license/storage";
import { err, ok, type Result } from "../src/utils/result";

// The project's `process` global is narrowed to env+argv at the type
// level (see src/core/sync/adapters/env.d.ts) to keep shippable code
// honest about not assuming Node APIs. Scripts opt out via a local
// type declaration. This is the same pattern other Node-only scripts
// (e.g. mint-smoke-license.ts) implicitly rely on by not being
// included in tsc's type-check graph.
declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  stderr: { write(s: string): void };
  stdout: { write(s: string): void };
  exit(code?: number): never;
};

interface CliArgs {
  email?: string;
  customer?: string;
  reissue: boolean;
}

function parseCliArgs(argv: string[]): Result<CliArgs> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        email: { type: "string" },
        customer: { type: "string" },
        reissue: { type: "boolean", default: false },
      },
      strict: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`bad arguments: ${message}`);
  }

  const email = parsed.values.email as string | undefined;
  const customer = parsed.values.customer as string | undefined;
  const reissue = parsed.values.reissue === true;

  if (!email && !customer) {
    return err("missing --email or --customer");
  }
  if (email && customer) {
    return err("--email and --customer are mutually exclusive");
  }
  return ok({ email, customer, reissue });
}

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

function formatRecord(r: LicenseRecord): string {
  const issued = new Date(r.issuedAtSec * 1000).toISOString().slice(0, 10);
  const expires = new Date(r.expirySec * 1000).toISOString().slice(0, 10);
  return (
    `  keyId=${r.keyId.slice(0, 12)}... ` +
    `tier=${r.tier} status=${r.status} ` +
    `issued=${issued} expires=${expires}`
  );
}

function formatLookup(value: LookupValue): string {
  const lines: string[] = [];
  if (value.customer) {
    lines.push(
      `Stripe customer: ${value.customer.id}` +
        (value.customer.email ? ` (${value.customer.email})` : ""),
    );
  }
  if (value.records.length === 0) {
    lines.push(
      "License records: (none) — customer has no licenses in storage.",
    );
  } else {
    lines.push("License records (newest first):");
    for (const r of value.records) lines.push(formatRecord(r));
  }
  return lines.join("\n");
}

async function main(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    process.stderr.write(
      "Usage: find-license.ts (--email <addr> | --customer <cus_xxx>) [--reissue]\n",
    );
    return 2;
  }

  if (existsSync(".env.production")) {
    const env = loadEnvFile(".env.production");
    for (const [k, v] of Object.entries(env)) {
      if (!process.env[k]) process.env[k] = v;
    }
  }

  const required = [
    "LICENSE_SIGNING_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "STRIPE_SECRET_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    process.stderr.write(
      `missing env vars: ${missing.join(", ")}\n` +
        `run \`vercel env pull .env.production --environment=production\` first.\n`,
    );
    return 1;
  }

  const [{ createUpstashLicenseStorage }, Stripe] = await Promise.all([
    import("../src/core/license/storage-upstash"),
    import("stripe").then((m) => m.default),
  ]);

  let storage;
  try {
    storage = await createUpstashLicenseStorage(process.env);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`storage init failed: ${message}\n`);
    return 1;
  }

  const stripe = new (Stripe as new (k: string) => unknown)(
    process.env.STRIPE_SECRET_KEY as string,
  ) as { customers: CustomersClient };

  const lookup = parsed.value.email
    ? await findLicenseByEmail({
        customers: stripe.customers,
        storage,
        email: parsed.value.email,
      })
    : await findLicenseByCustomer({
        customers: stripe.customers,
        storage,
        customerId: parsed.value.customer!,
      });

  if (!lookup.ok) {
    process.stderr.write(`lookup failed: ${lookup.error}\n`);
    return 1;
  }

  process.stdout.write(`${formatLookup(lookup.value)}\n`);

  if (!parsed.value.reissue) return 0;

  const customerId =
    parsed.value.customer ?? lookup.value.customer?.id;
  if (!customerId) {
    process.stderr.write(
      "cannot reissue: no customer id resolved (Stripe lookup returned no match).\n",
    );
    return 1;
  }

  const issuer = new LicenseIssuerImpl({
    signingKey: { secret: process.env.LICENSE_SIGNING_KEY as string },
    storage,
  });
  const reissue = await reissueLicenseFor({ issuer, storage, customerId });
  if (!reissue.ok) {
    process.stderr.write(`reissue failed: ${reissue.error}\n`);
    return 1;
  }
  process.stdout.write(
    `\nReissuing license at tier=${reissue.value.record.tier}…\n` +
      `New token:\n  ${reissue.value.token}\n` +
      `keyId=${reissue.value.record.keyId} ` +
      `expires=${new Date(reissue.value.record.expirySec * 1000)
        .toISOString()
        .slice(0, 10)}\n` +
      `Paste this token into your reply to the customer's support email. ` +
      `Do not commit or chat-paste.\n`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`uncaught: ${e instanceof Error ? e.stack : e}\n`);
    process.exit(1);
  },
);
