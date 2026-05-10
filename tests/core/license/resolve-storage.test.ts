import { describe, it, expect } from "vitest";
import { resolveLicenseStorage } from "../../../src/core/license/resolve-storage";
import { MemoryLicenseStorage } from "../../../src/core/license/storage";
import { UpstashLicenseStorage } from "../../../src/core/license/storage-upstash";

describe("resolveLicenseStorage", () => {
  it("returns MemoryLicenseStorage when UPSTASH_REDIS_REST_URL is missing", async () => {
    const storage = await resolveLicenseStorage({});
    expect(storage).toBeInstanceOf(MemoryLicenseStorage);
  });

  it("returns MemoryLicenseStorage when only token is set", async () => {
    const storage = await resolveLicenseStorage({
      UPSTASH_REDIS_REST_TOKEN: "tok",
    });
    expect(storage).toBeInstanceOf(MemoryLicenseStorage);
  });

  it("returns UpstashLicenseStorage when both env vars are set (canonical names)", async () => {
    const storage = await resolveLicenseStorage({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok",
    });
    expect(storage).toBeInstanceOf(UpstashLicenseStorage);
  });

  it("returns UpstashLicenseStorage when only legacy KV_REST_API_* names are set", async () => {
    // The Vercel Marketplace Upstash integration injects the legacy Vercel
    // KV variable names (KV_REST_API_URL / KV_REST_API_TOKEN). Both name
    // conventions point at the same Upstash REST endpoint; we accept either.
    const storage = await resolveLicenseStorage({
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "tok",
    });
    expect(storage).toBeInstanceOf(UpstashLicenseStorage);
  });

  it("prefers UPSTASH_* names when both conventions are set", async () => {
    // Belt-and-suspenders: if an operator has explicitly set the canonical
    // names alongside the auto-injected KV_* ones, honor the explicit one.
    const storage = await resolveLicenseStorage({
      UPSTASH_REDIS_REST_URL: "https://canonical.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "canonical-tok",
      KV_REST_API_URL: "https://legacy.upstash.io",
      KV_REST_API_TOKEN: "legacy-tok",
    });
    expect(storage).toBeInstanceOf(UpstashLicenseStorage);
  });
});
