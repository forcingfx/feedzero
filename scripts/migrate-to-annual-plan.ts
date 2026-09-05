/**
 * Operator CLI — move legacy monthly subscribers onto the single $9/year
 * price at their next renewal (ADR 029, decision item 7).
 *
 * For each eligible subscription it creates a Stripe Subscription Schedule
 * from the subscription, then appends an open-ended annual phase after the
 * current period. Nobody is charged, credited or prorated at any point; the
 * customer's next invoice is simply the annual one.
 *
 * Usage:
 *
 *   # Pull production env (one-time per session)
 *   vercel env pull .env.production --environment=production
 *
 *   # Dry run — the default. Prints exactly what would happen, changes nothing.
 *   npx tsx scripts/migrate-to-annual-plan.ts
 *
 *   # Rehearse against one subscription before touching the book
 *   npx tsx scripts/migrate-to-annual-plan.ts --subscription sub_1P... --apply
 *
 *   # Migrate everyone
 *   npx tsx scripts/migrate-to-annual-plan.ts --apply
 *
 *   # When done, delete the local env (contains live Stripe keys in cleartext)
 *   rm .env.production
 *
 * Safety properties, in the order they matter:
 *
 *   - **Dry run by default.** `--apply` is the only thing that writes. A
 *     mistyped invocation costs a listing, not a billing incident.
 *   - **Idempotent.** A subscription that already carries a schedule, or is
 *     already on the annual price, is skipped with a reason. Re-running after
 *     a partial failure resumes rather than double-applying.
 *   - **Per-subscription failures do not stop the run.** One customer whose
 *     schedule cannot be created should not strand the other 200 on the old
 *     price. Failures are collected and printed as a summary, and the exit
 *     code is non-zero so CI or an operator notices.
 *   - **Nothing customer-identifying is printed.** Subscription ids only — no
 *     emails, no names, no card details. Same anonymity floor as production
 *     logs.
 *
 * This file is the I/O shell only. The decisions live in
 * `src/core/stripe/plan-migration.ts` (tested without a Stripe account).
 */

import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";

import {
  buildAnnualScheduleUpdate,
  planSubscriptionMigration,
  type MigrationPlan,
  type ScheduleSummary,
  type SubscriptionSummary,
} from "../src/core/stripe/plan-migration";
import { err, ok, type Result } from "../src/utils/result";

// See the same declaration in find-license.ts: the project's `process` global
// is narrowed at the type level to keep shippable code honest about not
// assuming Node APIs. Node-only scripts opt back in locally.
declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  stderr: { write(s: string): void };
  stdout: { write(s: string): void };
  exit(code?: number): never;
};

interface CliArgs {
  apply: boolean;
  subscription?: string;
  limit?: number;
}

function parseCliArgs(argv: string[]): Result<CliArgs> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        apply: { type: "boolean", default: false },
        subscription: { type: "string" },
        limit: { type: "string" },
      },
      strict: true,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`bad arguments: ${message}`);
  }

  const rawLimit = parsed.values.limit as string | undefined;
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit <= 0) {
      return err(`--limit must be a positive integer, got "${rawLimit}"`);
    }
  }

  return ok({
    apply: parsed.values.apply === true,
    subscription: parsed.values.subscription as string | undefined,
    limit,
  });
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
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** The slice of the Stripe SDK this script drives. */
interface StripeClient {
  subscriptions: {
    list(params: {
      status?: string;
      limit?: number;
    }): AsyncIterable<SubscriptionSummary> & {
      autoPagingToArray(opts: { limit: number }): Promise<SubscriptionSummary[]>;
    };
    retrieve(id: string): Promise<SubscriptionSummary>;
  };
  subscriptionSchedules: {
    create(params: { from_subscription: string }): Promise<
      ScheduleSummary & { id: string }
    >;
    update(id: string, params: unknown): Promise<{ id: string }>;
  };
}

/**
 * Apply one plan. Returns the schedule id on success.
 *
 * The two requests are Stripe's documented shape for "reprice at period end":
 * create the schedule from the subscription so phase 0 mirrors the live
 * billing period exactly, then re-state phase 0 and append the annual phase.
 * Doing it in one `create` call with hand-built phases would mean guessing
 * the current period boundaries, which is how a customer gets billed early.
 */
async function migrateOne(
  stripe: StripeClient,
  subscriptionId: string,
  annualPriceId: string,
): Promise<Result<{ scheduleId: string }>> {
  try {
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    await stripe.subscriptionSchedules.update(
      schedule.id,
      buildAnnualScheduleUpdate(schedule, annualPriceId),
    );
    return ok({ scheduleId: schedule.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message);
  }
}

async function collectSubscriptions(
  stripe: StripeClient,
  args: CliArgs,
): Promise<SubscriptionSummary[]> {
  if (args.subscription) {
    return [await stripe.subscriptions.retrieve(args.subscription)];
  }
  // `status: "all"` so the plan function — not the query — decides what is
  // eligible. One place makes that call, and it is the tested one.
  return stripe.subscriptions
    .list({ status: "all", limit: 100 })
    .autoPagingToArray({ limit: args.limit ?? 10_000 });
}

function describeSkip(plan: Extract<MigrationPlan, { action: "skip" }>): string {
  return `  skip  ${plan.subscriptionId}  (${plan.reason})`;
}

async function main(): Promise<number> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }
  const args = parsed.value;

  if (existsSync(".env.production")) {
    Object.assign(process.env, loadEnvFile(".env.production"));
  }

  const annualPriceId = process.env.VITE_PRICE_PERSONAL_YEARLY;
  if (!process.env.STRIPE_SECRET_KEY || !annualPriceId) {
    process.stderr.write(
      "missing env vars: STRIPE_SECRET_KEY, VITE_PRICE_PERSONAL_YEARLY\n" +
        "run `vercel env pull .env.production --environment=production` first.\n",
    );
    return 1;
  }

  const Stripe = await import("stripe").then((m) => m.default);
  const stripe = new (Stripe as new (k: string) => unknown)(
    process.env.STRIPE_SECRET_KEY,
  ) as StripeClient;

  let subscriptions: SubscriptionSummary[];
  try {
    subscriptions = await collectSubscriptions(stripe, args);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.stderr.write(`listing subscriptions failed: ${message}\n`);
    return 1;
  }

  const plans = subscriptions.map((s) =>
    planSubscriptionMigration(s, annualPriceId),
  );
  const migrations = plans.filter((p) => p.action === "migrate");
  const skips = plans.filter((p) => p.action === "skip");

  process.stdout.write(
    `${subscriptions.length} subscription(s) examined against ${annualPriceId}\n` +
      `${migrations.length} to migrate, ${skips.length} skipped\n\n`,
  );
  for (const skip of skips) {
    process.stdout.write(`${describeSkip(skip)}\n`);
  }

  if (!args.apply) {
    for (const plan of migrations) {
      process.stdout.write(`  would migrate  ${plan.subscriptionId}\n`);
    }
    process.stdout.write(
      `\nDry run — nothing changed. Re-run with --apply to execute.\n`,
    );
    return 0;
  }

  const failures: { subscriptionId: string; error: string }[] = [];
  for (const plan of migrations) {
    const result = await migrateOne(stripe, plan.subscriptionId, annualPriceId);
    if (result.ok) {
      process.stdout.write(
        `  migrated  ${plan.subscriptionId} -> ${result.value.scheduleId}\n`,
      );
    } else {
      failures.push({ subscriptionId: plan.subscriptionId, error: result.error });
      process.stderr.write(`  FAILED  ${plan.subscriptionId}: ${result.error}\n`);
    }
  }

  const succeeded = migrations.length - failures.length;
  process.stdout.write(
    `\n${succeeded} migrated, ${failures.length} failed, ${skips.length} skipped.\n`,
  );
  if (failures.length > 0) {
    process.stdout.write(
      `Re-run the same command to retry the failures — migrated ` +
        `subscriptions are skipped as "already-scheduled".\n`,
    );
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`uncaught: ${e instanceof Error ? e.stack : e}\n`);
    process.exit(1);
  },
);
