import { describe, it, expect } from "vitest";

/**
 * Live check of /api/icon on the deployed system (SMOKE_TESTS=1).
 *
 * Both request shapes must be served by the single Vercel function: the
 * client's primary `?domain=` path (favicon discovery) and the `?url=`
 * fallback (image proxy). In 2026-09 the deployed wrapper answered every
 * `?domain=` request with 400 while every unit test stayed green — the
 * dispatch existed in server.ts and vite.config.js but not in api/icon.ts.
 * Only a request against the real deployment can see that.
 */
const BASE = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const enabled = process.env.SMOKE_TESTS === "1";

describe.skipIf(!enabled)("smoke: /api/icon", () => {
  it("serves a favicon for ?domain= with a cacheable image response", async () => {
    const res = await fetch(`${BASE}/api/icon?domain=example.com`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
    expect(res.headers.get("cache-control")).toMatch(/max-age=86400/);
  });

  it("proxies an explicit image url", async () => {
    const res = await fetch(
      `${BASE}/api/icon?url=${encodeURIComponent("https://example.com/favicon.ico")}`,
    );
    // example.com has no favicon; the contract is that the proxy answers
    // for the URL rather than rejecting the shape.
    expect([200, 404, 502]).toContain(res.status);
    expect(res.status).not.toBe(400);
  });
});
