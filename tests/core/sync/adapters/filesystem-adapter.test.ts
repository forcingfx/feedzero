import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createFilesystemAdapter } from "@/core/sync/adapters/filesystem-adapter";
import { isOk, isErr, unwrap } from "@feedzero/core/utils/result";
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

    it("ignores transient tmp files (.tmp- prefix)", async () => {
      const adapter = createFilesystemAdapter(tmpDir);
      await adapter.put("a".repeat(64), '{"v":1}');

      // Simulate an orphan tmp file from a crashed write.
      const vaultsDir = path.join(tmpDir, "vaults");
      fs.writeFileSync(path.join(vaultsDir, ".tmp-orphan-123"), "partial");

      const result = await adapter.count();
      expect(unwrap(result)).toBe(1);
    });
  });

  // Atomicity contract: PUT must be atomic relative to concurrent GET.
  // A reader either sees the previous value or the new value, never a
  // partial / truncated body. The bug from issue #117 (filesystem
  // adapter using `writeFileSync` which truncates-then-writes) is not
  // observable in single-Node unit tests because writeFileSync blocks
  // the event loop — but it IS observable across processes (e.g. the
  // user reading the on-disk vault file with `cat` mid-PUT, or a
  // separate Node worker reading). These tests verify the behavioral
  // properties the atomic implementation must hold; the real race is
  // exercised by the integration test in tests/integration/.
  describe("atomic write contract", () => {
    it("never leaves the vault path with an intermediate (0-byte) state visible", async () => {
      const adapter = createFilesystemAdapter(tmpDir);
      const vaultId = "1".repeat(64);
      const filePath = path.join(tmpDir, "vaults", `${vaultId}.json`);

      // Seed initial content so any "torn" state would be empty/partial.
      const original = JSON.stringify({ ok: true, value: "before" });
      unwrap(await adapter.put(vaultId, original));

      // Replace with a large payload. After the call returns, the file
      // MUST contain the new content in full (no partial write). The
      // atomic implementation guarantees this because the rename is the
      // only mutation visible to a concurrent reader at the vault path.
      const next = JSON.stringify({
        ok: true,
        value: "after",
        filler: "x".repeat(256 * 1024),
      });
      unwrap(await adapter.put(vaultId, next));

      const onDisk = fs.readFileSync(filePath, "utf-8");
      expect(onDisk).toBe(next);
      expect(() => JSON.parse(onDisk)).not.toThrow();
    });

    it("cleans up tmp files after a successful write (no orphans)", async () => {
      const adapter = createFilesystemAdapter(tmpDir);
      const vaultId = "2".repeat(64);

      unwrap(await adapter.put(vaultId, '{"ok":true}'));

      const vaultsDir = path.join(tmpDir, "vaults");
      const entries = fs.readdirSync(vaultsDir);
      const tmpFiles = entries.filter((f) => f.startsWith(".tmp-"));
      expect(tmpFiles).toEqual([]);
    });

    it("the on-disk path holds valid content after many sequential overwrites", async () => {
      // Regression guard: after the rename-based implementation, every
      // visible state at the vault path is a complete, parseable body.
      // If a future refactor reintroduces truncate-then-write, this can
      // observably regress when called from a faster filesystem or via
      // worker threads.
      const adapter = createFilesystemAdapter(tmpDir);
      const vaultId = "3".repeat(64);
      const filePath = path.join(tmpDir, "vaults", `${vaultId}.json`);

      for (let i = 0; i < 20; i++) {
        const payload = JSON.stringify({ seed: i, filler: "y".repeat(8192) });
        unwrap(await adapter.put(vaultId, payload));
        const onDisk = fs.readFileSync(filePath, "utf-8");
        expect(() => JSON.parse(onDisk)).not.toThrow();
        expect(JSON.parse(onDisk).seed).toBe(i);
      }
    });
  });
});
