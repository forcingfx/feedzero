/**
 * License issuer.
 *
 * Composes {@link signLicense} with a {@link LicenseStorage} to satisfy the
 * `LicenseIssuer` contract that `src/core/stripe/webhook-handler.ts`
 * dispatches to. The Stripe webhook is the only production caller today;
 * an admin endpoint will reuse this for manual issue/revoke flows.
 *
 * Idempotency note: `issue` is intentionally not idempotent on its own. If
 * Stripe retries `customer.subscription.created` we will mint a second
 * token for the same subscription. Both tokens stay valid; this is
 * acceptable for MVP and tracked as a follow-up — see
 * `docs/internal/strategy.md` §6.3 for the design and §5 for the broader
 * idempotency principle. A future PR can short-circuit by looking up the
 * existing record via `LicenseStorage.listByCustomer` filtered by
 * `subscriptionId`.
 *
 * `recordRenewal` is idempotent on `(customerId, subscriptionId)`: it
 * updates the existing record's expiry, or — if a renewal arrives before
 * the create event (Stripe race) — falls back to issuing a fresh license
 * with the new expiry.
 */

import { signLicense, type SigningKey } from "./sign";
import type {
  LicenseRecord,
  LicenseStorage,
} from "./storage";
import type { LicenseIssuer } from "../stripe/webhook-handler";
import { ok, type Result } from "../../utils/result";

/** 31 days. Matches a typical Stripe billing cycle plus grace. */
const DEFAULT_EXPIRY_SEC = 31 * 24 * 3600;
const KEY_ID_BYTE_LENGTH = 16;

export interface IssuerConfig {
  signingKey: SigningKey;
  storage: LicenseStorage;
  /**
   * Default expiry (seconds from now) for newly-issued licenses. Caller can
   * override per call. Defaults to 31 days.
   */
  defaultExpirySec?: number;
  /** Caller-injected for testability. Defaults to `Math.floor(Date.now()/1000)`. */
  nowSec?: () => number;
  /** Caller-injected for testability. Defaults to a 32-char hex from `crypto.getRandomValues`. */
  generateKeyId?: () => string;
}

export interface IssueResult {
  /** The signed wire token to deliver to the customer. */
  token: string;
  /** Echo of the storage record that was persisted. */
  record: LicenseRecord;
}

interface IssueArgs {
  customerId: string;
  tier: "personal" | "pro";
  subscriptionId: string;
  /** Optional override for this issuance only. */
  expirySec?: number;
}

/**
 * Concrete `LicenseIssuer`. Pure composition over `signLicense` and
 * `LicenseStorage` — no side channels (no email send, no logging) so it
 * stays trivially testable.
 */
export class LicenseIssuerImpl implements LicenseIssuer {
  private readonly signingKey: SigningKey;
  private readonly storage: LicenseStorage;
  private readonly defaultExpirySec: number;
  private readonly nowSec: () => number;
  private readonly generateKeyId: () => string;

  constructor(config: IssuerConfig) {
    this.signingKey = config.signingKey;
    this.storage = config.storage;
    this.defaultExpirySec = config.defaultExpirySec ?? DEFAULT_EXPIRY_SEC;
    this.nowSec = config.nowSec ?? defaultNowSec;
    this.generateKeyId = config.generateKeyId ?? defaultGenerateKeyId;
  }

  /**
   * Issue a fresh license token, persist the record, and return both. The
   * admin endpoint and `recordRenewal`'s fallback path use this directly;
   * the Stripe webhook uses {@link issue} (which discards the token).
   */
  async issueWithToken(args: IssueArgs): Promise<Result<IssueResult>> {
    return this.mintAndPersist(args);
  }

  /**
   * Interface method called by the Stripe webhook. The token is delivered
   * to the customer out of band (email), so the webhook only needs to know
   * issuance succeeded.
   */
  async issue(args: IssueArgs): Promise<Result<void>> {
    const result = await this.mintAndPersist(args);
    return result.ok ? ok(undefined) : result;
  }

  /**
   * Revoke every license currently issued to `customerId`. The
   * subscriptionId is accepted for parity with the Stripe webhook contract
   * but is intentionally ignored: today we don't carry an index from
   * subscription → keyId, so we revoke at the customer level. This is
   * conservative — a customer with multiple subscriptions cancelled for
   * one will lose all licenses. Revisit when multi-subscription customers
   * become a real use case (currently they don't).
   */
  async revoke(args: {
    customerId: string;
    subscriptionId: string;
    reason: string;
  }): Promise<Result<void>> {
    return this.storage.revokeAllForCustomer(args.customerId, args.reason);
  }

  /**
   * Update the matching record's expiry. If no record matches (Stripe
   * raced the create event), fall back to issuing a fresh license with
   * the new expiry — that keeps the (customerId, subscriptionId) →
   * active-license invariant holding even under reordered events.
   */
  async recordRenewal(args: {
    customerId: string;
    subscriptionId: string;
    expirySec: number;
  }): Promise<Result<void>> {
    const existing = await this.findActiveRecordForSubscription(
      args.customerId,
      args.subscriptionId,
    );
    if (!existing.ok) return existing;

    if (existing.value === null) {
      return this.issue({
        customerId: args.customerId,
        subscriptionId: args.subscriptionId,
        // Renewals don't carry tier, so we default to personal for the
        // fallback-issue path. Revisit when we surface tier on renewal events.
        tier: "personal",
        expirySec: args.expirySec,
      });
    }

    const updated: LicenseRecord = {
      ...existing.value,
      expirySec: args.expirySec,
      updatedAtSec: this.nowSec(),
    };
    return this.storage.put(updated);
  }

  private async mintAndPersist(
    args: IssueArgs,
  ): Promise<Result<IssueResult>> {
    const issuedAtSec = this.nowSec();
    const expirySec = args.expirySec ?? issuedAtSec + this.defaultExpirySec;
    const keyId = this.generateKeyId();

    const record: LicenseRecord = {
      keyId,
      customerId: args.customerId,
      subscriptionId: args.subscriptionId,
      tier: args.tier,
      status: "active",
      issuedAtSec,
      expirySec,
      updatedAtSec: issuedAtSec,
    };

    const stored = await this.storage.put(record);
    if (!stored.ok) return stored;

    const token = await signLicense(
      {
        tier: args.tier,
        customerId: args.customerId,
        keyId,
        issuedAtSec,
        expirySec,
      },
      this.signingKey,
    );

    return ok({ token, record });
  }

  private async findActiveRecordForSubscription(
    customerId: string,
    subscriptionId: string,
  ): Promise<Result<LicenseRecord | null>> {
    const list = await this.storage.listByCustomer(customerId);
    if (!list.ok) return list;
    const match = list.value.find(
      (r) => r.subscriptionId === subscriptionId && r.status === "active",
    );
    return ok(match ?? null);
  }
}

function defaultNowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 32-char hex (16 random bytes). Matches the existing keyId convention used
 * by `tests/core/license/sign.test.ts` and the `LicensePayload.keyId` JSDoc.
 */
function defaultGenerateKeyId(): string {
  const bytes = new Uint8Array(KEY_ID_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
