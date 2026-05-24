/**
 * Typed accessors for user-supplied secrets persisted in the encrypted
 * `secrets` Dexie table.
 *
 * The raw secret value never touches localStorage and never leaves the
 * browser except in the explicit user-initiated request the secret was
 * supplied for (e.g. the Anthropic API key rides on the
 * `Authorization` header of the user-initiated briefing-refresh call).
 *
 * Adding a new secret: add a stable name constant and a typed
 * get/set/clear trio that wraps `getSecret/putSecret/removeSecret`.
 */

import { err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { getSecret, putSecret, removeSecret } from "./db";

const ANTHROPIC_API_KEY = "anthropic-api-key";

/**
 * Read the user-supplied Anthropic API key.
 * Returns `ok(null)` when no key is stored (first run, or after clear).
 */
export function getAnthropicKey(): Promise<Result<string | null>> {
  return getSecret(ANTHROPIC_API_KEY);
}

/**
 * Persist the user-supplied Anthropic API key. Trims surrounding
 * whitespace (paste-quirks) and rejects empty values so the UI never
 * stores a key that will silently auth-fail at the Anthropic boundary.
 */
export async function setAnthropicKey(key: string): Promise<Result<boolean>> {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) return err("Anthropic API key cannot be empty");
  return putSecret(ANTHROPIC_API_KEY, trimmed);
}

/** Remove the user-supplied Anthropic API key. */
export function clearAnthropicKey(): Promise<Result<boolean>> {
  return removeSecret(ANTHROPIC_API_KEY);
}
