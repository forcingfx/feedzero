// @vitest-environment node
import { describe, it, expect } from "vitest";

/**
 * Smoke test: /api/feedback against the live deployment.
 *
 * Why this exists: the in-app feedback form was the only production endpoint
 * with neither a smoke test nor an E2E, and it went three months without
 * producing a single issue before a human noticed. Every check below is
 * chosen to be provable without creating a real GitHub issue — each request
 * is rejected by validation before the handler reaches the GitHub API.
 *
 * The load-bearing assertion is `Content-Type: application/json` on the
 * failure paths. The dialog reads the server's own `error` field to tell the
 * user what went wrong; anything that isn't JSON (a crashed function, a
 * gateway page, a missing route) collapses into an unhelpful generic error
 * and hides which layer actually broke.
 *
 * Skipped by default. Run with `SMOKE_TESTS=1 npx vitest run tests/smoke/`.
 */

const SKIP = !process.env.SMOKE_TESTS;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "https://my.feedzero.app";

function postFeedback(body: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe.skipIf(SKIP)("production /api/feedback (live)", () => {
  it("is deployed and configured with GitHub credentials", async () => {
    // An empty message is rejected at validation, so this never files an
    // issue. A 503 here means GITHUB_FEEDBACK_TOKEN / GITHUB_REPO are missing
    // from the deployment and every real submission is being dropped.
    const res = await postFeedback(JSON.stringify({ message: "" }));

    expect(res.status, "endpoint missing from the deployment").not.toBe(404);
    expect(res.status, "feedback credentials missing in production").not.toBe(
      503,
    );
    expect(res.status).toBe(400);
  }, 15_000);

  it("answers validation failures as JSON the dialog can render", async () => {
    const res = await postFeedback(JSON.stringify({ message: "" }));

    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  }, 15_000);

  it("rejects a malformed payload without crashing the function", async () => {
    // `null` is valid JSON. Reading fields off it used to throw inside the
    // handler, and a rejected handler promise becomes the platform's own HTML
    // 500 page — which the dialog reported to the user as a network failure.
    const res = await postFeedback("null");

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  }, 15_000);

  it("answers a non-POST as JSON rather than plain text", async () => {
    const res = await fetch(`${BASE_URL}/api/feedback`, { method: "GET" });

    expect(res.status).toBe(405);
    expect(res.headers.get("content-type")).toContain("application/json");
  }, 15_000);
});
