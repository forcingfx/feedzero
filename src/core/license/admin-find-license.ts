/**
 * Library surface for the operator CLI at `scripts/find-license.ts`.
 *
 * Pure framework-agnostic functions — no Node/browser APIs. The CLI
 * wraps these with env loading, argv parsing, stdout/stderr printing,
 * and exit codes. Splitting the library out lets tests cover the
 * behaviour without dragging Node's `process` typing into the test
 * graph (the project's `process` global is narrowed to env+argv on
 * purpose; see src/core/sync/adapters/env.d.ts).
 *
 * Operator workflow these functions support:
 *
 *   1. Customer emails support@feedzero.app: "I can't recover my license."
 *   2. Operator runs `scripts/find-license.ts --email ...` to look up.
 *   3. If an active record exists with a valid token shape, the operator
 *      pastes that token. If not (or as a precaution), they re-run with
 *      --reissue to mint a fresh token.
 *   4. Operator replies to the support email with the token.
 *
 * The functions here are the LOOKUP and REISSUE primitives. The CLI is
 * just I/O around them.
 */

import { findCustomerByEmail } from "../stripe/find-customer-by-email";
import type { CustomersClient } from "../stripe/find-customer-by-email";
import { LicenseIssuerImpl } from "./issuer";
import type { LicenseRecord, LicenseStorage } from "./storage";
import { err, ok, type Result } from "../../../packages/core/src/utils/result";

export interface LookupValue {
  customer: { id: string; email: string | null } | null;
  records: LicenseRecord[];
}

/**
 * Look up a customer + their license records by email. The customer
 * lookup hits Stripe; the record lookup hits FeedZero's license
 * storage. Records are sorted newest-first so the operator's eyes find
 * the currently-active license at the top.
 */
export async function findLicenseByEmail(args: {
  customers: CustomersClient;
  storage: LicenseStorage;
  email: string;
}): Promise<Result<LookupValue>> {
  const found = await findCustomerByEmail(args.customers, args.email);
  if (!found.ok) return found;
  if (!found.value.customer) {
    return ok({ customer: null, records: [] });
  }
  const records = await args.storage.listByCustomer(found.value.customer.id);
  if (!records.ok) return records;
  return ok({
    customer: found.value.customer,
    records: sortRecordsNewestFirst(records.value),
  });
}

/**
 * Look up license records directly by customer id, skipping the Stripe
 * customer lookup. Used when the operator already has the cus_xxx id
 * from the Stripe Dashboard.
 */
export async function findLicenseByCustomer(args: {
  customers: CustomersClient;
  storage: LicenseStorage;
  customerId: string;
}): Promise<Result<LookupValue>> {
  const records = await args.storage.listByCustomer(args.customerId);
  if (!records.ok) return records;
  return ok({
    customer: null,
    records: sortRecordsNewestFirst(records.value),
  });
}

export interface ReissueValue {
  token: string;
  record: LicenseRecord;
}

/**
 * Mint a fresh license token for a customer. Tier and subscription are
 * inferred from the most recent active record — we deliberately don't
 * default to a tier when the customer has no history. Operators dealing
 * with truly novel cases (e.g. a manual comp) should resolve the
 * customer state via Stripe first, not rely on a defaulted CLI to
 * invent one.
 *
 * The reissued token verifies against the production signing key. The
 * existing active record is preserved — reissue is additive, not
 * destructive.
 */
export async function reissueLicenseFor(args: {
  issuer: LicenseIssuerImpl;
  storage: LicenseStorage;
  customerId: string;
}): Promise<Result<ReissueValue>> {
  const records = await args.storage.listByCustomer(args.customerId);
  if (!records.ok) return records;

  const mostRecentActive = sortRecordsNewestFirst(records.value).find(
    (r) => r.status === "active",
  );
  if (!mostRecentActive) {
    return err(
      `cannot infer tier — customer ${args.customerId} has no active records to copy from`,
    );
  }
  if (mostRecentActive.tier === "free") {
    return err(
      `most recent active record is free tier — refusing to reissue free licenses`,
    );
  }

  const result = await args.issuer.issueWithToken({
    customerId: args.customerId,
    tier: mostRecentActive.tier,
    subscriptionId: mostRecentActive.subscriptionId ?? "",
  });
  if (!result.ok) return result;
  return ok({ token: result.value.token, record: result.value.record });
}

function sortRecordsNewestFirst(records: LicenseRecord[]): LicenseRecord[] {
  return [...records].sort((a, b) => b.issuedAtSec - a.issuedAtSec);
}
