import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createFilesystemAdapter } from "@/core/sync/adapters/filesystem-adapter";
import { isOk, isErr, unwrap } from "@/utils/result";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("filesystem-adapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fz-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for a missing vault", async () => {
    const adapter = createFilesystemAdapter(tmpDir);
    const result = await adapter.get("a".repeat(64));
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBeNull();
  });

  it("stores and retrieves a vault", async () => {
    const adapter = createFilesystemAdapter(tmpDir);
    const vaultId = "b".repeat(64);
    const data = '{"version":1}';

    await adapter.put(vaultId, data);
    const result = await adapter.get(vaultId);
    expect(unwrap(result)).toBe(data);
  });

  it("creates the vaults directory if it does not exist", async () => {
    const nested = path.join(tmpDir, "sub", "deep");
    const adapter = createFilesystemAdapter(nested);
    const vaultId = "c".repeat(64);

    await adapter.put(vaultId, "data");

    const filePath = path.join(nested, "vaults", `${vaultId}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("overwrites an existing vault", async () => {
    const adapter = createFilesystemAdapter(tmpDir);
    const vaultId = "d".repeat(64);

    await adapter.put(vaultId, "first");
    await adapter.put(vaultId, "second");
    expect(unwrap(await adapter.get(vaultId))).toBe("second");
  });

  it("rejects a vault ID that is not 64 hex characters", async () => {
    const adapter = createFilesystemAdapter(tmpDir);

    const putResult = await adapter.put("not-hex!", "data");
    expect(isErr(putResult)).toBe(true);

    const getResult = await adapter.get("../../../etc/passwd");
    expect(isErr(getResult)).toBe(true);
  });

  it("deletes an existing vault file", async () => {
    const adapter = createFilesystemAdapter(tmpDir);
    const vaultId = "e".repeat(64);

    await adapter.put(vaultId, "data");
    const deleteResult = await adapter.delete(vaultId);
    expect(isOk(deleteResult)).toBe(true);

    const getResult = await adapter.get(vaultId);
    expect(unwrap(getResult)).toBeNull();
  });

  it("delete returns ok for a non-existent vault file", async () => {
    const adapter = createFilesystemAdapter(tmpDir);
    const vaultId = "f".repeat(64);

    const result = await adapter.delete(vaultId);
    expect(isOk(result)).toBe(true);
  });

  it("delete rejects an invalid vault ID", async () => {
    const adapter = createFilesystemAdapter(tmpDir);
    const result = await adapter.delete("../../../etc/passwd");
    expect(isErr(result)).toBe(true);
  });

  describe("count", () => {
    it("returns 0 when no vaults exist", async () => {
      const adapter = createFilesystemAdapter(tmpDir);
      const result = await adapter.count();
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(0);
    });

    it("returns correct count after storing vaults", async () => {
      const adapter = createFilesystemAdapter(tmpDir);
      await adapter.put("a".repeat(64), "data1");
      await adapter.put("b".repeat(64), "data2");

      const result = await adapter.count();
      expect(unwrap(result)).toBe(2);
    });

    it("returns 0 when vaults directory does not exist", async () => {
      const adapter = createFilesystemAdapter(path.join(tmpDir, "nonexistent"));
      const result = await adapter.count();
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBe(0);
    });
  });
});
