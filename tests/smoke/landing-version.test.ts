// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Production smoke test: the landing homepage must show the release that the
 * app is serving.
 *
 * feedzero.app is a static build. It reads `releases.json` from the app when
 * it deploys and bakes the newest version into the page, so it stays on the
 * previous release until something redeploys it. v0.14.0 and v0.15.0 both
 * shipped with the homepage still naming the release before; for v0.15.0 the
 * tag, /api/health, the feed and the image had all been verified and reported
 * as done, and the one surface a visitor sees first had not been looked at.
 *
 * The expected version comes from the app's live `releases.json`, not from
 * package.json: the claim under test is "landing agrees with production",
 * which must hold on any checkout.
 *
 * Skipped by default. Runs with SMOKE_TESTS=1. `SMOKE_LANDING_URL` points it
 * at a specific landing deployment.
 */
const SKIP = !process.env.SMOKE_TESTS;
const APP_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const LANDING_URL = process.env.SMOKE_LANDING_URL ?? "https://feedzero.app";

interface ReleaseEntry {
  version: string;
  title: string;
}

async function fetchNewestRelease(): Promise<ReleaseEntry> {
  const res = await fetch(`${APP_URL}/releases.json`, { cache: "no-store" });
  expect(res.status).toBe(200);
  const releases = (await res.json()) as ReleaseEntry[];
  return releases[0];
}

async function fetchHomepage(): Promise<string> {
  // The query string keeps a CDN copy of the previous build from answering.
  const res = await fetch(`${LANDING_URL}/?smoke=${Date.now()}`, { cache: "no-store" });
  expect(res.status).toBe(200);
  const html = await res.text();
  // A protected preview answers 200 with a login page; say so instead of
  // reporting a version mismatch.
  expect(html, `${LANDING_URL} did not return the landing homepage`).toContain('"softwareVersion"');
  return html;
}

describe.skipIf(SKIP)("landing homepage vs the released version (live)", () => {
  it("names the newest release in the version line and the structured data", async () => {
    const [newest, html] = await Promise.all([fetchNewestRelease(), fetchHomepage()]);

    expect(html).toContain(`alpha (v${newest.version})`);
    expect(html).toMatch(new RegExp(`"softwareVersion":\\s*"${newest.version.replaceAll(".", "\\.")}"`));
  }, 15_000);

  it("lists the newest release in the release-notes accordion", async () => {
    const [newest, html] = await Promise.all([fetchNewestRelease(), fetchHomepage()]);

    expect(html).toContain(`<details id="v${newest.version}"`);
  }, 15_000);
});
