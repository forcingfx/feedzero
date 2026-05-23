import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAdapter } from "@/core/sync/adapters/resolve-adapter";

describe("resolveAdapter — production guard", () => {
  // Real resolveAdapter (no mocks) so the brand applied by the real
  // createMemoryAdapter is observable. This is the regression guard for the
  // 2026-05-12 sync incident: a stale SYNC_STORAGE=memory env in production
  // silently routed PUTs to a per-cold-start in-memory map.
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
    delete process.env.SYNC_STORAGE;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  afterEach(() => {
    process.env = original;
  });

  it("throws when production env explicitly requests memory storage", () => {
    process.env.NODE_ENV = "production";
    expect(() => resolveAdapter("memory")).toThrow(
      /test-only adapter in production/,
    );
  });

  it("throws when production env reads SYNC_STORAGE=memory", () => {
    process.env.NODE_ENV = "production";
    process.env.SYNC_STORAGE = "memory";
    expect(() => resolveAdapter()).toThrow(/test-only adapter in production/);
  });

  it("allows memory storage outside production", () => {
    process.env.NODE_ENV = "test";
    const adapter = resolveAdapter("memory");
    expect(typeof adapter.get).toBe("function");
  });
});
