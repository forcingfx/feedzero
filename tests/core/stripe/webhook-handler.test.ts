import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleStripeWebhook,
  type LicenseIssuer,
  type WebhookConfig,
} from "@/core/stripe/webhook-handler";
import {
  subscriptionCreatedEvent,
  subscriptionDeletedEvent,
  subscriptionUpdatedEvent,
  invoicePaidEvent,
  customEvent,
  type StripeFixture,
} from "@/core/stripe/test-fixtures";
import { ok, err } from "@/utils/result";

const ENDPOINT = "http://localhost/api/stripe/webhook";
const SECRET = "whsec_test_secret_value";
const CUSTOMER_ID = "cus_test_123";
const SUBSCRIPTION_ID = "sub_test_456";

function makeIssuer(): LicenseIssuer {
  return {
    issue: vi.fn(async () => ok(undefined)),
    revoke: vi.fn(async () => ok(undefined)),
    recordRenewal: vi.fn(async () => ok(undefined)),
  };
}

function makeConfig(issuer: LicenseIssuer): WebhookConfig {
  return { signingSecret: SECRET, issuer };
}

function postFixture(fixture: StripeFixture, ts: number): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": fixture.signature(SECRET, ts),
    },
    body: JSON.stringify(fixture.event),
  });
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

describe("handleStripeWebhook", () => {
  let issuer: LicenseIssuer;

  beforeEach(() => {
    issuer = makeIssuer();
  });

  it("rejects non-POST methods with 405", async () => {
    const res = await handleStripeWebhook(
      new Request(ENDPOINT, { method: "GET" }),
      makeConfig(issuer),
    );
    expect(res.status).toBe(405);
  });

  it("returns 400 when Stripe-Signature header is missing", async () => {
    const res = await handleStripeWebhook(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "x" }),
      }),
      makeConfig(issuer),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when Stripe-Signature header is malformed", async () => {
    const res = await handleStripeWebhook(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "garbage-not-stripe-format",
        },
        body: JSON.stringify({ type: "x" }),
      }),
      makeConfig(issuer),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when timestamp is valid but signature is invalid", async () => {
    const ts = nowSec();
    const fixture = subscriptionCreatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
    });
    const body = JSON.stringify(fixture.event);
    const badSig = "0".repeat(64);
    const res = await handleStripeWebhook(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": `t=${ts},v1=${badSig}`,
        },
        body,
      }),
      makeConfig(issuer),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when timestamp is older than tolerance", async () => {
    const staleTs = nowSec() - 600; // 10 min, exceeds default 300s
    const fixture = subscriptionCreatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, staleTs),
      makeConfig(issuer),
    );
    expect(res.status).toBe(400);
  });

  it("dispatches customer.subscription.created to issuer.issue", async () => {
    const fixture = subscriptionCreatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "pro",
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.issue).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "pro",
    });
  });

  it("dispatches customer.subscription.deleted to issuer.revoke", async () => {
    const fixture = subscriptionDeletedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.revoke).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      reason: "subscription_deleted",
    });
  });

  it("dispatches customer.subscription.updated normal renewal to issuer.recordRenewal", async () => {
    const expirySec = nowSec() + 30 * 24 * 60 * 60;
    const fixture = subscriptionUpdatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      status: "active",
      cancel_at_period_end: false,
      current_period_end: expirySec,
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.recordRenewal).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      expirySec,
    });
  });

  it("dispatches customer.subscription.updated with status canceled to issuer.revoke", async () => {
    const fixture = subscriptionUpdatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      status: "canceled",
      cancel_at_period_end: true,
      current_period_end: nowSec() + 1000,
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.revoke).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      reason: "subscription_deleted",
    });
  });

  it("dispatches invoice.paid to issuer.recordRenewal", async () => {
    const expirySec = nowSec() + 30 * 24 * 60 * 60;
    const fixture = invoicePaidEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      current_period_end: expirySec,
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.recordRenewal).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      expirySec,
    });
  });

  it("returns 200 with ignored:<type> for unknown event types and does not call any issuer method", async () => {
    const fixture = customEvent("charge.refunded");
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, ignored: "charge.refunded" });
    expect(issuer.issue).not.toHaveBeenCalled();
    expect(issuer.revoke).not.toHaveBeenCalled();
    expect(issuer.recordRenewal).not.toHaveBeenCalled();
  });

  it("returns 500 when issuer returns Result.err so Stripe retries", async () => {
    const failingIssuer: LicenseIssuer = {
      ...makeIssuer(),
      issue: vi.fn(async () => err("kv unavailable")),
    };
    const fixture = subscriptionCreatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(failingIssuer),
    );
    expect(res.status).toBe(500);
  });
});
