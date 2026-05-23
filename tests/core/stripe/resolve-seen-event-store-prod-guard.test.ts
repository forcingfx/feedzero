import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSeenEventStore } from "@/core/stripe/resolve-seen-event-store";

describe("resolveSeenEventStore — production guard", () => {
  // Memory-backed event dedup in production means each cold start "forgets"
  // every Stripe event id it has seen, so a retry against a different
  // lambda will be processed twice — issuer mints duplicate license tokens.
  // Same brand-based guard as the other three resolvers.
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    process.env = original;
  });

  it("throws when production env has no Upstash credentials", async () => {
    process.env.NODE_ENV = "production";
    await expect(resolveSeenEventStore({})).rejects.toThrow(
      /test-only adapter in production/,
    );
  });

  it("allows memory fallthrough outside production", async () => {
    process.env.NODE_ENV = "test";
    const store = await resolveSeenEventStore({});
    expect(typeof store.markSeenIfNew).toBe("function");
  });
});
