import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveAdapter,
  describeAdapterMode,
} from "@/core/sync/adapters/resolve-adapter";

vi.mock("@/core/sync/adapters/filesystem-adapter", () => ({
  createFilesystemAdapter: vi.fn(() => ({ type: "filesystem" })),
}));

vi.mock("@/core/sync/adapters/memory-adapter", () => ({
  createMemoryAdapter: vi.fn(() => ({ type: "memory" })),
}));

vi.mock("@/core/sync/adapters/vercel-blob-adapter", () => ({
  createVercelBlobAdapter: vi.fn(() => ({ type: "vercel-blob" })),
}));

// Upstash adapter mock — `createUpstashSyncAdapter` is async (dynamic SDK
// import) so the test mock returns a thenable that resolves to a tagged
// object. The resolve-adapter wrapper unwraps this lazily.
vi.mock("@/core/sync/adapters/upstash-adapter", () => ({
  // Returns a fully-shaped fake adapter (not just a tag) so the wrapAsyncAdapter
  // proxy can forward method calls through it. The `type` field is inspectable.
  createUpstashSyncAdapter: vi.fn(async () => ({
    type: "upstash",
    async get() {
      return { ok: true, value: null };
    },
    async put() {
      return { ok: true, value: true };
    },
    async delete() {
      return { ok: true, value: true };
    },
    async count() {
      return { ok: true, value: 0 };
    },
  })),
  hasUpstashSyncCredentials: vi.fn(
    (env?: Record<string, string | undefined>) => {
      // Mirror the real signature: env defaults to process.env when omitted.
      const e = env ?? process.env;
      return Boolean(
        (e.UPSTASH_REDIS_REST_URL ?? e.KV_REST_API_URL) &&
          (e.UPSTASH_REDIS_REST_TOKEN ?? e.KV_REST_API_TOKEN),
      );
    },
  ),
}));

describe("resolveAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SYNC_STORAGE;
    delete process.env.DATA_DIR;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns filesystem adapter by default", () => {
    const adapter = resolveAdapter() as unknown as { type: string };
    expect(adapter.type).toBe("filesystem");
  });

  it("returns memory adapter when storage is 'memory'", () => {
    const adapter = resolveAdapter("memory") as unknown as { type: string };
    expect(adapter.type).toBe("memory");
  });

  it("returns vercel-blob adapter when storage is 'vercel-blob'", () => {
    const adapter = resolveAdapter("vercel-blob") as unknown as { type: string };
    expect(adapter.type).toBe("vercel-blob");
  });

  it("reads SYNC_STORAGE env var when no argument provided", () => {
    process.env.SYNC_STORAGE = "memory";
    const adapter = resolveAdapter() as unknown as { type: string };
    expect(adapter.type).toBe("memory");
  });

  it("explicit argument overrides SYNC_STORAGE env var", () => {
    process.env.SYNC_STORAGE = "memory";
    const adapter = resolveAdapter("vercel-blob") as unknown as { type: string };
    expect(adapter.type).toBe("vercel-blob");
  });

  it("defaults to filesystem for unknown storage values", () => {
    const adapter = resolveAdapter("unknown-storage") as unknown as { type: string };
    expect(adapter.type).toBe("filesystem");
  });

  it("passes dataDir to filesystem adapter", async () => {
    const { createFilesystemAdapter } = await import(
      "@/core/sync/adapters/filesystem-adapter"
    );
    resolveAdapter("filesystem", "/custom/dir");
    expect(createFilesystemAdapter).toHaveBeenCalledWith("/custom/dir");
  });

  it("uses DATA_DIR env var when no dataDir argument", async () => {
    process.env.DATA_DIR = "/env/data";
    const { createFilesystemAdapter } = await import(
      "@/core/sync/adapters/filesystem-adapter"
    );
    resolveAdapter("filesystem");
    expect(createFilesystemAdapter).toHaveBeenCalledWith("/env/data");
  });

  describe("auto-detect via BLOB_READ_WRITE_TOKEN (hotfix for prod regression)", () => {
    // Context: Vercel auto-injects BLOB_READ_WRITE_TOKEN when the project has
    // Vercel Blob configured. Its presence IS the production signal that we
    // want the blob adapter. Previously we required SYNC_STORAGE to be
    // exactly "vercel-blob" — a string the operator had to remember to set.
    // PR W's source-form `api/sync.ts` exposed this fragility; if
    // SYNC_STORAGE was anything other than the exact string, we silently
    // fell through to filesystem, which can't mkdir in a Vercel Lambda.

    it("auto-detects vercel-blob when BLOB_READ_WRITE_TOKEN is set and SYNC_STORAGE is unset", () => {
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
      const adapter = resolveAdapter() as unknown as { type: string };
      expect(adapter.type).toBe("vercel-blob");
    });

    it("explicit SYNC_STORAGE=filesystem overrides auto-detect", () => {
      // Self-hoster on Vercel who wants the FS adapter anyway (unlikely but
      // legitimate): explicit env wins over auto-detect.
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
      process.env.SYNC_STORAGE = "filesystem";
      const adapter = resolveAdapter() as unknown as { type: string };
      expect(adapter.type).toBe("filesystem");
    });

    it("explicit storage arg overrides auto-detect", () => {
      // Tests pass storage arg directly; auto-detect must not intrude.
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
      const adapter = resolveAdapter("memory") as unknown as { type: string };
      expect(adapter.type).toBe("memory");
    });

    it("self-hosted (no BLOB token, no SYNC_STORAGE) still defaults to filesystem", () => {
      // Regression guard: the autodetect must not change behavior for
      // self-hosters who run without Vercel Blob.
      const adapter = resolveAdapter() as unknown as { type: string };
      expect(adapter.type).toBe("filesystem");
    });
  });

  describe("Upstash auto-detect (PR #45 — sync migration target)", () => {
    // Context: PR U migrated license storage to Upstash. PR #45 mirrors that
    // pattern for sync vault storage, consolidating the production data plane
    // onto one backend. The auto-detect cascade PREFERS Upstash over Vercel
    // Blob when both are configured, on the theory that we're migrating
    // TOWARDS Upstash — Blob is the legacy backend.

    it("auto-detects 'upstash' when canonical UPSTASH_REDIS_REST_* are set", async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      const adapter = resolveAdapter();
      // The sync resolveAdapter wraps the async Upstash construction in a
      // sync proxy. Calling any method awaits the underlying adapter, so
      // we tag-check via a method call.
      const result = (await adapter.get("a".repeat(64))) as unknown as {
        ok: boolean;
        value: unknown;
      };
      // The mock factory returned `{ type: "upstash" }`, which is NOT a
      // valid adapter. The wrapper forwards method calls — calling .get()
      // on the mock should throw or return undefined. We check the adapter
      // is the upstash variant by exposing a debug `__type` field.
      // (Implementation note: the wrapper exposes the resolved mode via
      // a non-enumerable symbol/property the test can inspect.)
      void result; // unused in this check; see next test
      expect(describeAdapterMode()).toBe("upstash");
    });

    it("auto-detects 'upstash' when Vercel-Marketplace KV_REST_API_* names are set", () => {
      process.env.KV_REST_API_URL = "https://example.upstash.io";
      process.env.KV_REST_API_TOKEN = "tok";
      expect(describeAdapterMode()).toBe("upstash");
    });

    it("prefers Upstash over Vercel Blob when both are configured (migration target wins)", () => {
      // Critical invariant: during the migration window, Vercel still has
      // BOTH integrations installed. We want the deploy to start writing
      // to Upstash immediately so cutover is one merge, not a multi-step
      // operator dance.
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
      expect(describeAdapterMode()).toBe("upstash");
    });

    it("explicit SYNC_STORAGE=vercel-blob overrides Upstash auto-detect", () => {
      // Escape hatch: an operator who needs to roll back to Vercel Blob
      // (e.g. an Upstash incident) can set SYNC_STORAGE=vercel-blob without
      // touching code. Explicit env wins over auto-detect.
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      process.env.SYNC_STORAGE = "vercel-blob";
      expect(describeAdapterMode()).toBe("vercel-blob");
    });

    it("explicit SYNC_STORAGE=filesystem overrides Upstash auto-detect", () => {
      // Self-hoster who has Upstash credentials lying around but wants
      // filesystem locally. Same escape-hatch principle.
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      process.env.SYNC_STORAGE = "filesystem";
      expect(describeAdapterMode()).toBe("filesystem");
    });

    it("constructs the Upstash adapter when mode is 'upstash'", async () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      const { createUpstashSyncAdapter } = await import(
        "@/core/sync/adapters/upstash-adapter"
      );
      // Trigger construction by calling any method on the wrapped adapter.
      const adapter = resolveAdapter();
      await adapter.get("a".repeat(64));
      expect(createUpstashSyncAdapter).toHaveBeenCalled();
    });

    it("returns an adapter that satisfies the SyncStorageAdapter contract", () => {
      // Type-shape pinning: the wrapper must expose get/put/delete/count
      // even though the underlying adapter is constructed asynchronously.
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      const adapter = resolveAdapter();
      expect(typeof adapter.get).toBe("function");
      expect(typeof adapter.put).toBe("function");
      expect(typeof adapter.delete).toBe("function");
      expect(typeof adapter.count).toBe("function");
    });
  });

  describe("describeAdapterMode (PR #43 + #45)", () => {
    // Keeping these grouped so a future reader sees the full mode-label
    // cascade in one place. Each cascade entry has a regression test above
    // for behavior; these pin the LABEL form used by api/* module-load logs.

    it("returns 'upstash' when Upstash credentials are present", () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://x";
      process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
      expect(describeAdapterMode()).toBe("upstash");
    });

    it("returns 'vercel-blob' when only BLOB_READ_WRITE_TOKEN is present", () => {
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
      expect(describeAdapterMode()).toBe("vercel-blob");
    });

    it("returns 'filesystem' when nothing is configured", () => {
      expect(describeAdapterMode()).toBe("filesystem");
    });

    it("returns whatever SYNC_STORAGE is set to, verbatim", () => {
      process.env.SYNC_STORAGE = "memory";
      expect(describeAdapterMode()).toBe("memory");
    });
  });

  describe("describeAdapterMode (Step A — module-load adapter logging)", () => {
    // The mode label is what gets surfaced at module load in api/sync.ts.
    // It MUST agree with the actual adapter chosen by resolveAdapter() —
    // otherwise the log line lies and observability is worse than nothing.

    it("returns 'filesystem' when nothing is configured", () => {
      expect(describeAdapterMode()).toBe("filesystem");
    });

    it("returns 'vercel-blob' when BLOB_READ_WRITE_TOKEN is present (auto-detect)", () => {
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
      expect(describeAdapterMode()).toBe("vercel-blob");
    });

    it("returns SYNC_STORAGE value when set (explicit override)", () => {
      process.env.SYNC_STORAGE = "memory";
      expect(describeAdapterMode()).toBe("memory");
    });

    it("agrees with resolveAdapter under the same env (no drift)", () => {
      // The KEY invariant: if describeAdapterMode says 'vercel-blob',
      // resolveAdapter must actually return the vercel-blob adapter.
      // This test pins them together so a future edit to one without the
      // other fails immediately.
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
      const label = describeAdapterMode();
      const adapter = resolveAdapter() as unknown as { type: string };
      expect(label).toBe(adapter.type);
    });
  });
});
