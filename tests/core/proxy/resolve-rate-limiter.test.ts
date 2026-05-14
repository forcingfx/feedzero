import { describe, it, expect } from "vitest";
import {
  resolveProxyRateLimiter,
  describeRateLimiterMode,
} from "@/core/proxy/resolve-rate-limiter";

const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "tok",
};

describe("resolveProxyRateLimiter", () => {
  it("returns undefined when no Upstash credentials are present (opt-out)", async () => {
    // Self-host / dev / preview without Upstash configured should not have
    // rate limiting at all — the resolver returns undefined and the proxy
    // skips the check entirely (matches the `rateLimit?` opt-in shape).
    const result = await resolveProxyRateLimiter({});
    expect(result).toBeUndefined();
  });

  it("returns a RateLimit when Upstash creds + salt are present", async () => {
    const result = await resolveProxyRateLimiter({
      ...UPSTASH_ENV,
      RATE_LIMIT_HASH_SALT: "explicit-salt-v1",
    });
    expect(result).toBeDefined();
    expect(typeof result?.clientIdFor).toBe("function");
    expect(typeof result?.limiter.check).toBe("function");
  });

  it("falls back to LICENSE_SIGNING_KEY when RATE_LIMIT_HASH_SALT is unset", async () => {
    // The salt is load-bearing for anonymity (without it the hash is
    // rainbow-attackable on IP+UA pairs). LICENSE_SIGNING_KEY is required
    // in production anyway and has high entropy; it's a safe fallback.
    const result = await resolveProxyRateLimiter({
      ...UPSTASH_ENV,
      LICENSE_SIGNING_KEY: "this-is-a-license-signing-key-32b",
    });
    expect(result).toBeDefined();
  });

  it("returns undefined when neither RATE_LIMIT_HASH_SALT nor LICENSE_SIGNING_KEY is set", async () => {
    // Fail-CLOSED on salt: a limiter without a salt persists raw-IP-style
    // hashes that can be reverse-attacked. Better to not rate-limit than
    // to do it in a way that compromises anonymity.
    const result = await resolveProxyRateLimiter({ ...UPSTASH_ENV });
    expect(result).toBeUndefined();
  });

  it("produces a clientIdFor that returns the cli_<hex> shape", async () => {
    const result = await resolveProxyRateLimiter({
      ...UPSTASH_ENV,
      RATE_LIMIT_HASH_SALT: "salt",
    });
    expect(result).toBeDefined();
    const req = new Request("http://localhost/api/feed", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const id = await result!.clientIdFor(req);
    expect(id).toMatch(/^cli_[0-9a-f]+$/);
  });
});

describe("describeRateLimiterMode (module-load logging label)", () => {
  it("returns 'off' when no Upstash creds are present", () => {
    expect(describeRateLimiterMode({})).toBe("off");
  });

  it("returns 'off' when Upstash creds but no salt", () => {
    expect(describeRateLimiterMode({ ...UPSTASH_ENV })).toBe("off");
  });

  it("returns 'upstash' when Upstash creds AND salt are present", () => {
    expect(
      describeRateLimiterMode({
        ...UPSTASH_ENV,
        RATE_LIMIT_HASH_SALT: "salt",
      }),
    ).toBe("upstash");
  });

  it("returns 'upstash' when Upstash creds + LICENSE_SIGNING_KEY (fallback salt)", () => {
    expect(
      describeRateLimiterMode({
        ...UPSTASH_ENV,
        LICENSE_SIGNING_KEY: "key",
      }),
    ).toBe("upstash");
  });
});
