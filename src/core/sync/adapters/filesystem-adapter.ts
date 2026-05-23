import fs from "node:fs";
import path from "node:path";
import { ok, err } from "../../../../packages/core/src/utils/result";
import type { SyncStorageAdapter } from "../types.ts";

const VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;
const TMP_PREFIX = ".tmp-";

function validateVaultId(vaultId: string): boolean {
  return VAULT_ID_PATTERN.test(vaultId);
}

/**
 * Filesystem storage adapter for self-hosting.
 * Stores vaults as JSON files under `{dataDir}/vaults/{vaultId}.json`.
 *
 * Atomicity contract (see SyncStorageAdapter): every `put` writes to a
 * sibling tmp file then `rename`s it onto the destination. `rename` is
 * atomic within a single directory on POSIX, so a concurrent reader (a
 * second process, an external `cat`, a worker thread) either sees the
 * previous inode or the new one, never a half-written body. Without
 * this — i.e. with a bare `writeFileSync` — the destination file goes
 * through a 0-byte state between truncate and write, which produced
 * the `JSON.parse: unterminated string` errors reported in issue #117.
 *
 * Crash-recovery: orphan `${TMP_PREFIX}*` files left by an interrupted
 * write are ignored by `count()` and overwritten on the next `put`.
 */
export function createFilesystemAdapter(dataDir: string): SyncStorageAdapter {
  const vaultsDir = path.join(dataDir, "vaults");

  return {
    async get(vaultId) {
      if (!validateVaultId(vaultId)) {
        return err("Invalid vault ID");
      }
      const filePath = path.join(vaultsDir, `${vaultId}.json`);
      try {
        const data = fs.readFileSync(filePath, "utf-8");
        return ok(data);
      } catch (e) {
        if ((e as { code?: string }).code === "ENOENT") {
          return ok(null);
        }
        return err(`Failed to read vault: ${(e as Error).message}`);
      }
    },

    async put(vaultId, data) {
      if (!validateVaultId(vaultId)) {
        return err("Invalid vault ID");
      }
      const destPath = path.join(vaultsDir, `${vaultId}.json`);
      // Same-directory tmp file so `rename` stays within one filesystem
      // (POSIX guarantees atomicity only for same-volume renames). The
      // pid + random suffix prevents collisions if multiple processes
      // (or threads) race on the same vaultId. `flag: 'wx'` makes the
      // open fail rather than silently reuse an existing tmp file, so
      // we never write to a stale fd from a previous crash.
      const tmpPath = path.join(
        vaultsDir,
        `${TMP_PREFIX}${process.pid}-${Math.random().toString(36).slice(2)}-${vaultId}`,
      );
      try {
        fs.mkdirSync(vaultsDir, { recursive: true });
        try {
          fs.writeFileSync(tmpPath, data, { encoding: "utf-8", flag: "wx" });
          fs.renameSync(tmpPath, destPath);
        } catch (writeErr) {
          // Best-effort cleanup of the partial tmp; ignore unlink errors
          // since the orphan-sweep on read/count handles leftovers anyway.
          try { fs.rmSync(tmpPath, { force: true }); } catch { /* noop */ }
          throw writeErr;
        }
        return ok(true);
      } catch (e) {
        return err(`Failed to write vault: ${(e as Error).message}`);
      }
    },

    async delete(vaultId) {
      if (!validateVaultId(vaultId)) {
        return err("Invalid vault ID");
      }
      try {
        fs.rmSync(path.join(vaultsDir, `${vaultId}.json`));
        return ok(true);
      } catch (e) {
        if ((e as { code?: string }).code === "ENOENT") {
          return ok(true);
        }
        return err(`Failed to delete vault: ${(e as Error).message}`);
      }
    },

    async count() {
      try {
        const files = fs
          .readdirSync(vaultsDir)
          .filter((f) => f.endsWith(".json") && !f.startsWith(TMP_PREFIX));
        return ok(files.length);
      } catch (e) {
        if ((e as { code?: string }).code === "ENOENT") {
          return ok(0);
        }
        return err(`Failed to count vaults: ${(e as Error).message}`);
      }
    },

    async lastUpdatedAt() {
      try {
        const files = fs
          .readdirSync(vaultsDir)
          .filter((f) => f.endsWith(".json") && !f.startsWith(TMP_PREFIX));
        if (files.length === 0) return ok(null);
        let maxMs = 0;
        for (const f of files) {
          const stat = fs.statSync(path.join(vaultsDir, f));
          if (stat.mtimeMs > maxMs) maxMs = stat.mtimeMs;
        }
        // Floor to an integer ms — Node returns sub-ms precision on Linux,
        // and a stat written between two Date.now() calls can read as
        // strictly greater than the bracketing `Date.now()` upper bound.
        // The adapter contract specifies epoch ms, not nanoseconds.
        return ok(Math.floor(maxMs));
      } catch (e) {
        if ((e as { code?: string }).code === "ENOENT") {
          return ok(null);
        }
        return err(`Failed to read vault timestamps: ${(e as Error).message}`);
      }
    },
  };
}
