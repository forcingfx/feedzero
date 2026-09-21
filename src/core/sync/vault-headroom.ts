import { SYNC } from "../../../packages/core/src/utils/constants";

/**
 * How close a vault is to the size at which it stops syncing.
 *
 * This is the whole of FeedZero's "monitoring" for vault size, and it
 * runs on the user's device. Server-side metering would mean recording
 * per-user sizes, which is the behavioural telemetry the product
 * promises not to collect — so the number is computed here, shown here,
 * and never sent anywhere.
 *
 * It is measured from the last push rather than by re-encrypting on
 * demand: an accurate answer costs an export, an encrypt and a gzip of
 * the whole vault, which is seconds of CPU for the case this is meant
 * to warn about.
 */

/** Human-readable size, matching the wording of the oversize error. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Fraction of the ceiling at which the UI starts warning. Early enough
 * that a user still has room to act, late enough that it is not noise:
 * a vault at four fifths of the limit is one busy week from the wall.
 */
const WARN_FRACTION = 0.8;

export type HeadroomLevel = "ok" | "warn" | "full";

export interface VaultHeadroom {
  bytes: number;
  limitBytes: number;
  /** 0–100, clamped: a vault over the limit reads as 100, never 140. */
  percentUsed: number;
  level: HeadroomLevel;
  usedLabel: string;
  limitLabel: string;
}

export function measureVaultHeadroom(bytes: number): VaultHeadroom {
  const limitBytes = SYNC.MAX_PUSH_BODY_SIZE;
  const fraction = bytes / limitBytes;

  return {
    bytes,
    limitBytes,
    percentUsed: Math.min(100, Math.round(fraction * 100)),
    level: fraction >= 1 ? "full" : fraction >= WARN_FRACTION ? "warn" : "ok",
    usedLabel: formatMegabytes(bytes),
    limitLabel: formatMegabytes(limitBytes),
  };
}
