import { describe, it, expect } from "vitest";
import {
  resolveCatalogStorage,
  describeCatalogStorageMode,
} from "@/core/catalog/resolve-catalog-storage";
import { UpstashCatalogAdapter } from "@/core/catalog/adapters/upstash-adapter";

describe("resolveCatalogStorage", () => {
  // Mirrors the shape of resolveLicenseStorage / resolveSeenEventStore so an
  // operator who knows one knows the other.

  it("returns a memory adapter when Upstash env is absent", async () => {
    const adapter = await resolveCatalogStorage({});
    // Memory adapter satisfies the interface but is NOT UpstashCatalogAdapter.
    expect(adapter).not.toBeInstanceOf(UpstashCatalogAdapter);
    // Verify the interface shape is intact (smoke test, not exhaustive).
    expect(typeof adapter.upsert).toBe("function");
    expect(typeof adapter.popular).toBe("function");
    expect(typeof adapter.count).toBe("function");
  });

  it("returns UpstashCatalogAdapter when canonical UPSTASH_* env is set", async () => {
    const adapter = await resolveCatalogStorage({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok",
    });
    expect(adapter).toBeInstanceOf(UpstashCatalogAdapter);
  });

  it("returns UpstashCatalogAdapter when Vercel-Marketplace KV_REST_API_* names are set", async () => {
    // The Vercel Marketplace Upstash integration injects KV_REST_API_*
    // (legacy Vercel KV names). All three Upstash-backed adapters honor
    // both name pairs.
    const adapter = await resolveCatalogStorage({
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "tok",
    });
    expect(adapter).toBeInstanceOf(UpstashCatalogAdapter);
  });

  it("prefers UPSTASH_* over KV_REST_API_* when both are set", async () => {
    // Explicit override beats auto-injected. Same rule as license/sync.
    const adapter = await resolveCatalogStorage({
      UPSTASH_REDIS_REST_URL: "https://canonical.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "canonical-tok",
      KV_REST_API_URL: "https://legacy.upstash.io",
      KV_REST_API_TOKEN: "legacy-tok",
    });
    expect(adapter).toBeInstanceOf(UpstashCatalogAdapter);
  });
});

describe("describeCatalogStorageMode (module-load logging label)", () => {
  it("returns 'memory' when Upstash env is missing", () => {
    expect(describeCatalogStorageMode({})).toBe("memory");
  });

  it("returns 'upstash' when canonical UPSTASH_REDIS_REST_* are set", () => {
    expect(
      describeCatalogStorageMode({
        UPSTASH_REDIS_REST_URL: "https://x",
        UPSTASH_REDIS_REST_TOKEN: "tok",
      }),
    ).toBe("upstash");
  });

  it("returns 'upstash' when only Vercel-Marketplace KV_REST_API_* is set", () => {
    expect(
      describeCatalogStorageMode({
        KV_REST_API_URL: "https://x",
        KV_REST_API_TOKEN: "tok",
      }),
    ).toBe("upstash");
  });
});
