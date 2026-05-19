/**
 * Conformance suite for the `SyncStorageAdapter` contract.
 *
 * Every implementation of `SyncStorageAdapter` must pass this suite.
 * Adding a new adapter without registering it here is a regression
 * vector — issue #117 was rooted in the filesystem adapter quietly
 * not satisfying the atomicity invariant the interface implies.
 *
 * Two invariants:
 *
 *   1. **Atomicity** — `put(id, data)` is atomic relative to concurrent
 *      `get(id)`. A reader either sees the previous value or the new
 *      value, never a partial / torn write. Verified by hammering
 *      many parallel puts and reads against the same vaultId and
 *      asserting every observed read body is a complete, parseable
 *      JSON string.
 *
 *   2. **Idempotency** — `delete(id)` of a missing key returns `ok`,
 *      not `err`. Callers (sync handler, recovery flows) rely on
 *      this; it lets recovery code call `delete` without first
 *      checking existence.
 *
 * Note on test depth: even with single-Node concurrency limits (sync
 * filesystem ops block the event loop), this suite asserts the
 * BEHAVIORAL property — "no observer ever sees a torn body" — across
 * realistic workloads. The integration smoke test at
 * tests/smoke/sync-concurrent-clients.test.ts exercises real
 * cross-connection races against a live Hono server.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFilesystemAdapter } from "@/core/sync/adapters/filesystem-adapter";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import { isOk, unwrap } from "@/utils/result";
import type { SyncStorageAdapter } from "@/core/sync/types";

type AdapterFactory = () => {
  adapter: SyncStorageAdapter;
  teardown: () => void | Promise<void>;
};

/** Re-usable contract suite. Each adapter passes the same battery. */
function testAdapterContract(name: string, factory: AdapterFactory): void {
  describe(`SyncStorageAdapter conformance — ${name}`, () => {
    let adapter: SyncStorageAdapter;
    let teardown: () => void | Promise<void>;

    beforeEach(() => {
      const created = factory();
      adapter = created.adapter;
      teardown = created.teardown;
    });

    afterEach(async () => {
      await teardown();
    });

    it("get returns ok(null) for an unknown vaultId", async () => {
      const result = await adapter.get("a".repeat(64));
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });

    it("put then get returns the same bytes", async () => {
      const vaultId = "b".repeat(64);
      const data = JSON.stringify({ ok: true, vault: { cipher: "abc" } });
      unwrap(await adapter.put(vaultId, data));
      expect(unwrap(await adapter.get(vaultId))).toBe(data);
    });

    it("put is idempotent (second put overwrites cleanly)", async () => {
      const vaultId = "c".repeat(64);
      unwrap(await adapter.put(vaultId, '{"v":1}'));
      unwrap(await adapter.put(vaultId, '{"v":2}'));
      expect(unwrap(await adapter.get(vaultId))).toBe('{"v":2}');
    });

    it("delete of a missing key returns ok (idempotent)", async () => {
      const vaultId = "d".repeat(64);
      const result = await adapter.delete(vaultId);
      expect(isOk(result)).toBe(true);
    });

    it("delete of an existing key removes it", async () => {
      const vaultId = "e".repeat(64);
      unwrap(await adapter.put(vaultId, '{"v":1}'));
      unwrap(await adapter.delete(vaultId));
      expect(unwrap(await adapter.get(vaultId))).toBeNull();
    });

    it("atomicity: no observer sees a torn body across many overwrites", async () => {
      const vaultId = "f".repeat(64);

      // Seed so concurrent readers don't always see `null`.
      unwrap(await adapter.put(vaultId, JSON.stringify({ seed: 0 })));

      // Distinct, valid JSON payloads with size that approximates a
      // real vault. Each is uniquely identifiable so we can verify a
      // read returns one specific writer's bytes — not a Frankenstein
      // mix of two writes.
      function payload(seed: number): string {
        return JSON.stringify({
          seed,
          filler: "x".repeat(32 * 1024),
        });
      }

      const ROUNDS = 25;
      const writes = Array.from({ length: ROUNDS }, (_, i) =>
        adapter.put(vaultId, payload(i + 1)),
      );
      const reads = Array.from({ length: ROUNDS * 2 }, () =>
        adapter.get(vaultId),
      );

      const [writeResults, readResults] = await Promise.all([
        Promise.all(writes),
        Promise.all(reads),
      ]);

      // All writes must succeed.
      for (const w of writeResults) {
        expect(isOk(w)).toBe(true);
      }

      // Every non-null read must be a complete, parseable body that
      // matches ONE of the writers' payloads (or the seed). A torn
      // body fails JSON.parse here.
      const validBodies = new Set<string>([
        JSON.stringify({ seed: 0 }),
        ...Array.from({ length: ROUNDS }, (_, i) => payload(i + 1)),
      ]);
      for (const r of readResults) {
        expect(isOk(r)).toBe(true);
        const value = unwrap(r);
        if (value === null) continue;
        expect(() => JSON.parse(value)).not.toThrow();
        expect(validBodies.has(value)).toBe(true);
      }
    });

    it("count reflects only completed writes (no in-flight intermediates)", async () => {
      const ids = ["1", "2", "3", "4"].map((c) => c.repeat(64));
      const writes = ids.map((id) =>
        adapter.put(id, JSON.stringify({ id, filler: "y".repeat(16 * 1024) })),
      );
      const counts = Array.from({ length: 6 }, () => adapter.count());

      const [, countResults] = await Promise.all([
        Promise.all(writes),
        Promise.all(counts),
      ]);

      for (const c of countResults) {
        expect(isOk(c)).toBe(true);
        const n = unwrap(c);
        // Count must be in [0, ids.length] — never see a transient
        // tmp file as an extra entry.
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(ids.length);
      }

      // Final count must be exact.
      expect(unwrap(await adapter.count())).toBe(ids.length);
    });

  });
}

// Vault-ID validation is intentionally NOT part of this conformance
// suite: it's a defense-in-depth concern at the filesystem-adapter
// level (path traversal), but the interface treats `vaultId` as opaque
// bytes. The sync handler enforces the 64-hex format upstream of every
// adapter (see sync-handler.ts validateVaultId). Memory and Upstash
// adapters treat IDs as opaque keys and need no validation.

testAdapterContract("memory", () => ({
  adapter: createMemoryAdapter(),
  teardown: () => undefined,
}));

testAdapterContract("filesystem", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fz-conformance-"));
  return {
    adapter: createFilesystemAdapter(tmpDir),
    teardown: () => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
});

// Upstash and Vercel Blob adapter conformance is exercised by the
// smoke tests (tests/smoke/sync*.test.ts) since they need live
// credentials and the corresponding env. The two adapters here cover
// the deployment shapes most likely to slip an atomicity regression
// past CI (filesystem is the historical offender per issue #117;
// memory is the harness used by every fast unit test).
