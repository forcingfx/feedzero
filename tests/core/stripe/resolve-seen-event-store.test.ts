import { describe, it, expect } from "vitest";
import {
  resolveSeenEventStore,
  describeSeenEventStoreMode,
} from "@/core/stripe/resolve-seen-event-store";
import {
  MemorySeenEventStore,
  UpstashSeenEventStore,
} from "@/core/stripe/seen-event-store";

describe("resolveSeenEventStore", () => {
  it("returns MemorySeenEventStore when Upstash env is missing", async () => {
    const store = await resolveSeenEventStore({});
    expect(store).toBeInstanceOf(MemorySeenEventStore);
  });

  it("returns UpstashSeenEventStore when canonical UPSTASH_* env is set", async () => {
    const store = await resolveSeenEventStore({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok",
    });
    expect(store).toBeInstanceOf(UpstashSeenEventStore);
  });

  it("returns UpstashSeenEventStore when only Vercel-Marketplace KV_REST_API_* is set", async () => {
    // Same shape as resolveLicenseStorage — Vercel's Marketplace integration
    // injects the legacy KV_REST_API_* names instead of canonical UPSTASH_*.
    const store = await resolveSeenEventStore({
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "tok",
    });
    expect(store).toBeInstanceOf(UpstashSeenEventStore);
  });
});

describe("describeSeenEventStoreMode (Step A — module-load logging)", () => {
  it("returns 'memory' when Upstash env is missing", () => {
    expect(describeSeenEventStoreMode({})).toBe("memory");
  });

  it("returns 'upstash' when canonical UPSTASH_* env is set", () => {
    expect(
      describeSeenEventStoreMode({
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "tok",
      }),
    ).toBe("upstash");
  });

  it("returns 'upstash' when only Vercel-Marketplace KV_REST_API_* is set", () => {
    expect(
      describeSeenEventStoreMode({
        KV_REST_API_URL: "https://example.upstash.io",
        KV_REST_API_TOKEN: "tok",
      }),
    ).toBe("upstash");
  });
});
