import { describe, it, expect } from "vitest";

/**
 * Smoke test: confirms api.anthropic.com still accepts browser-direct
 * calls (CORS-enabled). Signal Briefings is built on the user's browser
 * calling Anthropic directly with their own key — if Anthropic ever
 * tightens its CORS policy, the feature breaks silently and FeedZero
 * can't detect it from mocked tests.
 *
 * Skipped by default — runs only with SMOKE_TESTS=1. Suitable for
 * nightly CI or manual pre-deploy verification. Not part of `npm test`
 * because it makes a real network call.
 *
 * What we assert: the API responds (any status — even a 401 from a
 * bogus key confirms the request reached Anthropic and the CORS
 * preflight passed). We do NOT need a valid API key to verify the
 * preflight contract — the absence of a CORS error is the signal.
 */

const SKIP = !process.env.SMOKE_TESTS;
const ORIGIN = process.env.SMOKE_ORIGIN ?? "https://my.feedzero.app";

describe.skipIf(SKIP)("anthropic CORS smoke test (live network)", () => {
  it("responds to a browser-shaped preflight from our origin", async () => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access",
      },
    });

    // Any 2xx confirms preflight succeeded; some CDNs return 204 with
    // headers, others return 200. Both are fine.
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);

    const allowOrigin = response.headers.get("access-control-allow-origin");
    // Either echoes our origin or returns "*". Both are valid;
    // whichever it is, browser-direct calls from our origin will work.
    expect(allowOrigin === ORIGIN || allowOrigin === "*").toBe(true);

    const allowMethods =
      response.headers.get("access-control-allow-methods") ?? "";
    expect(allowMethods.toUpperCase()).toContain("POST");
  }, 10_000);

  it("rejects a real POST with 401 for a bogus key (proves we reached the API)", async () => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "sk-ant-INVALID-smoke-test-key",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    // 401 (unauthorized) is the expected, useful failure — it means
    // CORS passed, the request reached Anthropic, and the auth layer
    // rejected the bogus key. Any 4xx is acceptable for this smoke
    // test; a 5xx or network error would suggest something deeper
    // changed.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  }, 10_000);
});
