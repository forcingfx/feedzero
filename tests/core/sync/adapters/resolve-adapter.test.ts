import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveAdapter } from "@/core/sync/adapters/resolve-adapter";

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
});
