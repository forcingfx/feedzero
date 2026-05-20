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

// Vercel Preview Deployment Protection 401s every request at the edge
// before our app code runs. The Protection Bypass for Automation
// feature exempts requests carrying this header from the gate. The
// secret is configured in Vercel project settings and mirrored as a
// GHA secret. Header name is the literal value Vercel documents.
// Empty / absent → no header sent (production base URLs don't need it).
//
// NOT sending `x-vercel-set-bypass-cookie: true` because it causes
// Vercel to do a redirect-then-set-cookie dance that Node fetch
// follows in a loop ("redirect count exceeded"). The per-request
// header-only mode works without a cookie session — each request
// carries its own bypass.
const PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS;
if (process.env.SMOKE_TESTS && PROTECTION_BYPASS) {
  // Diagnostic — confirms the secret reached the test env without
  // leaking the value itself. Vercel bypass tokens are 32 chars.
  // eslint-disable-next-line no-console
  console.log(
    `[smoke] VERCEL_PROTECTION_BYPASS length=${PROTECTION_BYPASS.length}`,
  );
}
const BYPASS_HEADER: Record<string, string> = PROTECTION_BYPASS
  ? { "x-vercel-protection-bypass": PROTECTION_BYPASS }
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

describe.skipIf(SKIP)(
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
          headers: {
            "Content-Type": "application/json",
            ...BYPASS_HEADER,
          },
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
          { headers: { ...BYPASS_HEADER } },
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
          headers: { ...BYPASS_HEADER },
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
        headers: { ...BYPASS_HEADER },
      });
      expect(res.status).toBe(404);
    }, 15_000);
  },
);

/**
 * Regression sentinel: cloud sync is a Free-tier feature and the server
 * must never gate /api/sync behind a license. If a future change re-wires
 * `licenseAuth` (the mechanism still lives in sync-handler.ts), this
 * assertion catches it against the deployed system. An unauthenticated
 * PUT must succeed with 200, never 401.
 */
describe.skipIf(SKIP)(
  "production /api/sync — no license required (Free-tier feature)",
  () => {
    it("unauthenticated PUT succeeds with 200 (no bearer)", async () => {
      const vaultPayload = buildSyntheticVaultPayload();
      const sentinelId = "f".repeat(64);
      try {
        const res = await fetch(`${BASE_URL}/api/sync`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...BYPASS_HEADER },
          body: JSON.stringify({
            vaultId: sentinelId,
            vault: vaultPayload,
          }),
        });
        // 200 = sync stays free; 401 = a license gate was re-introduced.
        expect(res.status).toBe(200);
      } finally {
        await fetch(`${BASE_URL}/api/sync?vaultId=${sentinelId}`, {
          method: "DELETE",
          headers: { ...BYPASS_HEADER },
        }).catch(() => {});
      }
    }, 15_000);
  },
);
