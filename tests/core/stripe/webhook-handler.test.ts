import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleStripeWebhook,
  type LicenseIssuer,
  type WebhookConfig,
} from "@/core/stripe/webhook-handler";
import {
  subscriptionCreatedEvent,
  subscriptionCreatedEventDahlia,
  subscriptionDeletedEvent,
  subscriptionUpdatedEvent,
  subscriptionUpdatedEventDahlia,
  invoicePaidEvent,
  invoicePaidEventDahlia,
  customEvent,
  type StripeFixture,
} from "@/core/stripe/test-fixtures";
import { ok, err } from "@feedzero/core/utils/result";
import { MemorySeenEventStore } from "@/core/stripe/seen-event-store";

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

function makeConfig(
  issuer: LicenseIssuer,
  overrides: Partial<WebhookConfig> = {},
): WebhookConfig {
  return { signingSecret: SECRET, issuer, ...overrides };
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

  // Trialing subscriptions arrive with `current_period_end` already set to the
  // trial-end date. We MUST pass that through as expirySec — otherwise the
  // issuer falls back to its 31-day default, which is fine for a 30-day trial
  // (off by ~1 day) but wrong for any other trial length and brittle if the
  // trial period changes. Pin the license to the subscription's own clock.
  it("passes current_period_end (top-level) to issuer.issue for trialing subscription.created", async () => {
    const trialEndSec = nowSec() + 30 * 24 * 60 * 60;
    const fixture = subscriptionCreatedEvent({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
      current_period_end: trialEndSec,
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.issue).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
      expirySec: trialEndSec,
    });
  });

  it("reads current_period_end from items.data[0] when top-level is missing (dahlia subscription.created)", async () => {
    const trialEndSec = nowSec() + 30 * 24 * 60 * 60;
    const fixture = subscriptionCreatedEventDahlia({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
      current_period_end: trialEndSec,
    });
    const res = await handleStripeWebhook(
      postFixture(fixture, nowSec()),
      makeConfig(issuer),
    );
    expect(res.status).toBe(200);
    expect(issuer.issue).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      tier: "personal",
      expirySec: trialEndSec,
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

  describe("API version drift — Stripe 2026-04-22 dahlia payload shapes", () => {
    it("reads current_period_end from items.data[0] when top-level is missing (dahlia subscription.updated)", async () => {
      const expirySec = nowSec() + 30 * 24 * 60 * 60;
      const fixture = subscriptionUpdatedEventDahlia({
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

    it("still reads top-level current_period_end (legacy subscription.updated, regression check)", async () => {
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

    it("reads subscription from parent.subscription_details (dahlia invoice.paid)", async () => {
      const expirySec = nowSec() + 30 * 24 * 60 * 60;
      const fixture = invoicePaidEventDahlia({
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

    it("still reads top-level subscription on invoice.paid (legacy regression check)", async () => {
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
  });

  describe("acceptedWithIssue — silent 200 paths are surfaced via logError", () => {
    it("logs a structured AcceptedWithIssue line when extractTier returns null (Missing tier metadata on price)", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        // Build a subscription.created fixture with no tier on the price
        // metadata — this is the exact failure mode that bit production
        // on 2026-05-15. The handler returns 200 (Stripe stops retrying)
        // but should also emit a structured log so the operator sees it.
        const event = {
          id: "evt_no_tier_meta",
          type: "customer.subscription.created",
          data: {
            object: {
              id: SUBSCRIPTION_ID,
              customer: CUSTOMER_ID,
              items: { data: [{ price: { metadata: {} } }] },
            },
          },
        };
        const sigTs = nowSec();
        const body = JSON.stringify(event);
        const { createHmac } = await import("node:crypto");
        const sig = createHmac("sha256", SECRET)
          .update(`${sigTs}.${body}`)
          .digest("hex");
        const req = new Request(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": `t=${sigTs},v1=${sig}`,
          },
          body,
        });
        const res = await handleStripeWebhook(req, makeConfig(issuer));
        expect(res.status).toBe(200);
        const respBody = await res.json();
        expect(respBody).toEqual({
          ok: true,
          issue: "Missing tier metadata on price",
        });

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.route).toBe("/api/stripe/webhook");
        expect(logged.status).toBe(200);
        expect(logged.errClass).toBe("AcceptedWithIssue");
        expect(logged.errMsg).toBe("Missing tier metadata on price");
        expect(logged.traceId).toMatch(/^req_[0-9a-f]+$/);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT log on the plain {ok:true} success path (no false positives)", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const fixture = subscriptionCreatedEvent({
          customerId: CUSTOMER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          tier: "personal",
        });
        await handleStripeWebhook(
          postFixture(fixture, nowSec()),
          makeConfig(issuer),
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT log on the {ok:true, ignored: <type>} unknown-event-type path", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const fixture = customEvent("charge.refunded");
        await handleStripeWebhook(
          postFixture(fixture, nowSec()),
          makeConfig(issuer),
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
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

  describe("KILL_SIGNUPS gating", () => {
    it("returns 503 and skips issuer when killSignups returns true", async () => {
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });
      const res = await handleStripeWebhook(
        postFixture(fixture, nowSec()),
        makeConfig(issuer, { killSignups: () => true }),
      );
      // 503 makes Stripe back off + retry — the event is preserved for replay
      // once the operator clears the flag.
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/signups disabled/i);
      expect(issuer.issue).not.toHaveBeenCalled();
    });

    it("verifies the signature BEFORE consulting killSignups (auth not bypassable)", async () => {
      // An attacker who learns about the kill switch must not be able to
      // probe webhook behavior with unsigned requests. Invalid signature
      // takes precedence over kill switch.
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });
      const req = new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=deadbeef",
        },
        body: JSON.stringify(fixture.event),
      });
      const res = await handleStripeWebhook(
        req,
        makeConfig(issuer, { killSignups: () => true }),
      );
      expect(res.status).toBe(400);
    });

    it("processes normally when killSignups returns false", async () => {
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "pro",
      });
      const res = await handleStripeWebhook(
        postFixture(fixture, nowSec()),
        makeConfig(issuer, { killSignups: () => false }),
      );
      expect(res.status).toBe(200);
      expect(issuer.issue).toHaveBeenCalled();
    });
  });

  describe("event idempotency", () => {
    it("dispatches first delivery of an event to the issuer", async () => {
      const eventStore = new MemorySeenEventStore();
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });
      const res = await handleStripeWebhook(
        postFixture(fixture, nowSec()),
        makeConfig(issuer, { eventStore }),
      );
      expect(res.status).toBe(200);
      expect(issuer.issue).toHaveBeenCalledTimes(1);
    });

    it("returns 200 alreadyProcessed on duplicate delivery and does NOT re-dispatch", async () => {
      // Simulates Stripe's automatic retry after a missed 2xx response.
      // The issuer must be called exactly once across both deliveries.
      const eventStore = new MemorySeenEventStore();
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });

      const ts = nowSec();
      const first = await handleStripeWebhook(
        postFixture(fixture, ts),
        makeConfig(issuer, { eventStore }),
      );
      expect(first.status).toBe(200);

      const second = await handleStripeWebhook(
        postFixture(fixture, ts),
        makeConfig(issuer, { eventStore }),
      );
      expect(second.status).toBe(200);
      const body = await second.json();
      expect(body).toMatchObject({ ok: true, alreadyProcessed: true });

      expect(issuer.issue).toHaveBeenCalledTimes(1);
    });

    it("returns 500 when eventStore returns Result.err so Stripe retries", async () => {
      const failingStore = {
        markSeenIfNew: async () => err("upstash unreachable"),
      };
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });
      const res = await handleStripeWebhook(
        postFixture(fixture, nowSec()),
        makeConfig(issuer, { eventStore: failingStore }),
      );
      expect(res.status).toBe(500);
      expect(issuer.issue).not.toHaveBeenCalled();
    });

    it("dispatches normally when no eventStore is configured (backward compat)", async () => {
      // Existing call sites (and any future ones) that don't pass eventStore
      // must keep working — no idempotency, but no crash either.
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });
      const res = await handleStripeWebhook(
        postFixture(fixture, nowSec()),
        makeConfig(issuer),
      );
      expect(res.status).toBe(200);
      expect(issuer.issue).toHaveBeenCalled();
    });

    it("dedup happens AFTER signature verification (auth-not-bypassable)", async () => {
      // An attacker probing webhook behavior with bad signatures must not
      // be able to fill the dedup store with garbage event IDs.
      const calls: string[] = [];
      const eventStore = {
        markSeenIfNew: async (id: string) => {
          calls.push(id);
          return ok(true);
        },
      };
      const req = new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": "t=1,v1=deadbeef",
        },
        body: JSON.stringify({ id: "evt_attacker", type: "x" }),
      });
      const res = await handleStripeWebhook(
        req,
        makeConfig(issuer, { eventStore }),
      );
      expect(res.status).toBe(400);
      expect(calls).toEqual([]); // store never touched
    });

    it("skips dedup for events without an id (defensive)", async () => {
      // Stripe always sends event.id, but we guard against malformed input
      // so a missing id doesn't crash the store call.
      const eventStore = new MemorySeenEventStore();
      const fixture = subscriptionCreatedEvent({
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        tier: "personal",
      });
      // Strip the id from the fixture event
      delete (fixture.event as { id?: string }).id;
      const res = await handleStripeWebhook(
        postFixture(fixture, nowSec()),
        makeConfig(issuer, { eventStore }),
      );
      // Should still process (no crash); we just don't dedup.
      expect(res.status).toBe(200);
      expect(issuer.issue).toHaveBeenCalled();
    });
  });

  describe("observability — traceId + structured error logging", () => {
    it("includes a traceId in 400 invalid-signature response body", async () => {
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
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 500 storage-error response and writes a structured log", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const brokenEventStore = {
          async markSeenIfNew() {
            return err("eventStore down");
          },
        };
        const fixture = subscriptionCreatedEvent({
          customerId: CUSTOMER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          tier: "personal",
        });
        const res = await handleStripeWebhook(
          postFixture(fixture, nowSec()),
          makeConfig(issuer, { eventStore: brokenEventStore }),
        );
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.route).toBe("/api/stripe/webhook");
        expect(logged.method).toBe("POST");
        expect(logged.status).toBe(500);
        expect(logged.traceId).toBe(body.traceId);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("includes a traceId in 500 issuer-failure response and writes a structured log", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const brokenIssuer: LicenseIssuer = {
          issue: vi.fn(async () => err("issuer down")),
          revoke: vi.fn(async () => ok(undefined)),
          recordRenewal: vi.fn(async () => ok(undefined)),
        };
        const fixture = subscriptionCreatedEvent({
          customerId: CUSTOMER_ID,
          subscriptionId: SUBSCRIPTION_ID,
          tier: "personal",
        });
        const res = await handleStripeWebhook(
          postFixture(fixture, nowSec()),
          makeConfig(brokenIssuer),
        );
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.errClass).toBeTruthy();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT write a structured log on 400 client errors (invalid signature)", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        await handleStripeWebhook(
          new Request(ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Stripe-Signature": "garbage",
            },
            body: JSON.stringify({}),
          }),
          makeConfig(issuer),
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});
