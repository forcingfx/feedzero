import { type Result } from "../../utils/result";
import {
  type LicenseRecord,
  type LicenseStorage,
} from "./storage";

// TODO(phase-0): Wire a real KV client once the provider is selected.
// `@vercel/kv` is deprecated upstream (migrating to Upstash Redis via the
// Vercel Marketplace integration). We do not want to install a deprecated
// dep, and we do not want to silently no-op a license store. So this file
// compiles, satisfies the LicenseStorage interface, and throws loudly on
// every method until the integration ships.
//
// When wiring:
//   1. Install the chosen Redis client and add it to scripts/build-api.js
//      `external` array (Vercel-provided runtime package).
//   2. Replace the bodies below with real KV calls. Keys:
//        license:record:<keyId>   -> JSON-encoded LicenseRecord
//        license:revoked:<keyId>  -> reason string (presence == revoked)
//   3. In tests/core/license/storage-vercel-kv.test.ts, replace the stub
//      assertions with `runStorageContractTests("VercelKVLicenseStorage",
//      () => new VercelKVLicenseStorage())` (skip when KV env unavailable).
//
// See docs/internal/strategy.md §6.3, §6.4, §6.5 and runbook.md
// "deny-list" entry for the operational contract.
//
// import { kv } from "@vercel/kv";

/**
 * Internal sentinel: every method throws this until a real KV client is
 * wired. Centralised so the message stays consistent and the regex in
 * tests/core/license/storage-vercel-kv.test.ts matches a single source.
 */
function notWired(): never {
  throw new Error(
    "KV client not yet wired — install a Redis integration (Upstash via " +
      "Vercel Marketplace) and replace VercelKVLicenseStorage method bodies.",
  );
}

/**
 * KV-backed implementation of {@link LicenseStorage}. Stub today; see the
 * top-of-file TODO for the migration path.
 */
export class VercelKVLicenseStorage implements LicenseStorage {
  async put(_record: LicenseRecord): Promise<Result<void>> {
    notWired();
  }

  async get(_keyId: string): Promise<Result<LicenseRecord | null>> {
    notWired();
  }

  async listByCustomer(
    _customerId: string,
  ): Promise<Result<LicenseRecord[]>> {
    notWired();
  }

  async revoke(_keyId: string, _reason: string): Promise<Result<void>> {
    notWired();
  }

  async revokeAllForCustomer(
    _customerId: string,
    _reason: string,
  ): Promise<Result<void>> {
    notWired();
  }

  async isRevoked(_keyId: string): Promise<Result<boolean>> {
    notWired();
  }
}
