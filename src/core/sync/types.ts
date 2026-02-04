import type { Feed, Article } from "../../types/index.ts";
import type { Result } from "../../utils/result.ts";

/** Plaintext vault structure before encryption (client-side only). */
export interface VaultData {
  version: number;
  exportedAt: number;
  feeds: Feed[];
  articles: Article[];
}

/** Encrypted vault as stored on the server. */
export interface EncryptedVault {
  version: number;
  iv: number[];
  ciphertext: string;
}

/** Server response shape for sync API. */
export interface SyncResponse {
  ok: boolean;
  error?: string;
  vault?: EncryptedVault;
  updatedAt?: number;
}

/** Storage adapter interface for vault persistence (server-side). */
export interface SyncStorageAdapter {
  get(vaultId: string): Promise<Result<string | null>>;
  put(vaultId: string, data: string): Promise<Result<boolean>>;
}
