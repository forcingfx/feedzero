import fs from "node:fs";
import path from "node:path";
import { ok, err } from "../../../utils/result.ts";
import type { SyncStorageAdapter } from "../types.ts";

const VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;

function validateVaultId(vaultId: string): boolean {
  return VAULT_ID_PATTERN.test(vaultId);
}

/**
 * Filesystem storage adapter for self-hosting.
 * Stores vaults as JSON files under `{dataDir}/vaults/{vaultId}.json`.
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
      try {
        fs.mkdirSync(vaultsDir, { recursive: true });
        fs.writeFileSync(
          path.join(vaultsDir, `${vaultId}.json`),
          data,
          "utf-8",
        );
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
  };
}
