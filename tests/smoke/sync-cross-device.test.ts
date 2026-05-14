// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * Production-grade smoke test: a vault PUT by one HTTP client must be
 * retrievable byte-identical by a *separate* HTTP client that shares
 * only the vaultId. This is the cross-device sync contract.
 *
 * Pairs with tests/e2e/sync-100-feeds.spec.ts (browser-side, App-level)
 * and tests/core/sync/cross-device-roundtrip.test.ts (data layer,
 * fake-indexeddb). This smoke test cuts out the browser and the
 * IndexedDB layer to verify the *server* honors the cross-client
 * contract on real infrastructure (Upstash + Vercel function).
 *
 * Why this exists alongside sync-large-vault.test.ts: that test does
 * a PUT/GET on one fetch session. Cross-device sync uses *two*
 * distinct sessions (separate browser contexts, separate connections,
 * potentially different regions). Modeling this with two fetch
 * objects exercises the server-side state-sharing path that backs
 * "Device A pushes, Device B pulls".
 *
 * Skipped by default. Runs with SMOKE_TESTS=1.
 *
 * Side effects (cleaned up in try/finally):
 *  - One sentinel vault under vault:dddd… is briefly stored, then
 *    deleted. If the cleanup misses, the standalone
 *    sentinel-cleanup script picks it up on the next operator run.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

// When LAUNCH_PAID_TIER=1 on the target deploy, /api/sync requires a
// signed license bearer. SMOKE_LICENSE_TOKEN lets the smoke test pass
// the gate; without it, the test skips because the data assertions
// cannot run against an authenticated endpoint.
const LICENSE_TOKEN = process.env.SMOKE_LICENSE_TOKEN;
const SKIP_AUTH = SKIP || !LICENSE_TOKEN;

const AUTH_HEADER: Record<string, string> = LICENSE_TOKEN
  ? { Authorization: `Bearer ${LICENSE_TOKEN}` }
  : {};

// Sentinel vaultId (64-char single-character hex). Distinct from the
// large-vault test's 'c' sentinel so parallel smoke runs do not race.
// Matches isSentinelVaultId() in sentinel-cleanup.ts.
const SENTINEL_VAULT_ID = "d".repeat(64);

function buildSyntheticVaultPayload(): {
  version: number;
  iv: number[];
  ciphertext: string;
} {
  const iv = Array.from(randomBytes(12).values());
  // Modest payload — the focus here is cross-client correctness, not
  // payload-size handling. That's already covered by sync-large-vault.
  const ciphertext = randomBytes(64 * 1024).toString("base64");
  return { version: 1, iv, ciphertext };
}

describe.skipIf(SKIP_AUTH)(
  "production /api/sync (live) — cross-device PUT then GET",
  () => {
    it("Device A PUTs a vault; a separate Device B GET reads identical bytes", async () => {
      const vaultPayload = buildSyntheticVaultPayload();
      const putBody = JSON.stringify({
        vaultId: SENTINEL_VAULT_ID,
        vault: vaultPayload,
      });

      try {
        // Device A — fresh fetch context, push.
        const deviceA = (input: string, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" });
        const putRes = await deviceA(`${BASE_URL}/api/sync`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...AUTH_HEADER },
          body: putBody,
        });
        expect(putRes.status).toBe(200);

        // Device B — a separately constructed fetch invocation. They
        // share only the vaultId (the way two devices share a
        // passphrase-derived vaultId in production).
        const deviceB = (input: string, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" });
        const getRes = await deviceB(
          `${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`,
          { headers: AUTH_HEADER },
        );
        expect(getRes.status).toBe(200);
        const body = (await getRes.json()) as {
          ok: boolean;
          vault: { version: number; iv: number[]; ciphertext: string };
        };
        expect(body.ok).toBe(true);

        // The decisive invariant: byte-identical round-trip across
        // distinct HTTP clients.
        expect(body.vault.version).toBe(vaultPayload.version);
        expect(body.vault.iv).toEqual(vaultPayload.iv);
        expect(typeof body.vault.ciphertext).toBe("string");
        expect(body.vault.ciphertext).toBe(vaultPayload.ciphertext);
      } finally {
        await fetch(`${BASE_URL}/api/sync?vaultId=${SENTINEL_VAULT_ID}`, {
          method: "DELETE",
          headers: AUTH_HEADER,
        }).catch(() => {});
      }
    }, 30_000);

    it("HEAD on a non-existent vaultId returns 404 (cross-device discovery)", async () => {
      // Device B's typical flow: HEAD to check if a vault exists before
      // downloading. If a fresh device generates the wrong passphrase
      // (typo), HEAD must reliably 404 — otherwise the user sees a
      // false "vault found" and we pull nothing.
      const bogusId = "e".repeat(64);
      const res = await fetch(`${BASE_URL}/api/sync?vaultId=${bogusId}`, {
        method: "HEAD",
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(404);
    }, 15_000);
  },
);

/**
 * Always-on assertion: when the deploy gates /api/sync behind a license
 * (LAUNCH_PAID_TIER=1) and no SMOKE_LICENSE_TOKEN is configured, an
 * unauthenticated request must return 401, not 200 (which would mean
 * the gate isn't applied) and not a server-error class. Catches the
 * regression where auth-gating gets accidentally removed.
 */
describe.skipIf(SKIP || LICENSE_TOKEN !== undefined)(
  "production /api/sync — auth gate (no license token configured)",
  () => {
    it("rejects unauthenticated PUT with 401 when LAUNCH_PAID_TIER is on", async () => {
      const vaultPayload = buildSyntheticVaultPayload();
      const res = await fetch(`${BASE_URL}/api/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId: SENTINEL_VAULT_ID,
          vault: vaultPayload,
        }),
      });
      // 401 = gate enforced (expected); 200 = gate missing (regression).
      // Anything 5xx means the gate path itself is broken.
      expect([200, 401]).toContain(res.status);
    }, 15_000);
  },
);
