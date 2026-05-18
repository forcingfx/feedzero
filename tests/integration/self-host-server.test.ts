/**
 * Self-host runtime integration test.
 *
 * Boots the Hono app the way a self-hoster actually runs it:
 *   - `process.env.SELF_HOSTED = "1"` (the runtime master switch)
 *   - real filesystem sync adapter pointed at a `mkdtemp`'d directory
 *
 * Then exercises the request paths a self-hoster's browser will hit:
 *   - `HEAD /api/sync` → "server reachable" probe used by the Settings
 *     gate overlay (ADR 016).
 *   - `PUT → GET → DELETE /api/sync` → vault round-trip on disk; proves
 *     the filesystem adapter's mkdir-on-first-write + read-back path.
 *   - `POST /api/feedback` without `GITHUB_FEEDBACK_TOKEN` → 503
 *     gracefully (most self-hosters won't wire feedback at all).
 *   - `LAUNCH_PAID_TIER=1` is suppressed by `SELF_HOSTED=1` → /api/sync
 *     stays free; this is the ADR 014 "master switch" invariant tested
 *     against the assembled server, not just the `isFlagEnabled` unit.
 *
 * Why this is its own file, not part of `server.test.ts`:
 *   `server.test.ts` is the routing-contract / security-headers suite
 *   for the default (Vercel-mode) wiring. This file specifically asserts
 *   the self-host assembly works — different env, different adapter,
 *   different invariants. Keeping them separate makes the intent of
 *   each file obvious from the title.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../server";
import { createFilesystemAdapter } from "../../src/core/sync/adapters/filesystem-adapter";

const VAULT_ID = "a".repeat(64);
const SECOND_VAULT_ID = "b".repeat(64);

describe("self-host server integration", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fz-selfhost-"));
    vi.stubEnv("SELF_HOSTED", "1");
    vi.stubEnv("VITE_SELF_HOSTED", "1");
    // Self-hosters don't (and shouldn't) configure these.
    vi.stubEnv("GITHUB_FEEDBACK_TOKEN", "");
    vi.stubEnv("GITHUB_REPO", "");
    // The paid-tier flags are deliberately set here to prove they're
    // suppressed by the SELF_HOSTED=1 master switch — see ADR 014.
    vi.stubEnv("LAUNCH_PAID_TIER", "1");
    vi.stubEnv("VITE_PAID_TIER_VISIBLE", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function buildSelfHostApp() {
    return createApp(createFilesystemAdapter(dataDir));
  }

  describe("/api/sync against the filesystem adapter", () => {
    it("HEAD with a probe vaultId returns < 500 (the preflight signal)", async () => {
      // The Sync & Data tab's self-host gate overlay (ADR 016) decides
      // whether the toggle is operable by reading the HEAD status as "any
      // status < 500 means the route is mounted". Lock that contract here.
      const app = buildSelfHostApp();
      const res = await app.request(`/api/sync?vaultId=${VAULT_ID}`, {
        method: "HEAD",
      });
      expect(res.status).toBeLessThan(500);
    });

    it("PUT writes the encrypted vault to disk; GET reads it back", async () => {
      const app = buildSelfHostApp();
      const payload = JSON.stringify({ ciphertext: "deadbeef", iv: "0011" });

      const putRes = await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: VAULT_ID, vault: payload }),
      });
      expect(putRes.status).toBe(200);
      const putBody = await putRes.json();
      expect(putBody.ok).toBe(true);

      // File materialised on disk under {dataDir}/vaults/{id}.json — proves
      // the filesystem adapter actually wrote, not just that the handler
      // returned 200.
      const onDisk = fs.readFileSync(
        path.join(dataDir, "vaults", `${VAULT_ID}.json`),
        "utf-8",
      );
      const parsed = JSON.parse(onDisk);
      expect(parsed.ok).toBe(true);
      expect(parsed.vault).toBe(payload);

      const getRes = await app.request(`/api/sync?vaultId=${VAULT_ID}`);
      expect(getRes.status).toBe(200);
      // GET returns the stored JSON envelope verbatim — clients pull the
      // ciphertext out of `.vault` and decrypt locally.
      const getBody = await getRes.json();
      expect(getBody.vault).toBe(payload);
    });

    it("DELETE removes the vault file; subsequent GET returns 404", async () => {
      const app = buildSelfHostApp();
      await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: VAULT_ID, vault: "x" }),
      });

      const delRes = await app.request(`/api/sync?vaultId=${VAULT_ID}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      expect(
        fs.existsSync(path.join(dataDir, "vaults", `${VAULT_ID}.json`)),
      ).toBe(false);

      const getAfter = await app.request(`/api/sync?vaultId=${VAULT_ID}`);
      expect(getAfter.status).toBe(404);
    });

    it("isolates vaults: writing to A does not leak into B", async () => {
      const app = buildSelfHostApp();
      await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: VAULT_ID, vault: "vault-a" }),
      });
      await app.request("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: SECOND_VAULT_ID, vault: "vault-b" }),
      });

      const a = await (
        await app.request(`/api/sync?vaultId=${VAULT_ID}`)
      ).json();
      const b = await (
        await app.request(`/api/sync?vaultId=${SECOND_VAULT_ID}`)
      ).json();
      expect(a.vault).toBe("vault-a");
      expect(b.vault).toBe("vault-b");
    });
  });

  describe("paid-tier master switch (ADR 014)", () => {
    it("LAUNCH_PAID_TIER=1 is suppressed by SELF_HOSTED=1 — /api/sync stays free", async () => {
      // Without the master switch, this configuration would gate /api/sync
      // behind a Bearer license and return 401 for an unauthenticated
      // GET. The self-host invariant is: that gate MUST be off, so the
      // GET reaches the adapter and returns a normal 404 for a vault that
      // hasn't been PUT yet. A 401 here would mean ADR 014 is broken.
      const app = buildSelfHostApp();
      const res = await app.request(`/api/sync?vaultId=${VAULT_ID}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).not.toMatch(/license/i);
    });
  });

  describe("/api/feedback graceful degradation", () => {
    it("returns 503 'not configured' when GITHUB_FEEDBACK_TOKEN/REPO are unset", async () => {
      // Self-hosters who haven't wired feedback should see a clear "not
      // configured" response, not a 500 or a silent failure. Verify the
      // server-side error envelope is what the client expects.
      const app = buildSelfHostApp();
      const res = await app.request("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/not configured/i);
    });
  });

  describe("static / shell wiring", () => {
    it("non-/api requests carry the SPA security headers", async () => {
      // `createApp` doesn't mount the dist/ static handler — that lives
      // in startServer. But the security-header middleware fires on every
      // non-/api path, and self-hosters depend on those CSP / HSTS /
      // X-Frame-Options being set the same way Vercel sets them. Lock
      // that contract here.
      const app = buildSelfHostApp();
      const res = await app.request("/");
      expect(res.headers.get("Content-Security-Policy")).toContain(
        "default-src 'self'",
      );
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    });
  });
});
