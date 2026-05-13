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

describe("resolveAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SYNC_STORAGE;
    delete process.env.DATA_DIR;
    delete process.env.BLOB_READ_WRITE_TOKEN;
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
