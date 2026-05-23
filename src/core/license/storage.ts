import { type Result } from "../../../packages/core/src/utils/result";
import { markTestOnly } from "../test-only-brand";

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
  /**
   * Stripe subscription id (e.g. `sub_...`). Used to map renewal/cancellation
   * webhook events back to the issued record. Optional only because records
   * issued before this field was added do not carry it.
   */
  subscriptionId?: string;
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

  /**
   * Return every record issued for a customer, in unspecified order. Used by
   * the issuer to map Stripe webhook events (which arrive keyed by customerId
   * + subscriptionId) back to the corresponding records. Returns `ok([])`
   * when the customer has no records.
   *
   * Production KV implementations should back this with a customerId →
   * keyId secondary index rather than scanning all records.
   */
  listByCustomer(customerId: string): Promise<Result<LicenseRecord[]>>;

  /** Add to revocation deny-list. Idempotent. */
  revoke(keyId: string, reason: string): Promise<Result<void>>;

  /**
   * Add every record issued for a customer to the revocation deny-list.
   * Idempotent. Used when a customer's subscription is fully cancelled and
   * we want to invalidate every license they hold (re-issued tokens, lost
   * device replacements, etc.) in one operation.
   */
  revokeAllForCustomer(
    customerId: string,
    reason: string,
  ): Promise<Result<void>>;

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
 *
 * Branded test-only so resolveLicenseStorage refuses to return it in
 * production — see src/core/test-only-brand.ts.
 */
export class MemoryLicenseStorage implements LicenseStorage {
  private readonly records = new Map<string, LicenseRecord>();
  private readonly denyList = new Set<string>();

  constructor() {
    markTestOnly(this);
  }

  async put(record: LicenseRecord): Promise<Result<void>> {
    this.records.set(record.keyId, { ...record });
    return { ok: true, value: undefined };
  }

  async get(keyId: string): Promise<Result<LicenseRecord | null>> {
    const record = this.records.get(keyId);
    return { ok: true, value: record ? { ...record } : null };
  }

  async listByCustomer(
    customerId: string,
  ): Promise<Result<LicenseRecord[]>> {
    const matches: LicenseRecord[] = [];
    for (const record of this.records.values()) {
      if (record.customerId === customerId) matches.push({ ...record });
    }
    return { ok: true, value: matches };
  }

  async revoke(keyId: string, _reason: string): Promise<Result<void>> {
    this.denyList.add(keyId);
    return { ok: true, value: undefined };
  }

  async revokeAllForCustomer(
    customerId: string,
    _reason: string,
  ): Promise<Result<void>> {
    for (const record of this.records.values()) {
      if (record.customerId === customerId) this.denyList.add(record.keyId);
    }
    return { ok: true, value: undefined };
  }

  async isRevoked(keyId: string): Promise<Result<boolean>> {
    return { ok: true, value: this.denyList.has(keyId) };
  }
}
