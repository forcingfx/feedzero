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

  it("returns UpstashLicenseStorage when both env vars are set", async () => {
    const storage = await resolveLicenseStorage({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok",
    });
    expect(storage).toBeInstanceOf(UpstashLicenseStorage);
  });
});
