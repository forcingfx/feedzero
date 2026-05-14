/**
 * Stateless rate limiter for the production feed proxy. Counts requests per
 * (hashed) client identifier in a 60-second sliding window via Upstash KV.
 *
 * Anonymity floor (matches the rest of FeedZero's logging surface):
 *  - We HASH the client identifier (IP + User-Agent) with a project-scoped
 *    salt before persisting. Raw IPs never leave the lambda's request
 *    context. The hash is enough to count per-client rates but not enough
 *    to reverse-look-up the user.
 *  - The hash key is `cli_<8 hex chars>`-prefixed so it's grep-friendly in
 *    Vercel logs, mirroring the `req_` traceId shape from PR #43.
 *  - The counter key in Upstash is `ratelimit:cli_<hash>` and auto-expires
 *    after the window. Nothing accumulates beyond the window.
 */

import { describe, it, expect, vi } from "vitest";
import {
  UpstashRateLimiter,
  hashClientId,
  type UpstashRateLimitClient,
} from "@/core/proxy/rate-limiter";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/feed", {
    method: "POST",
    headers,
  });
}

const SALT = "test-rate-limit-salt-v1";

describe("hashClientId", () => {
  it("returns a string starting with 'cli_'", async () => {
    const id = await hashClientId(
      makeRequest({ "x-forwarded-for": "203.0.113.1" }),
      SALT,
    );
    expect(id.startsWith("cli_")).toBe(true);
  });

  it("has 8+ hex chars after the prefix (so collisions are rare)", async () => {
    const id = await hashClientId(
      makeRequest({ "x-forwarded-for": "203.0.113.1" }),
      SALT,
    );
    const random = id.slice("cli_".length);
    expect(random.length).toBeGreaterThanOrEqual(8);
    expect(/^[0-9a-f]+$/.test(random)).toBe(true);
  });

  it("produces the same hash for the same IP + UA + salt (deterministic)", async () => {
    const a = await hashClientId(
      makeRequest({
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "Mozilla/5.0",
      }),
      SALT,
    );
    const b = await hashClientId(
      makeRequest({
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "Mozilla/5.0",
      }),
      SALT,
    );
    expect(a).toBe(b);
  });

  it("produces different hashes for different IPs", async () => {
    const a = await hashClientId(
      makeRequest({ "x-forwarded-for": "203.0.113.1" }),
      SALT,
    );
    const b = await hashClientId(
      makeRequest({ "x-forwarded-for": "203.0.113.2" }),
      SALT,
    );
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different User-Agents on the same IP", async () => {
    // Pair IP+UA so multiple users behind one NAT (corporate office, mobile
    // CGNAT) don't all share one rate-limit bucket.
    const a = await hashClientId(
      makeRequest({
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "Firefox/120",
      }),
      SALT,
    );
    const b = await hashClientId(
      makeRequest({
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "Chrome/120",
      }),
      SALT,
    );
    expect(a).not.toBe(b);
  });

  it("produces different hashes for the same input under different salts (salt is honored)", async () => {
    // Rotating the salt invalidates all cached hashes — useful for emergency
    // reset of accumulated rate-limit state.
    const req = makeRequest({ "x-forwarded-for": "203.0.113.1" });
    const a = await hashClientId(req, "salt-v1");
    const b = await hashClientId(req, "salt-v2");
    expect(a).not.toBe(b);
  });

  it("falls back to 'unknown' when no IP header is present", async () => {
    // Defensive: if Vercel doesn't set x-forwarded-for (impossible in
    // practice, but we don't want a crash), still produce a stable hash.
    const id = await hashClientId(makeRequest({}), SALT);
    expect(id.startsWith("cli_")).toBe(true);
  });

  it("uses only the FIRST value of a comma-separated x-forwarded-for chain", async () => {
    // x-forwarded-for can be a chain: "client, proxy1, proxy2". The first
    // value is the original client. Proxies after that are infrastructure
    // and shouldn't change the client identity.
    const a = await hashClientId(
      makeRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }),
      SALT,
    );
    const b = await hashClientId(
      makeRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.2" }),
      SALT,
    );
    expect(a).toBe(b);
  });

  it("does NOT include the raw IP or UA in the output (anonymity floor)", async () => {
    const id = await hashClientId(
      makeRequest({
        "x-forwarded-for": "203.0.113.42",
        "user-agent": "Mozilla/5.0 (X11; Linux)",
      }),
      SALT,
    );
    expect(id).not.toContain("203.0.113.42");
    expect(id).not.toContain("Mozilla");
    expect(id).not.toContain("Linux");
  });
});

describe("UpstashRateLimiter", () => {
  function fakeClient(): UpstashRateLimitClient & {
    incrCalls: string[];
    expireCalls: Array<[string, number]>;
    state: Map<string, number>;
  } {
    const state = new Map<string, number>();
    const incrCalls: string[] = [];
    const expireCalls: Array<[string, number]> = [];
    return {
      state,
      incrCalls,
      expireCalls,
      async incr(key) {
        incrCalls.push(key);
        const next = (state.get(key) ?? 0) + 1;
        state.set(key, next);
        return next;
      },
      async expire(key, sec) {
        expireCalls.push([key, sec]);
        return 1;
      },
      async ttl(key) {
        // Stub — return a positive value so retry-after has something to report.
        return state.has(key) ? 42 : -2;
      },
    };
  }

  it("allows the first request in a new window", async () => {
    const client = fakeClient();
    const limiter = new UpstashRateLimiter(client, { limit: 10, windowSec: 60 });
    const result = await limiter.check("cli_abc12345");
    expect(result.allowed).toBe(true);
  });

  it("allows requests up to (and including) the limit", async () => {
    const client = fakeClient();
    const limiter = new UpstashRateLimiter(client, { limit: 5, windowSec: 60 });
    for (let i = 0; i < 5; i++) {
      const r = await limiter.check("cli_abc");
      expect(r.allowed).toBe(true);
    }
  });

  it("denies the (limit+1)th request and returns retryAfterSec", async () => {
    const client = fakeClient();
    const limiter = new UpstashRateLimiter(client, { limit: 3, windowSec: 60 });
    for (let i = 0; i < 3; i++) await limiter.check("cli_abc");
    const result = await limiter.check("cli_abc");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("sets the window TTL on the first hit (so the counter auto-expires)", async () => {
    const client = fakeClient();
    const limiter = new UpstashRateLimiter(client, { limit: 10, windowSec: 60 });
    await limiter.check("cli_abc");
    // First hit must EXPIRE the key with the window — otherwise the counter
    // accumulates forever and we permanently ban the client.
    expect(client.expireCalls).toHaveLength(1);
    expect(client.expireCalls[0][0]).toBe("ratelimit:cli_abc");
    expect(client.expireCalls[0][1]).toBe(60);
  });

  it("does NOT re-set TTL on subsequent hits (avoid resetting the window)", async () => {
    // If EXPIRE fires on every hit, the window slides forward forever and
    // a steady-rate attacker is never throttled. EXPIRE only on first hit.
    const client = fakeClient();
    const limiter = new UpstashRateLimiter(client, { limit: 10, windowSec: 60 });
    await limiter.check("cli_abc"); // 1st hit
    await limiter.check("cli_abc"); // 2nd hit
    await limiter.check("cli_abc"); // 3rd hit
    expect(client.expireCalls).toHaveLength(1);
  });

  it("uses separate buckets for separate client ids", async () => {
    const client = fakeClient();
    const limiter = new UpstashRateLimiter(client, { limit: 2, windowSec: 60 });
    await limiter.check("cli_aaa");
    await limiter.check("cli_aaa");
    // cli_aaa is now at the limit. cli_bbb should still be allowed.
    const result = await limiter.check("cli_bbb");
    expect(result.allowed).toBe(true);
  });

  it("fails open if Upstash throws (don't block legitimate traffic on infra failure)", async () => {
    // Critical safety: a rate limiter that fails CLOSED on storage errors
    // takes the whole proxy down when Upstash hiccups. Fail OPEN — log the
    // error, allow the request, accept the operational risk.
    const broken: UpstashRateLimitClient = {
      async incr() { throw new Error("upstash down"); },
      async expire() { return 0; },
      async ttl() { return -2; },
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const limiter = new UpstashRateLimiter(broken, { limit: 1, windowSec: 60 });
      const result = await limiter.check("cli_abc");
      expect(result.allowed).toBe(true);
      // We must log so an operator can see Upstash is misbehaving.
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
