/**
 * Tests for the test-sentinel vault cleanup.
 *
 * Background: during the May 13-14 sync incident + smoke-test work, a
 * handful of synthetic-looking vaultIds (64 repetitions of the same hex
 * char — e.g. "aaaa…" or "bbbb…") got stored in production. They're
 * indistinguishable from real vaults to the server, but no real user
 * would ever derive such a vaultId from a passphrase. They're test
 * artifacts. This cleanup removes them.
 *
 * Same shape as the Blob→Upstash migration: dry-run-by-default,
 * idempotent, opt-in execute. The CLI wrapper lives in
 * scripts/cleanup-sentinel-vaults.ts.
 */

import { describe, it, expect } from "vitest";
import {
  isSentinelVaultId,
  cleanupSentinelVaults,
  type SentinelScanClient,
} from "@/core/sync/migration/sentinel-cleanup";

describe("isSentinelVaultId", () => {
  it("matches 64 of the same hex char (lower-case)", () => {
    expect(isSentinelVaultId("a".repeat(64))).toBe(true);
    expect(isSentinelVaultId("0".repeat(64))).toBe(true);
    expect(isSentinelVaultId("f".repeat(64))).toBe(true);
  });

  it("does NOT match real-looking 64-hex strings (mixed chars)", () => {
    // A real PBKDF2-derived vaultId has high entropy — same-char chance
    // is 16^-63 ≈ 0. Anything that's NOT all-same-char is treated as
    // possibly-real and left alone.
    expect(isSentinelVaultId("a".repeat(63) + "b")).toBe(false);
    expect(isSentinelVaultId("0123456789abcdef".repeat(4))).toBe(false);
    // Realistic example (random hex)
    expect(isSentinelVaultId("3f2a1b4c5d6e7f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708")).toBe(false);
  });

  it("rejects strings that aren't 64 chars", () => {
    expect(isSentinelVaultId("")).toBe(false);
    expect(isSentinelVaultId("a")).toBe(false);
    expect(isSentinelVaultId("a".repeat(63))).toBe(false);
    expect(isSentinelVaultId("a".repeat(65))).toBe(false);
  });

  it("rejects non-hex characters even if 64-of-the-same", () => {
    expect(isSentinelVaultId("g".repeat(64))).toBe(false);
    expect(isSentinelVaultId("z".repeat(64))).toBe(false);
    expect(isSentinelVaultId("A".repeat(64))).toBe(false); // uppercase not in our pattern
  });
});

describe("cleanupSentinelVaults", () => {
  function fakeClient(initial: string[]): SentinelScanClient & {
    deleted: string[];
  } {
    const state = new Set(initial);
    const deleted: string[] = [];
    return {
      deleted,
      async scan(_cursor, opts) {
        const match = opts?.match ?? "*";
        const prefix = match.replace(/\*$/, "");
        const keys = [...state].filter((k) => k.startsWith(prefix));
        return [0, keys];
      },
      async del(key) {
        if (state.has(key)) {
          state.delete(key);
          deleted.push(key);
          return 1;
        }
        return 0;
      },
    };
  }

  const SENTINEL_A = `vault:${"a".repeat(64)}`;
  const SENTINEL_B = `vault:${"b".repeat(64)}`;
  const REAL_VAULT = `vault:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd`;

  describe("dry-run (default)", () => {
    it("reports which keys would be deleted, deletes nothing", async () => {
      const client = fakeClient([SENTINEL_A, SENTINEL_B, REAL_VAULT]);
      const result = await cleanupSentinelVaults(client);

      expect(result.foundSentinels).toEqual(expect.arrayContaining([SENTINEL_A, SENTINEL_B]));
      expect(result.foundSentinels.length).toBe(2);
      expect(result.deleted).toBe(0);
      expect(client.deleted).toEqual([]);
    });

    it("never matches real-looking vaultIds", async () => {
      const client = fakeClient([REAL_VAULT]);
      const result = await cleanupSentinelVaults(client);
      expect(result.foundSentinels).toEqual([]);
    });
  });

  describe("execute mode", () => {
    it("deletes ONLY sentinel vaults, leaves real vaults intact", async () => {
      const client = fakeClient([SENTINEL_A, SENTINEL_B, REAL_VAULT]);
      const result = await cleanupSentinelVaults(client, { execute: true });

      expect(result.deleted).toBe(2);
      expect(client.deleted).toEqual(
        expect.arrayContaining([SENTINEL_A, SENTINEL_B]),
      );
      expect(client.deleted).not.toContain(REAL_VAULT);
    });

    it("is idempotent — running twice deletes nothing on the second run", async () => {
      const client = fakeClient([SENTINEL_A, REAL_VAULT]);
      const first = await cleanupSentinelVaults(client, { execute: true });
      const second = await cleanupSentinelVaults(client, { execute: true });

      expect(first.deleted).toBe(1);
      expect(second.deleted).toBe(0);
      expect(client.deleted).toEqual([SENTINEL_A]);
    });
  });

  describe("non-vault: keys", () => {
    it("ignores keys outside the vault: prefix", async () => {
      // Defensive: the cleanup scans `vault:*` only. Other namespaces
      // (license:, catalog:, ratelimit:) shouldn't be touched even if
      // somehow they happened to contain a 64-of-the-same-char tail.
      const client = fakeClient([
        SENTINEL_A,
        "license:record:" + "a".repeat(64),
        "catalog:feed:" + "a".repeat(64),
      ]);
      const result = await cleanupSentinelVaults(client, { execute: true });
      expect(result.deleted).toBe(1);
      expect(client.deleted).toEqual([SENTINEL_A]);
    });
  });
});
