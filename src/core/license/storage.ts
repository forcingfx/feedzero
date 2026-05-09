import { type Result } from "../../utils/result";

/**
 * A single issued license. The runtime license-check endpoint reads these
 * records to decide whether a key is still valid; the deny-list (see
 * {@link LicenseStorage.isRevoked}) is checked separately so revocation can
 * fan out faster than a full record write.
 *
 * See `docs/internal/strategy.md` §6.3 (license-key model) and §6.4 (kill
 * switches / revocation) for the surrounding design.
 */
export interface LicenseRecord {
  keyId: string;
  /** Stripe customer id (e.g. `cus_...`). Used for re-issue and audit. */
  customerId: string;
  tier: "free" | "personal" | "pro";
  status: "active" | "revoked" | "expired";
  issuedAtSec: number;
  expirySec: number;
  /** When the license was last touched on the server (revoke, renew). */
  updatedAtSec: number;
}

/**
 * Storage abstraction for license records and the revocation deny-list.
 *
 * Implementations must satisfy the contract encoded in
 * `tests/core/license/storage.test.ts` (the `runStorageContractTests` suite).
 * In particular:
 *  - `get` returns `ok(null)` for unknown keys (not an error).
 *  - `revoke` is one-way and idempotent.
 *  - `revoke` never deletes the underlying record — auditability is required.
 */
export interface LicenseStorage {
  /** Persist a new or updated record. Returns Result for storage errors. */
  put(record: LicenseRecord): Promise<Result<void>>;

  /**
   * Look up by keyId. Returns `ok(null)` if not found, `err` on storage
   * error. "Not found" is a normal control-flow signal, not an error.
   */
  get(keyId: string): Promise<Result<LicenseRecord | null>>;

  /** Add to revocation deny-list. Idempotent. */
  revoke(keyId: string, reason: string): Promise<Result<void>>;

  /**
   * Returns `ok(true)` if the keyId is on the deny-list, `ok(false)`
   * otherwise (including for keyIds we have never seen).
   */
  isRevoked(keyId: string): Promise<Result<boolean>>;
}

/**
 * In-memory adapter. Used by tests, the dev server, and as the reference
 * implementation that pins the contract. Production uses
 * `VercelKVLicenseStorage` from `./storage-vercel-kv.ts`.
 */
export class MemoryLicenseStorage implements LicenseStorage {
  private readonly records = new Map<string, LicenseRecord>();
  private readonly denyList = new Set<string>();

  async put(record: LicenseRecord): Promise<Result<void>> {
    this.records.set(record.keyId, { ...record });
    return { ok: true, value: undefined };
  }

  async get(keyId: string): Promise<Result<LicenseRecord | null>> {
    const record = this.records.get(keyId);
    return { ok: true, value: record ? { ...record } : null };
  }

  async revoke(keyId: string, _reason: string): Promise<Result<void>> {
    this.denyList.add(keyId);
    return { ok: true, value: undefined };
  }

  async isRevoked(keyId: string): Promise<Result<boolean>> {
    return { ok: true, value: this.denyList.has(keyId) };
  }
}
