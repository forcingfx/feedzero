// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Production smoke test: the deployed /api/health endpoint must report the
 * version from package.json, not the "unknown" fallback. Catches the failure
 * mode where APP_VERSION isn't injected by the build (which previously hid a
 * post-deploy "is the right code on prod" check behind a useless string).
 *
 * RED today, GREEN after scripts/build-api.js inlines `process.env.APP_VERSION`
 * at esbuild time from package.json. The handler reads either VITE_APP_VERSION
 * (SPA context) or process.env.APP_VERSION (serverless context); only the
 * serverless side is reachable from a smoke test because /api/health runs as
 * a Vercel function.
 *
 * Skipped by default. Runs with SMOKE_TESTS=1.
 */
const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

// Vercel Preview Deployment Protection 401s every request before app code
// runs. The bypass header (same one used by sync-cross-device smoke) exempts
// CI from the gate. Production URLs (my.feedzero.app) don't need it.
const PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS;
const BYPASS_HEADER: Record<string, string> = PROTECTION_BYPASS
  ? { "x-vercel-protection-bypass": PROTECTION_BYPASS }
  : {};

function readPackageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, "../../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

describe.skipIf(SKIP)("production /api/health (live)", () => {
  it("reports the version from package.json, not the 'unknown' fallback", async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      headers: BYPASS_HEADER,
      cache: "no-store",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    // The whole point: the build must inject the version.
    expect(body.version).not.toBe("unknown");
    // And it should be the version the smoke runner was checked out against.
    // SMOKE_BASE_URL points at a specific deploy whose source commit is the
    // current checkout — for prod runs this means main; for preview runs the
    // checkout-action runs against the deploy SHA. Either way, the deployed
    // version should match the in-repo package.json.
    expect(body.version).toBe(readPackageVersion());
  }, 10_000);
});
