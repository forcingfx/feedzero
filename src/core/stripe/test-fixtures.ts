/**
 * Hand-crafted minimal Stripe event fixtures for webhook handler tests.
 *
 * These are NOT real Stripe API responses — they include only the fields
 * the webhook handler actually reads. Keeping them minimal makes the test
 * contract explicit: if the handler starts reading a new field, the fixture
 * must grow, which is a deliberate signal during code review.
 *
 * Each factory returns the event object plus a `signature(secret, ts)`
 * helper that computes a fresh Stripe-Signature header value at test time
 * so tests can simulate stale timestamps and bad signatures.
 */

import { createHmac } from "node:crypto";

export interface StripeFixture {
  event: Record<string, unknown>;
  /**
   * Build a Stripe-Signature header value (`t=<ts>,v1=<sig>`) for the
   * fixture's serialized event body.
   */
  signature: (secret: string, ts: number) => string;
}

function buildSignature(
  event: Record<string, unknown>,
  secret: string,
  ts: number,
): string {
  const body = JSON.stringify(event);
  const signed = `${ts}.${body}`;
  const sig = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${ts},v1=${sig}`;
}

interface SubscriptionCreatedArgs {
  customerId: string;
  subscriptionId: string;
  tier: "personal" | "pro";
}

export function subscriptionCreatedEvent(
  args: SubscriptionCreatedArgs,
): StripeFixture {
  const event = {
    id: `evt_${args.subscriptionId}_created`,
    type: "customer.subscription.created",
    data: {
      object: {
        id: args.subscriptionId,
        customer: args.customerId,
        items: {
          data: [
            {
              price: {
                metadata: { tier: args.tier },
              },
            },
          ],
        },
      },
    },
  };
  return {
    event,
    signature: (secret, ts) => buildSignature(event, secret, ts),
  };
}

interface SubscriptionDeletedArgs {
  customerId: string;
  subscriptionId: string;
}

export function subscriptionDeletedEvent(
  args: SubscriptionDeletedArgs,
): StripeFixture {
  const event = {
    id: `evt_${args.subscriptionId}_deleted`,
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: args.subscriptionId,
        customer: args.customerId,
      },
    },
  };
  return {
    event,
    signature: (secret, ts) => buildSignature(event, secret, ts),
  };
}

interface SubscriptionUpdatedArgs {
  customerId: string;
  subscriptionId: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
}

export function subscriptionUpdatedEvent(
  args: SubscriptionUpdatedArgs,
): StripeFixture {
  const event = {
    id: `evt_${args.subscriptionId}_updated`,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: args.subscriptionId,
        customer: args.customerId,
        status: args.status,
        cancel_at_period_end: args.cancel_at_period_end,
        current_period_end: args.current_period_end,
      },
    },
  };
  return {
    event,
    signature: (secret, ts) => buildSignature(event, secret, ts),
  };
}

interface InvoicePaidArgs {
  customerId: string;
  subscriptionId: string;
  current_period_end: number;
}

export function invoicePaidEvent(args: InvoicePaidArgs): StripeFixture {
  const event = {
    id: `evt_${args.subscriptionId}_invoice_paid`,
    type: "invoice.paid",
    data: {
      object: {
        customer: args.customerId,
        subscription: args.subscriptionId,
        lines: {
          data: [
            {
              period: { end: args.current_period_end },
            },
          ],
        },
      },
    },
  };
  return {
    event,
    signature: (secret, ts) => buildSignature(event, secret, ts),
  };
}

/**
 * Generic fixture for arbitrary event types — used in the "ignored" test.
 */
export function customEvent(type: string): StripeFixture {
  const event = {
    id: `evt_custom_${type}`,
    type,
    data: { object: {} },
  };
  return {
    event,
    signature: (secret, ts) => buildSignature(event, secret, ts),
  };
}
