// @vitest-environment node
import { describe, it, expect } from "vitest";
import { SYNC } from "@feedzero/core/utils/constants";
import { unwrap } from "@feedzero/core/utils/result";
import {
  encodePushBody,
  PUSH_ENCODING_HEADER,
  PUSH_ENCODING_GZIP,
} from "@/core/sync/vault-transport";

/**
 * Pin `SYNC.MAX_PUSH_BODY_SIZE` against the deployed platform.
 *
 * The hosted backend runs on Vercel, which rejects a serverless request
 * body over 4.5 MB at the edge with `413 FUNCTION_PAYLOAD_TOO_LARGE`
 * before any handler code runs. That number lives in Vercel's platform
 * config, not in this repo, so no unit test can hold it: the client
 * ceiling is a *belief* about someone else's service, which is exactly
 * the class of belief the Tier 2.5 rule says to verify against the real
 * endpoint.
 *
 * The bodies here are deliberately UNCOMPRESSED, even though the client
 * now gzips its pushes. The platform limit applies to bytes received, so
 * the uncompressed path is the worst case and the one worth pinning; a
 * compressed push of the same vault is strictly smaller.
 *
 * Two assertions, one on each side of the ceiling:
 *  1. A body at exactly the ceiling we ship is accepted in production.
 *     If Vercel ever tightens the limit, this fails and every paying
 *     user with a large vault is about to lose sync.
 *  2. A body well above it is rejected with 413 rather than silently
 *     truncated. Truncation is the failure mode that would corrupt a
 *     vault instead of failing it.
 *
 * Skipped by default. Runs with SMOKE_TESTS=1.
 *
 * Side effects (cleaned up in try/finally): one sentinel vault under
 * vault:bbbb… is briefly stored, then deleted.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

/**
 * Sentinel vaultId: 64 same-char hex. Matches isSentinelVaultId() in
 * src/core/sync/migration/sentinel-cleanup.ts, so an interrupted run
 * leaves something the operator cleanup script can identify and remove.
 */
const SENTINEL_VAULT_ID = "b".repeat(64);

/**
 * Comfortably past Vercel's 4.5 MB edge limit AND past the server-side
 * `MAX_VAULT_SIZE` accept limit, so the rejection assertion holds for a
 * self-hosted target (where the handler enforces it) as well as for the
 * hosted one (where the platform does).
 */
const OVERSIZED_BODY_BYTES = SYNC.MAX_VAULT_SIZE + 1024 * 1024;

/**
 * Build a PUT body of exactly `totalBytes`, shaped like a real push:
 * `{vaultId, vault:{version, iv, ciphertext}}` with the ciphertext
 * padded out to hit the target. Every character is ASCII, so string
 * length is byte length.
 */
function buildBodyOfSize(totalBytes: number): string {
  const envelope = (ciphertext: string) =>
    JSON.stringify({
      vaultId: SENTINEL_VAULT_ID,
      vault: { version: SYNC.FORMAT_VERSION, iv: [1], ciphertext },
    });
  const overhead = envelope("").length;
  return envelope("A".repeat(totalBytes - overhead));
}

describe.skipIf(SKIP)("production /api/sync (live) — payload ceiling", () => {
  it(`accepts a PUT body at the shipped ceiling (${SYNC.MAX_PUSH_BODY_SIZE} bytes)`, async () => {
    const body = buildBodyOfSize(SYNC.MAX_PUSH_BODY_SIZE);
    expect(body.length).toBe(SYNC.MAX_PUSH_BODY_SIZE);

    try {
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    } finally {
      await fetch(`${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }, 120_000);

  it("accepts the compressed transport the client actually sends", async () => {
    // The one assertion no local test can make. `Content-Encoding: gzip`
    // was avoided precisely because a platform or CDN might decompress
    // such a body before the handler runs; this proves the custom header
    // survives the real path and the deployed handler unpacks it. If
    // this fails, every push from a current client is failing.
    const vault = { version: SYNC.FORMAT_VERSION, iv: [1, 2, 3], ciphertext: "A".repeat(4096) };
    const body = unwrap(
      await encodePushBody(
        JSON.stringify({ vaultId: SENTINEL_VAULT_ID, vault }),
      ),
    );

    try {
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          [PUSH_ENCODING_HEADER]: PUSH_ENCODING_GZIP,
        },
        body: body as BodyInit,
      });
      expect(res.status).toBe(200);

      // Stored unpacked, so a device on an older build can still pull it.
      const get = await fetch(
        `${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`,
      );
      expect(get.status).toBe(200);
      expect((await get.json()).vault.ciphertext).toBe(vault.ciphertext);
    } finally {
      await fetch(`${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }, 120_000);

  it("rejects a PUT body above the platform ceiling with 413, not a truncated write", async () => {
    const res = await fetch(`${BASE_URL}/api/sync`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: buildBodyOfSize(OVERSIZED_BODY_BYTES),
    });
    expect(res.status).toBe(413);

    // Nothing was stored under the sentinel id by the rejected write.
    const head = await fetch(
      `${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`,
      { method: "HEAD" },
    );
    expect(head.status).toBe(404);
  }, 120_000);
});
