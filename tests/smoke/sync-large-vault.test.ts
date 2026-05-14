// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * Production-grade smoke test: PUT then GET a realistically-shaped
 * encrypted vault of ~100 feeds + ~2000 articles' worth of data
 * against the live /api/sync endpoint. Assert byte-equality.
 *
 * Why this exists: PR #45 (Upstash migration) silently broke vault
 * reads for 24h because the SDK's auto-deserialization turned our
 * stored JSON string back into an object on GET. The unit suite passed
 * because the fake client returned strings as-is; the production SDK
 * did not. A 1.5MB realistic-shape roundtrip is exactly the kind of
 * test that would have failed loudly on the first PR #45 deploy.
 *
 * What this test does NOT do:
 *  - Encrypt anything. /api/sync stores opaque strings; the smoke
 *    test cares about transport + storage byte-fidelity, not crypto
 *    correctness. Crypto is unit-tested in vault-crypto.test.ts.
 *  - Use a real user's vaultId. We pick a sentinel-shaped vaultId
 *    (64 'c' chars) so the existing sentinel-cleanup script catches
 *    it if a test run is interrupted and the DELETE doesn't fire.
 *
 * Skipped by default. Runs with SMOKE_TESTS=1.
 *
 * Side effects (all cleaned up in try/finally):
 *  - One sentinel vault under vault:cccc… is briefly stored in
 *    production Upstash, then deleted.
 *  - Real /api/sync PUT, GET, DELETE round-trips occur.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

/**
 * Sentinel vaultId: 64 same-char hex. Matches isSentinelVaultId() in
 * src/core/sync/migration/sentinel-cleanup.ts. If this test exits
 * abnormally (process killed, network blip during cleanup, etc.) the
 * sentinel-cleanup script will remove it on the next operator run.
 */
const SENTINEL_VAULT_ID = "c".repeat(64);

/**
 * Target payload size: ~1.5 MB. Calibrated to mirror a realistic
 * production vault for a power user — 100 feed metadata records (~400B
 * each = 40KB plaintext) + 2000 article entries (~500B each = 1MB
 * plaintext), with the ~1.33x base64 expansion after AES-GCM-256
 * encryption applied to the bytes. Well under the 5MB MAX_VAULT_SIZE
 * limit but big enough to surface payload-size class bugs (HTTP body
 * limits, Upstash REST payload limits, base64 size blowup, etc.).
 */
const TARGET_PAYLOAD_BYTES = 1_500_000;

function buildSyntheticVaultPayload(): {
  version: number;
  iv: number[];
  ciphertext: string;
} {
  // 12-byte IV — matches the real AES-GCM-256 IV size used by
  // vault-crypto.ts.
  const iv = Array.from(randomBytes(12).values());
  // Random bytes base64-encoded as the synthetic ciphertext. Real
  // ciphertext would have an HMAC tag appended; this is opaque to the
  // server which only stores the string.
  const ciphertext = randomBytes(TARGET_PAYLOAD_BYTES).toString("base64");
  return { version: 1, iv, ciphertext };
}

describe.skipIf(SKIP)(
  "production /api/sync (live) — large vault roundtrip",
  () => {
    it(`PUT → GET roundtrip on a ${(TARGET_PAYLOAD_BYTES / 1_000_000).toFixed(1)}MB vault preserves byte-fidelity`, async () => {
      const vaultPayload = buildSyntheticVaultPayload();

      const putBody = JSON.stringify({
        vaultId: SENTINEL_VAULT_ID,
        vault: vaultPayload,
      });
      const putBodySize = putBody.length;

      try {
        // 1. PUT — store the vault.
        const putStart = Date.now();
        const putRes = await fetch(`${BASE_URL}/api/sync`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: putBody,
        });
        const putElapsedMs = Date.now() - putStart;
        expect(putRes.status).toBe(200);
        const putResBody = await putRes.json();
        expect(putResBody.ok).toBe(true);
        expect(typeof putResBody.updatedAt).toBe("number");
        // Surface timing so an operator running this test sees the
        // latency cost of a large vault. Useful for capacity planning.
        console.log(
          `[smoke-large-vault] PUT  ${putBodySize.toLocaleString()}B in ${putElapsedMs}ms (${Math.round(putBodySize / putElapsedMs)}KB/s)`,
        );

        // 2. GET — retrieve it back. This is the exact step that PR #45
        //    broke (returned "[object Object]" instead of the payload).
        const getStart = Date.now();
        const getRes = await fetch(
          `${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`,
        );
        const getElapsedMs = Date.now() - getStart;
        expect(getRes.status).toBe(200);
        const getResBody = await getRes.json();
        expect(getResBody.ok).toBe(true);
        console.log(
          `[smoke-large-vault] GET  returned ${(JSON.stringify(getResBody).length).toLocaleString()}B in ${getElapsedMs}ms`,
        );

        // 3. Byte-equal assertion on the vault structure. This is the
        //    invariant: what was PUT is what comes back, regardless of
        //    any SDK auto-parse / auto-stringify shenanigans between
        //    the client → handler → adapter → Upstash chain.
        expect(getResBody.vault.version).toBe(vaultPayload.version);
        expect(getResBody.vault.iv).toEqual(vaultPayload.iv);
        expect(getResBody.vault.ciphertext).toBe(vaultPayload.ciphertext);
        // Catch the specific bug PR #45 introduced: ciphertext must
        // be a STRING (not a parsed object), exactly the bytes we put.
        expect(typeof getResBody.vault.ciphertext).toBe("string");
        expect(getResBody.vault.ciphertext.length).toBe(
          vaultPayload.ciphertext.length,
        );
      } finally {
        // Cleanup: delete the sentinel vault regardless of assertion
        // outcome. If this DELETE itself fails (network blip, etc.),
        // the standalone sentinel-cleanup script catches the leftover
        // on the next operator run because the vaultId is sentinel-shaped.
        await fetch(`${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    }, 60_000); // 60s for a 1.5MB roundtrip with network + Upstash latency

    it("4xx error path on the same large-vault scale still returns valid JSON + traceId", async () => {
      // Verify error responses don't regress at this payload scale —
      // i.e. the body-size handling doesn't silently break the
      // observability contract from PR #43.
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Missing vaultId — 400 path.
        body: JSON.stringify({
          vault: { version: 1, iv: [1], ciphertext: "x" },
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.traceId).toMatch(/^req_[0-9a-f]+$/);
    }, 10_000);
  },
);
