import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveLicenseStorage } from "@/core/license/resolve-storage";

describe("resolveLicenseStorage — production guard", () => {
  // License records must never live in per-lambda memory in production —
  // every cold start would clear paid-tier license state and re-write old
  // tokens as unknown. Mirrors the sync / catalog / stripe brand guard.
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
    await expect(resolveLicenseStorage({})).rejects.toThrow(
      /test-only adapter in production/,
    );
  });

  it("allows memory fallthrough outside production", async () => {
    process.env.NODE_ENV = "test";
    const storage = await resolveLicenseStorage({});
    expect(typeof storage.put).toBe("function");
  });
});
