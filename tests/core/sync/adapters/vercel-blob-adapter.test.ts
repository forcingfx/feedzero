import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVercelBlobAdapter } from "@/core/sync/adapters/vercel-blob-adapter";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";

// Mock @vercel/blob dynamic imports
const mockHead = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockList = vi.fn();

vi.mock("@vercel/blob", () => ({
  head: (...args: unknown[]) => mockHead(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
  list: (...args: unknown[]) => mockList(...args),
}));

// Mock global fetch for the get() path (after head returns metadata)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("vercel-blob-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("get", () => {
    it("returns null when head throws (blob not found)", async () => {
      mockHead.mockRejectedValue(new Error("Not found"));
      const adapter = createVercelBlobAdapter();

      const result = await adapter.get("a".repeat(64));

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });

    it("returns null when fetch response is not ok", async () => {
      mockHead.mockResolvedValue({
        url: "https://blob.vercel-storage.com/vaults/test.json",
      });
      mockFetch.mockResolvedValue({ ok: false });
      const adapter = createVercelBlobAdapter();

      const result = await adapter.get("b".repeat(64));

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });

    it("returns vault data on success", async () => {
      const vaultData = '{"version":1}';
      mockHead.mockResolvedValue({
        url: "https://blob.vercel-storage.com/vaults/test.json",
      });
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(vaultData),
      });
      const adapter = createVercelBlobAdapter();

      const result = await adapter.get("c".repeat(64));

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(vaultData);
    });

    it("returns error when fetch throws", async () => {
      mockHead.mockResolvedValue({
        url: "https://blob.vercel-storage.com/vaults/test.json",
      });
      mockFetch.mockRejectedValue(new Error("Network failure"));
      const adapter = createVercelBlobAdapter();

      const result = await adapter.get("d".repeat(64));

      expect(isErr(result)).toBe(true);
    });
  });

  describe("put", () => {
    it("stores data via vercel blob put", async () => {
      mockPut.mockResolvedValue({
        url: "https://blob.vercel-storage.com/vaults/test.json",
      });
      const adapter = createVercelBlobAdapter();
      const vaultId = "e".repeat(64);

      const result = await adapter.put(vaultId, '{"version":1}');

      expect(isOk(result)).toBe(true);
      expect(mockPut).toHaveBeenCalledWith(
        `vaults/${vaultId}.json`,
        '{"version":1}',
        {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
        },
      );
    });

    it("returns error when put throws", async () => {
      mockPut.mockRejectedValue(new Error("Storage full"));
      const adapter = createVercelBlobAdapter();

      const result = await adapter.put("f".repeat(64), "data");

      expect(isErr(result)).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes blob via vercel blob del", async () => {
      mockDel.mockResolvedValue(undefined);
      const adapter = createVercelBlobAdapter();
      const vaultId = "a".repeat(64);

      const result = await adapter.delete(vaultId);

      expect(isOk(result)).toBe(true);
      expect(mockDel).toHaveBeenCalledWith(`vaults/${vaultId}.json`);
    });

    it("returns error when del throws", async () => {
      mockDel.mockRejectedValue(new Error("Permission denied"));
      const adapter = createVercelBlobAdapter();

      const result = await adapter.delete("b".repeat(64));

      expect(isErr(result)).toBe(true);
    });
  });

  describe("count", () => {
    it("returns total number of blobs in vaults/ prefix", async () => {
      mockList.mockResolvedValue({
        blobs: [{ pathname: "vaults/a.json" }, { pathname: "vaults/b.json" }],
        hasMore: false,
      });
      const adapter = createVercelBlobAdapter();

      const result = await adapter.count();

      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(2);
      expect(mockList).toHaveBeenCalledWith({ prefix: "vaults/", limit: 1000 });
    });

    it("paginates through all blobs when hasMore is true", async () => {
      mockList
        .mockResolvedValueOnce({
          blobs: Array(1000).fill({ pathname: "vaults/x.json" }),
          hasMore: true,
          cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          blobs: [{ pathname: "vaults/y.json" }],
          hasMore: false,
        });
      const adapter = createVercelBlobAdapter();

      const result = await adapter.count();

      expect(unwrap(result)).toBe(1001);
      expect(mockList).toHaveBeenCalledTimes(2);
      expect(mockList).toHaveBeenLastCalledWith({
        prefix: "vaults/",
        limit: 1000,
        cursor: "cursor-1",
      });
    });

    it("returns error when list throws", async () => {
      mockList.mockRejectedValue(new Error("Forbidden"));
      const adapter = createVercelBlobAdapter();

      const result = await adapter.count();

      expect(isErr(result)).toBe(true);
    });
  });
});
