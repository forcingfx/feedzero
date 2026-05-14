// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: full PUT → GET → DELETE → GET vault roundtrip against the
 * live /api/sync endpoint. Catches the class of failure where the
 * Upstash adapter is wired but the production env (token, integration
 * status, keyspace) is wrong — exactly the 2026-05-12 sync regression
 * shape.
 *
 * Also asserts the PR #43 observability contract: 404 responses MUST
 * carry a traceId. If the structured-error wiring regresses in some
 * future refactor, this smoke test catches it.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 *
 * Side effects: writes one vault, then deletes it. Uses a unique
 * sentinel ID per run so concurrent test runs don't collide. The
 * cleanup DELETE runs in a try/finally so an assertion failure mid-way
 * still removes the sentinel.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

function sentinelVaultId(): string {
  // 64 hex chars, deterministic per-run but unique-per-run. Mixes a
  // timestamp with a small random tail so two parallel runs don't reuse
  // the same id within the same millisecond.
  const ts = Date.now().toString(16).padStart(16, "0");
  const rand = Math.random().toString(16).slice(2).padStart(16, "0");
  return (ts + rand + "0".repeat(64)).slice(0, 64);
}

describe.skipIf(SKIP)("production /api/sync (live)", () => {
  it("PUT → GET → DELETE → GET roundtrip with a sentinel vault", async () => {
    const vaultId = sentinelVaultId();
    const payload = {
      version: 1,
      iv: [1, 2, 3],
      ciphertext: `smoke-${Date.now()}`,
    };

    try {
      // 1. PUT — server should store the vault.
      const putRes = await fetch(`${BASE_URL}/api/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, vault: payload }),
      });
      expect(putRes.status).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.ok).toBe(true);
      expect(typeof putBody.updatedAt).toBe("number");

      // 2. GET — server should return the stored vault byte-equal.
      const getRes = await fetch(`${BASE_URL}/api/sync?vaultId=${vaultId}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.ok).toBe(true);
      expect(getBody.vault).toEqual(payload);
    } finally {
      // Cleanup: delete the sentinel regardless of assertion outcome.
      await fetch(`${BASE_URL}/api/sync?vaultId=${vaultId}`, {
        method: "DELETE",
      });
    }

    // 3. GET after DELETE — server should 404 AND include traceId.
    //    This asserts the PR #43 observability contract is wired.
    const after = await fetch(`${BASE_URL}/api/sync?vaultId=${vaultId}`);
    expect(after.status).toBe(404);
    const afterBody = await after.json();
    expect(afterBody.ok).toBe(false);
    expect(afterBody.traceId).toMatch(/^req_[0-9a-f]+$/);
  }, 20_000);
});
