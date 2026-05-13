import { describe, it, expect, vi } from "vitest";
import {
  handleCreateCheckoutSession,
  SUPPORTED_METHODS,
  type CheckoutClient,
} from "@/core/stripe/checkout-handler";

const ALLOWED_PRICES = [
  "price_personal_monthly_test",
  "price_personal_yearly_test",
  "price_pro_monthly_test",
  "price_pro_yearly_test",
] as const;

function fakeStripeClient(
  overrides: Partial<CheckoutClient> = {},
): CheckoutClient {
  return {
    create: vi.fn(async () => ({
      url: "https://checkout.stripe.com/pay/cs_test_xyz",
      id: "cs_test_xyz",
    })),
    ...overrides,
  };
}

function postBody(body: unknown): Request {
  return new Request("https://feedzero.app/api/checkout/create-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("checkout handler — contract", () => {
  it("SUPPORTED_METHODS lists POST only", () => {
    expect(SUPPORTED_METHODS).toEqual(["POST"]);
  });

  it("returns 405 for non-POST", async () => {
    const res = await handleCreateCheckoutSession(
      new Request("https://feedzero.app/api/checkout/create-session", {
        method: "GET",
      }),
      { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(405);
  });
});

describe("checkout handler — body validation", () => {
  it("returns 400 when body is not JSON", async () => {
    const res = await handleCreateCheckoutSession(
      new Request("https://feedzero.app/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when priceId is missing", async () => {
    const res = await handleCreateCheckoutSession(
      postBody({ successUrl: "https://x", cancelUrl: "https://x" }),
      { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when priceId is NOT in the allowlist (prevents arbitrary-price abuse)", async () => {
    // Critical security control: never trust client-supplied price IDs.
    // The handler MUST validate against a server-controlled allowlist.
    // Without this, an attacker could pass price_attacker_999 = $0.01 and
    // get a "Pro" license for a penny via metadata manipulation downstream.
    const res = await handleCreateCheckoutSession(
      postBody({
        priceId: "price_attacker_pwn",
        successUrl: "https://feedzero.app/success",
        cancelUrl: "https://feedzero.app/cancel",
      }),
      { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when successUrl is missing", async () => {
    const res = await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        cancelUrl: "https://x",
      }),
      { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when successUrl is not http(s)", async () => {
    // Open-redirect / SSRF guard. Don't let callers pass javascript:, file:, etc.
    const res = await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        successUrl: "javascript:alert(1)",
        cancelUrl: "https://feedzero.app/cancel",
      }),
      { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(400);
  });
});

describe("checkout handler — KILL_SIGNUPS", () => {
  it("returns 503 when killSignups returns true", async () => {
    const res = await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        successUrl: "https://feedzero.app/success",
        cancelUrl: "https://feedzero.app/cancel",
      }),
      {
        client: fakeStripeClient(),
        allowedPrices: ALLOWED_PRICES,
        killSignups: () => true,
      },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/signups disabled/i);
  });
});

describe("checkout handler — success path", () => {
  it("returns 200 + {url} for valid request, calls client.create with subscription mode", async () => {
    const create = vi.fn(async () => ({
      url: "https://checkout.stripe.com/pay/cs_test_xyz",
      id: "cs_test_xyz",
    }));
    const res = await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        successUrl: "https://feedzero.app/success?cs={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://feedzero.app/cancel",
      }),
      { client: { create }, allowedPrices: ALLOWED_PRICES },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://checkout.stripe.com/pay/cs_test_xyz");

    // Critical: verify Stripe was called with the right shape
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_personal_monthly_test", quantity: 1 }],
        success_url: "https://feedzero.app/success?cs={CHECKOUT_SESSION_ID}",
        cancel_url: "https://feedzero.app/cancel",
      }),
      expect.anything(),
    );
  });

  it("forwards optional customerEmail when provided", async () => {
    const create = vi.fn(async () => ({ url: "https://x", id: "y" }));
    await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        successUrl: "https://feedzero.app/s",
        cancelUrl: "https://feedzero.app/c",
        customerEmail: "test@example.com",
      }),
      { client: { create }, allowedPrices: ALLOWED_PRICES },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customer_email: "test@example.com" }),
      expect.anything(),
    );
  });

  it("passes an idempotencyKey derived from request shape so retries don't double-charge", async () => {
    // Stripe doc: idempotency keys make POSTs safe to retry. We derive a
    // key from priceId + email + a window so accidental double-clicks
    // within ~5 min collapse to one Checkout Session.
    const create = vi.fn(async () => ({ url: "https://x", id: "y" }));
    await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        successUrl: "https://feedzero.app/s",
        cancelUrl: "https://feedzero.app/c",
        customerEmail: "dup@example.com",
      }),
      { client: { create }, allowedPrices: ALLOWED_PRICES },
    );
    const secondArg = (create as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][1];
    expect(secondArg).toMatchObject({
      idempotencyKey: expect.any(String),
    });
  });

  it("returns 502 when Stripe client throws", async () => {
    const res = await handleCreateCheckoutSession(
      postBody({
        priceId: "price_personal_monthly_test",
        successUrl: "https://feedzero.app/s",
        cancelUrl: "https://feedzero.app/c",
      }),
      {
        client: {
          create: async () => {
            throw new Error("Stripe API down");
          },
        },
        allowedPrices: ALLOWED_PRICES,
      },
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  describe("observability — traceId + structured error logging", () => {
    it("includes a traceId in 400 invalid-priceId response body", async () => {
      const res = await handleCreateCheckoutSession(
        postBody({
          priceId: "price_NOT_in_allowlist",
          successUrl: "https://feedzero.app/s",
          cancelUrl: "https://feedzero.app/c",
        }),
        { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    });

    it("includes a traceId in 502 stripe-failure response and writes a structured log", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const res = await handleCreateCheckoutSession(
          postBody({
            priceId: "price_personal_monthly_test",
            successUrl: "https://feedzero.app/s",
            cancelUrl: "https://feedzero.app/c",
          }),
          {
            client: {
              create: async () => {
                throw new Error("Stripe API down");
              },
            },
            allowedPrices: ALLOWED_PRICES,
          },
        );
        const body = await res.json();
        expect(res.status).toBe(502);
        expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);

        expect(consoleError).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(consoleError.mock.calls[0][0] as string);
        expect(logged.route).toBe("/api/checkout/create-session");
        expect(logged.method).toBe("POST");
        expect(logged.status).toBe(502);
        expect(logged.traceId).toBe(body.traceId);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("does NOT write a structured log on 4xx client errors", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        await handleCreateCheckoutSession(
          postBody({
            priceId: "price_NOT_in_allowlist",
            successUrl: "https://feedzero.app/s",
            cancelUrl: "https://feedzero.app/c",
          }),
          { client: fakeStripeClient(), allowedPrices: ALLOWED_PRICES },
        );
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});
