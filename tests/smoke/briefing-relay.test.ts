// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: confirms the Signal Briefings relay still reaches Anthropic.
 *
 * This used to assert that `api.anthropic.com` allowed browser-DIRECT calls
 * (a CORS preflight from our origin). Two things make that the wrong test:
 *
 *  1. The app does not call Anthropic directly. `briefing-client.ts` posts to
 *     `/api/briefing`, a same-origin relay that forwards the user's key
 *     server-side. Browser CORS to Anthropic is irrelevant to the feature.
 *  2. Anthropic no longer returns `Access-Control-Allow-Origin` at all —
 *     verified 2026-08-05: the preflight answers 400 with allow-methods and
 *     allow-headers but no allow-origin. So the old assertion could only ever
 *     fail, while the feature itself was healthy. It was reporting an outage
 *     that did not exist.
 *
 * What we assert now is the contract the feature actually depends on: a POST
 * to our relay reaches Anthropic and returns Anthropic's own authentication
 * error. A bogus key is deliberate — a 401 carrying Anthropic's error body
 * proves the whole path (our function, its outbound fetch, the relayed
 * response) without needing a real key.
 *
 * Skipped by default — runs only with SMOKE_TESTS=1. Makes real network
 * calls, so it is not part of `npm test`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";
const RELAY_URL = `${BASE_URL}/api/briefing`;

const REQUEST_BODY = JSON.stringify({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 16,
  messages: [{ role: "user", content: "smoke test" }],
});

describe.skipIf(SKIP)("Signal Briefings relay (live network)", () => {
  it("relays a keyed request to Anthropic and returns its auth error", async () => {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "sk-ant-INVALID-smoke-test-key",
        "anthropic-version": "2023-06-01",
      },
      body: REQUEST_BODY,
    });

    expect(response.status).toBe(401);

    // Anthropic's own error shape — this is what proves we reached them,
    // rather than being turned away by our own missing-key guard.
    const body = await response.json();
    expect(
      body?.error?.type,
      `Expected Anthropic's authentication_error, got: ${JSON.stringify(body)}`,
    ).toBe("authentication_error");
  }, 20_000);

  it("rejects a request with no key before calling Anthropic", async () => {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: REQUEST_BODY,
    });

    // Our own guard: never spend an outbound call on a request that cannot
    // possibly authenticate.
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(JSON.stringify(body)).toMatch(/x-api-key/i);
  }, 20_000);
});
