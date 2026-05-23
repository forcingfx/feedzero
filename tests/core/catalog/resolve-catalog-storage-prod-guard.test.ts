import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeCatalogStorageMode,
  resolveCatalogStorage,
} from "@/core/catalog/resolve-catalog-storage";

describe("resolveCatalogStorage — production guard", () => {
  // The 2026-05-14 stats-always-zero incident pattern: a fallthrough to an
  // in-memory map in production gives each cold-started lambda its own
  // empty store. The resolver must refuse to return a memory adapter when
  // NODE_ENV=production so the failure is a loud module-load error instead
  // of silent data loss.
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
    await expect(resolveCatalogStorage()).rejects.toThrow(
      /test-only adapter in production/,
    );
  });

  it("allows memory fallthrough outside production", async () => {
    process.env.NODE_ENV = "test";
    const adapter = await resolveCatalogStorage({});
    expect(typeof adapter.upsert).toBe("function");
  });

  it("describeCatalogStorageMode still reports 'memory' (label is descriptive)", () => {
    // The mode label intentionally does not throw — it's purely informational
    // and surfaces in module-load logs before the resolver is called.
    process.env.NODE_ENV = "production";
    expect(describeCatalogStorageMode({})).toBe("memory");
  });
});
