import { describe, it, expect } from "vitest";
import {
  MemorySeenEventStore,
  UpstashSeenEventStore,
  type UpstashClientForEvents,
} from "@/core/stripe/seen-event-store";

describe("MemorySeenEventStore", () => {
  it("first call for an eventId returns ok(true) (newly inserted)", async () => {
    const store = new MemorySeenEventStore();
    const result = await store.markSeenIfNew("evt_abc");
    expect(result.ok && result.value).toBe(true);
  });

  it("second call for the same eventId returns ok(false) (duplicate)", async () => {
    const store = new MemorySeenEventStore();
    await store.markSeenIfNew("evt_abc");
    const second = await store.markSeenIfNew("evt_abc");
    expect(second.ok && second.value).toBe(false);
  });

  it("different eventIds are tracked independently", async () => {
    const store = new MemorySeenEventStore();
    const a = await store.markSeenIfNew("evt_a");
    const b = await store.markSeenIfNew("evt_b");
    const aDup = await store.markSeenIfNew("evt_a");
    expect(a.ok && a.value).toBe(true);
    expect(b.ok && b.value).toBe(true);
    expect(aDup.ok && aDup.value).toBe(false);
  });
});

describe("UpstashSeenEventStore", () => {
  /**
   * Fake Upstash client modeling SET NX EX semantics. Returns "OK" when the
   * key was newly set (NX condition met), null when the key already existed
   * (NX condition failed). Mirrors Upstash REST API behavior.
   */
  function fakeClient(): UpstashClientForEvents & { _store: Map<string, unknown> } {
    const store = new Map<string, unknown>();
    return {
      _store: store,
      async set(key, value, opts) {
        if (opts?.nx && store.has(key)) return null;
        store.set(key, value);
        return "OK";
      },
    };
  }

  it("first call for an eventId returns ok(true) (Upstash returned 'OK')", async () => {
    const store = new UpstashSeenEventStore(fakeClient());
    const result = await store.markSeenIfNew("evt_abc");
    expect(result.ok && result.value).toBe(true);
  });

  it("second call for the same eventId returns ok(false) (Upstash returned null)", async () => {
    const store = new UpstashSeenEventStore(fakeClient());
    await store.markSeenIfNew("evt_abc");
    const second = await store.markSeenIfNew("evt_abc");
    expect(second.ok && second.value).toBe(false);
  });

  it("uses key prefix 'stripe:event:' so dedup keys don't collide with license records", async () => {
    const fake = fakeClient();
    const store = new UpstashSeenEventStore(fake);
    await store.markSeenIfNew("evt_abc");
    expect(fake._store.has("stripe:event:evt_abc")).toBe(true);
  });

  it("calls SET with NX (atomic) and EX (TTL) per Stripe's 3-day retry window", async () => {
    const calls: Array<{ opts?: { nx?: boolean; ex?: number } }> = [];
    const store = new UpstashSeenEventStore({
      async set(_key, _value, opts) {
        calls.push({ opts });
        return "OK";
      },
    });
    await store.markSeenIfNew("evt_abc");
    expect(calls[0].opts?.nx).toBe(true);
    // Must be at least 3 days (Stripe's retry window) — we use 7 for headroom.
    expect(calls[0].opts?.ex).toBeGreaterThanOrEqual(3 * 24 * 60 * 60);
  });

  it("returns err on storage exception (e.g. Upstash unreachable)", async () => {
    const store = new UpstashSeenEventStore({
      async set() {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await store.markSeenIfNew("evt_abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/upstash|ECONNREFUSED/i);
  });
});
