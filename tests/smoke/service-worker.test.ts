// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Production smoke test: the deployed site serves a service worker a browser
 * will actually install.
 *
 * The worker was dead for eight months and nothing noticed, because a missing
 * worker is silent: /sw.js fell through to the SPA rewrite and answered 200
 * with the HTML page. Every unit test passed. Only the deployed system shows
 * whether the build emitted the file, the host serves it as a script, and the
 * assets it lists exist.
 *
 * Skipped by default. Runs with SMOKE_TESTS=1.
 */
const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

const PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS;
const BYPASS_HEADER: Record<string, string> = PROTECTION_BYPASS
  ? { "x-vercel-protection-bypass": PROTECTION_BYPASS }
  : {};

interface BuildManifest {
  buildId: string;
  assets: string[];
}

async function fetchWorker(): Promise<Response> {
  return fetch(`${BASE_URL}/sw.js`, { headers: BYPASS_HEADER, cache: "no-store" });
}

function readManifest(source: string): BuildManifest {
  const match = source.match(/const BUILD_MANIFEST = (\{.*?\});/);
  expect(match, "/sw.js carries no build manifest").not.toBeNull();
  return JSON.parse(match![1]) as BuildManifest;
}

describe.skipIf(SKIP)("service worker (live)", () => {
  it("is served as JavaScript, not as the app page", async () => {
    const res = await fetchWorker();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
  }, 10_000);

  it("is served with no-cache, so a fixed worker reaches browsers on their next check", async () => {
    const res = await fetchWorker();

    expect(res.headers.get("cache-control")).toContain("no-cache");
  }, 10_000);

  it("lists assets that exist, so installing it cannot fail on a missing file", async () => {
    const manifest = readManifest(await (await fetchWorker()).text());
    expect(manifest.assets.length).toBeGreaterThan(0);

    const responses = await Promise.all(
      manifest.assets.map((asset) =>
        fetch(`${BASE_URL}${asset}`, { method: "HEAD", headers: BYPASS_HEADER }),
      ),
    );

    const missing = manifest.assets.filter(
      (_, i) => !responses[i].ok || !/javascript|css/.test(responses[i].headers.get("content-type") ?? ""),
    );
    expect(missing).toEqual([]);
  }, 30_000);
});
