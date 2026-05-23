/**
 * Single source of truth for Stripe "find customer by email" lookups.
 *
 * Used by:
 *   - `src/core/license/recover-handler.ts` (self-serve recovery flow)
 *   - `scripts/find-license.ts`             (operator CLI escape hatch)
 *
 * Both call sites depend on identical enumeration semantics: "not found" is
 * a control-flow signal, not an error. Diverging behaviour between the two
 * would let an attacker probe paying customers via one endpoint while the
 * other was hardened — keeping the lookup in one place pins the contract.
 *
 * Stripe's `customers.list` defaults to `created` desc, so requesting
 * `limit: 1` gives us the most recently created customer for duplicates.
 * That matches the pre-extraction behaviour of the recover-handler and is
 * the safest default — operators rarely want to act on an archived
 * customer record over the active one.
 */

import { err, ok, type Result } from "../../../packages/core/src/utils/result";

/** Minimal subset of Stripe `customers.list` we depend on. */
export interface CustomersClient {
  list(params: { email: string; limit?: number }): Promise<{
    data: { id: string; email: string | null }[];
  }>;
}

export interface FindCustomerResult {
  customer: { id: string; email: string | null } | null;
}

export async function findCustomerByEmail(
  client: CustomersClient,
  email: string,
): Promise<Result<FindCustomerResult>> {
  try {
    const list = await client.list({ email, limit: 1 });
    return ok({ customer: list.data[0] ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`stripe customer lookup failed: ${message}`);
  }
}
