import { decodePushBody } from "@/core/sync/vault-transport";
import { unwrap } from "@feedzero/core/utils/result";
import type { EncryptedVault } from "@/core/sync/types";

/**
 * Read a PUT body captured from a mocked `fetch`, the way the handler
 * reads it off the wire.
 *
 * Push bodies are gzipped, so a test that wants to look inside one has
 * to decode it. Tests that assert on what the client *sent* go through
 * here; tests that assert the server can *read* it should drive the real
 * `handleSyncRequest` instead (see tests/integration/sync-push-transport).
 */
export async function readPushedBody(
  body: unknown,
): Promise<{ vaultId: string; vault: EncryptedVault; _pad?: string }> {
  if (!(body instanceof Uint8Array)) {
    throw new Error(
      `Expected a compressed push body, got ${typeof body}. The client ` +
        `PUTs gzipped bytes — see src/core/sync/vault-transport.ts.`,
    );
  }
  return JSON.parse(unwrap(await decodePushBody(body, 16 * 1024 * 1024)));
}
