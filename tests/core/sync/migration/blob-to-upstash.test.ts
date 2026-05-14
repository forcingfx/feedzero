/**
 * Migration from Vercel Blob (legacy sync storage) to Upstash KV (current
 * sync storage). One-shot, idempotent, dry-run by default.
 *
 * Context: PR #45 (2026-05-13) migrated /api/sync from Vercel Blob to
 * Upstash KV but didn't migrate the data. Vault payloads previously stored
 * in Blob (`vaults/<vaultId>.json`) became unreachable from /api/sync,
 * which now only queries Upstash. Users whose client retained the local
 * vault re-pushed on next sync; users without local state (cleared
 * browser, new device, etc.) saw `Vault not found` 404s on pull because
 * the API no longer looks at Blob.
 *
 * This migration reads every `vaults/<vaultId>.json` from Blob, writes
 * it to Upstash under `vault:<vaultId>`, and (optionally) deletes the
 * Blob original. Idempotent: SET in Upstash is last-write-wins; running
 * twice doesn't duplicate data.
 *
 * Tested with injected fake clients here. The real Vercel Blob and
 * Upstash REST clients are wired up in `scripts/migrate-blob-to-upstash.ts`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  migrateBlobVaultsToUpstash,
  type BlobListClient,
  type UpstashSetClient,
} from "@/core/sync/migration/blob-to-upstash";

interface BlobEntry {
  pathname: string;
  url: string;
  size: number;
}

function fakeBlobClient(
  blobs: BlobEntry[],
  contents: Record<string, string>,
): BlobListClient & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async list(opts) {
      const prefix = opts?.prefix ?? "";
      const matched = blobs.filter((b) => b.pathname.startsWith(prefix));
      return { blobs: matched, hasMore: false, cursor: undefined };
    },
    async fetchUrl(url) {
      const content = contents[url];
      if (content === undefined) throw new Error(`fake blob 404 for ${url}`);
      return content;
    },
    async del(pathname) {
      deleted.push(pathname);
    },
  };
}

function fakeUpstashClient(): UpstashSetClient & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    async set(key, value) {
      store.set(key, String(value));
      return "OK";
    },
  };
}

const VAULT_ID_A = "a".repeat(64);
const VAULT_ID_B = "b".repeat(64);
const SAMPLE_PAYLOAD_A = JSON.stringify({
  ok: true,
  vault: { version: 1, iv: [1, 2], ciphertext: "encA" },
});
const SAMPLE_PAYLOAD_B = JSON.stringify({
  ok: true,
  vault: { version: 1, iv: [3, 4], ciphertext: "encB" },
});

describe("migrateBlobVaultsToUpstash", () => {
  describe("dry run (default)", () => {
    it("reports the count of vaults that WOULD be migrated, writes nothing", async () => {
      const blob = fakeBlobClient(
        [
          { pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 },
          { pathname: `vaults/${VAULT_ID_B}.json`, url: "https://blob/b", size: 100 },
        ],
        { "https://blob/a": SAMPLE_PAYLOAD_A, "https://blob/b": SAMPLE_PAYLOAD_B },
      );
      const upstash = fakeUpstashClient();

      const result = await migrateBlobVaultsToUpstash(blob, upstash);

      expect(result.found).toBe(2);
      expect(result.migrated).toBe(0); // dry-run writes nothing
      expect(result.deleted).toBe(0);
      expect(result.failed).toEqual([]);
      expect(upstash.store.size).toBe(0); // no writes
      expect(blob.deleted).toEqual([]); // no deletes
    });

    it("does not delete Blob originals in dry-run, even with deleteBlob=true", async () => {
      // Dry-run is a HARD safety floor: even if the caller passes
      // deleteBlob:true with execute:false, no destructive ops fire.
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash = fakeUpstashClient();

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: false,
        deleteBlob: true,
      });

      expect(result.deleted).toBe(0);
      expect(blob.deleted).toEqual([]);
    });
  });

  describe("execute mode (writes to Upstash)", () => {
    it("writes each vault payload to vault:<vaultId> in Upstash", async () => {
      const blob = fakeBlobClient(
        [
          { pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 },
          { pathname: `vaults/${VAULT_ID_B}.json`, url: "https://blob/b", size: 100 },
        ],
        { "https://blob/a": SAMPLE_PAYLOAD_A, "https://blob/b": SAMPLE_PAYLOAD_B },
      );
      const upstash = fakeUpstashClient();

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
      });

      expect(result.found).toBe(2);
      expect(result.migrated).toBe(2);
      expect(upstash.store.get(`vault:${VAULT_ID_A}`)).toBe(SAMPLE_PAYLOAD_A);
      expect(upstash.store.get(`vault:${VAULT_ID_B}`)).toBe(SAMPLE_PAYLOAD_B);
    });

    it("preserves the payload as a STRING, not a parsed object", async () => {
      // The Upstash SDK's default automaticDeserialization parses JSON
      // strings into objects on GET. We store strings here so the sync
      // handler reads back the same string and feeds it to Response()
      // unchanged. This invariant is also asserted in the
      // UpstashSyncAdapter unit tests.
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash = fakeUpstashClient();

      await migrateBlobVaultsToUpstash(blob, upstash, { execute: true });

      const stored = upstash.store.get(`vault:${VAULT_ID_A}`);
      expect(typeof stored).toBe("string");
      expect(stored).toBe(SAMPLE_PAYLOAD_A);
    });

    it("only migrates files matching the vaults/<64-hex-chars>.json pattern", async () => {
      // Defensive: if some other tooling left non-vault blobs under the
      // vaults/ prefix (debugging files, accidental writes, attacker
      // probes), we don't try to write them as vaults.
      const blob = fakeBlobClient(
        [
          { pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/good", size: 100 },
          { pathname: "vaults/not-a-vault-id.json", url: "https://blob/bad1", size: 100 },
          { pathname: "vaults/debug.txt", url: "https://blob/bad2", size: 100 },
          { pathname: "vaults/UPPERCASE-NOT-HEX.json", url: "https://blob/bad3", size: 100 },
        ],
        {
          "https://blob/good": SAMPLE_PAYLOAD_A,
          "https://blob/bad1": "garbage",
          "https://blob/bad2": "garbage",
          "https://blob/bad3": "garbage",
        },
      );
      const upstash = fakeUpstashClient();

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
      });

      expect(result.migrated).toBe(1);
      expect(upstash.store.size).toBe(1);
      expect(upstash.store.has(`vault:${VAULT_ID_A}`)).toBe(true);
      expect(result.skipped).toBe(3);
    });
  });

  describe("execute mode with deleteBlob", () => {
    it("deletes the Blob original ONLY after a successful Upstash write", async () => {
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash = fakeUpstashClient();

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
        deleteBlob: true,
      });

      expect(result.deleted).toBe(1);
      expect(blob.deleted).toEqual([`vaults/${VAULT_ID_A}.json`]);
    });

    it("does NOT delete the Blob original if the Upstash write failed", async () => {
      // Safety floor: if Upstash rejects the write, the Blob original
      // stays put so we can retry. Premature deletion would lose data.
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash: UpstashSetClient = {
        async set() {
          throw new Error("upstash down");
        },
      };
      const blobWithDeleted = blob;

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
        deleteBlob: true,
      });

      expect(result.failed.length).toBe(1);
      expect(result.deleted).toBe(0);
      expect(blobWithDeleted.deleted).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("continues after a single fetch failure, reporting which vault failed", async () => {
      // One bad blob shouldn't poison the rest of the migration.
      const blob = fakeBlobClient(
        [
          { pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 },
          { pathname: `vaults/${VAULT_ID_B}.json`, url: "https://blob/missing", size: 100 },
        ],
        { "https://blob/a": SAMPLE_PAYLOAD_A }, // missing url not in contents
      );
      const upstash = fakeUpstashClient();

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
      });

      expect(result.migrated).toBe(1);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].vaultId).toBe(VAULT_ID_B);
    });

    it("is idempotent — running twice on the same data produces the same end state", async () => {
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash = fakeUpstashClient();

      await migrateBlobVaultsToUpstash(blob, upstash, { execute: true });
      const firstSnapshot = upstash.store.get(`vault:${VAULT_ID_A}`);

      await migrateBlobVaultsToUpstash(blob, upstash, { execute: true });
      const secondSnapshot = upstash.store.get(`vault:${VAULT_ID_A}`);

      expect(secondSnapshot).toBe(firstSnapshot);
      expect(upstash.store.size).toBe(1);
    });
  });

  describe("skip-if-present (idempotent, post-hoc safety)", () => {
    // After the first migration run we discovered that ~4 vaults existed
    // in BOTH Blob and Upstash (users who had pre-#45 vaults AND re-pushed
    // to Upstash after #45). The naive script overwrote the Upstash entry
    // with the older Blob copy — a small data-staleness window until the
    // client re-pushed. This option closes that window: skip if the
    // Upstash key already exists.

    function fakeUpstashWithGet(
      existing: Record<string, string> = {},
    ): UpstashSetClient & {
      store: Map<string, string>;
      get(key: string): Promise<string | null>;
    } {
      const store = new Map(Object.entries(existing));
      return {
        store,
        async get(key: string) {
          return store.has(key) ? (store.get(key) as string) : null;
        },
        async set(key, value) {
          store.set(key, String(value));
          return "OK";
        },
      };
    }

    it("skips vaults already present in Upstash when skipExisting:true", async () => {
      const blob = fakeBlobClient(
        [
          { pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 },
          { pathname: `vaults/${VAULT_ID_B}.json`, url: "https://blob/b", size: 100 },
        ],
        { "https://blob/a": SAMPLE_PAYLOAD_A, "https://blob/b": SAMPLE_PAYLOAD_B },
      );
      const upstash = fakeUpstashWithGet({
        [`vault:${VAULT_ID_A}`]: "FRESH_FROM_UPSTASH_DO_NOT_OVERWRITE",
      });

      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
        skipExisting: true,
      });

      expect(result.found).toBe(2);
      expect(result.migrated).toBe(1); // only VAULT_ID_B
      expect(result.skippedExisting).toBe(1); // VAULT_ID_A
      // The fresh Upstash value must be intact.
      expect(upstash.store.get(`vault:${VAULT_ID_A}`)).toBe(
        "FRESH_FROM_UPSTASH_DO_NOT_OVERWRITE",
      );
      expect(upstash.store.get(`vault:${VAULT_ID_B}`)).toBe(SAMPLE_PAYLOAD_B);
    });

    it("default (skipExisting:false) preserves the prior overwrite behavior", async () => {
      // Old behavior: overwrite. Kept as default for backward compat with
      // the (already-run) initial migration; new runs should opt in.
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash = fakeUpstashWithGet({
        [`vault:${VAULT_ID_A}`]: "fresh",
      });
      await migrateBlobVaultsToUpstash(blob, upstash, { execute: true });
      // Overwrote with Blob copy.
      expect(upstash.store.get(`vault:${VAULT_ID_A}`)).toBe(SAMPLE_PAYLOAD_A);
    });

    it("skipExisting also prevents deleting the Blob original (we'd be deleting a backup)", async () => {
      // If we skip the Upstash write because Upstash already has a fresher
      // copy, the Blob copy is the OLDER one — and we shouldn't delete it
      // (it's not authoritative, but it's still a backup). Delete only
      // fires after a successful WRITE this run.
      const blob = fakeBlobClient(
        [{ pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 }],
        { "https://blob/a": SAMPLE_PAYLOAD_A },
      );
      const upstash = fakeUpstashWithGet({
        [`vault:${VAULT_ID_A}`]: "fresh",
      });
      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
        skipExisting: true,
        deleteBlob: true,
      });
      expect(result.skippedExisting).toBe(1);
      expect(result.deleted).toBe(0);
      expect(blob.deleted).toEqual([]);
    });
  });

  describe("pagination", () => {
    it("iterates Blob's paginated list until hasMore is false", async () => {
      // Production Vercel Blob returns ~1000 per page. The migration must
      // follow cursors to avoid silently undercounting.
      const listSpy = vi.fn();
      const blob: BlobListClient = {
        list: listSpy,
        fetchUrl: async (url) => {
          const id = url.split("/").pop()!;
          return JSON.stringify({ ok: true, vault: { id } });
        },
        del: async () => {},
      };
      listSpy.mockResolvedValueOnce({
        blobs: [
          { pathname: `vaults/${VAULT_ID_A}.json`, url: "https://blob/a", size: 100 },
        ],
        hasMore: true,
        cursor: "cursor-page-2",
      });
      listSpy.mockResolvedValueOnce({
        blobs: [
          { pathname: `vaults/${VAULT_ID_B}.json`, url: "https://blob/b", size: 100 },
        ],
        hasMore: false,
        cursor: undefined,
      });

      const upstash = fakeUpstashClient();
      const result = await migrateBlobVaultsToUpstash(blob, upstash, {
        execute: true,
      });

      expect(result.found).toBe(2);
      expect(result.migrated).toBe(2);
      expect(listSpy).toHaveBeenCalledTimes(2);
      // Second call passes the cursor from the first response.
      expect(listSpy.mock.calls[1][0]).toEqual(
        expect.objectContaining({ cursor: "cursor-page-2" }),
      );
    });
  });
});
