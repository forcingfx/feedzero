import { describe, it, expect } from "vitest";
import { findCustomerByEmail } from "@/core/stripe/find-customer-by-email.ts";

// PR K — extracted helper for customer-by-email lookup.
//
// Lives in src/core/stripe/ so both `recover-handler.ts` and the operator
// CLI (`scripts/find-license.ts`) agree on enumeration semantics. The
// helper is intentionally minimal: it does ONE Stripe call, returns a
// Result so consumers can distinguish "no match" (control flow) from
// "lookup failed" (storage/network error).

interface ListedCustomer {
  id: string;
  email: string | null;
  created?: number;
}

function client(
  impl: (params: { email: string; limit?: number }) => Promise<{
    data: ListedCustomer[];
  }>,
) {
  return { list: impl };
}

describe("findCustomerByEmail", () => {
  it("returns the single matching customer when Stripe finds one", async () => {
    const result = await findCustomerByEmail(
      client(async () => ({
        data: [{ id: "cus_111", email: "user@example.com" }],
      })),
      "user@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer).toEqual({
      id: "cus_111",
      email: "user@example.com",
    });
  });

  it("returns customer: null when no match exists (NOT an error)", async () => {
    // "Not found" must be a control-flow signal, not an error — the
    // recover-handler depends on this distinction for its enumeration
    // protection (same 200 shape regardless of whether the email matched).
    const result = await findCustomerByEmail(
      client(async () => ({ data: [] })),
      "unknown@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer).toBeNull();
  });

  it("preserves the most-recently-created-customer behaviour when there are duplicates", async () => {
    // Stripe `customers.list` defaults to `created` desc; the existing
    // recover-handler relies on data[0] being the newest. This test pins
    // that assumption so a future helper refactor can't silently flip
    // ordering (e.g. sorting alphabetically) and re-issue against an
    // archived customer record.
    const result = await findCustomerByEmail(
      client(async () => ({
        data: [
          { id: "cus_newest", email: "user@example.com", created: 1000 },
          { id: "cus_older", email: "user@example.com", created: 500 },
        ],
      })),
      "user@example.com",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer?.id).toBe("cus_newest");
  });

  it("requests limit: 1 from Stripe so we never page through dupes", async () => {
    const observed: { value: { email: string; limit?: number } | null } = {
      value: null,
    };
    await findCustomerByEmail(
      client(async (params) => {
        observed.value = params;
        return { data: [{ id: "cus_1", email: "x@y.com" }] };
      }),
      "x@y.com",
    );
    expect(observed.value?.limit).toBe(1);
    expect(observed.value?.email).toBe("x@y.com");
  });

  it("returns err when the Stripe call throws", async () => {
    const result = await findCustomerByEmail(
      client(async () => {
        throw new Error("stripe down");
      }),
      "user@example.com",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/stripe down|customer lookup/i);
  });
});
