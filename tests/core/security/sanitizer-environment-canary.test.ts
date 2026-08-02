import { describe, it, expect } from "vitest";
import { sanitize } from "@/core/parser/sanitizer.ts";

/**
 * Environment-drift canary for the sanitization stack.
 *
 * DOMPurify's behavior depends on the DOM implementation it runs against.
 * On 2026-08-02, DOMPurify 3.4.12 under happy-dom silently passed <script>
 * through sanitize() — while reporting isSupported: true — because
 * DOMPurify ≥3.4.8 caches the Node.prototype.nodeName getter and happy-dom
 * defines a stub there (see the happy-dom gotchas in CLAUDE.md and the
 * shim in tests/setup.ts). Fifteen scattered test failures were the only
 * symptom, none naming the cause.
 *
 * This canary exists to turn that class of failure into a one-test
 * diagnosis. If THIS test fails while browsers are fine, suspect
 * DOMPurify/happy-dom environment drift FIRST: probe in a real browser
 * (Playwright) before touching library versions, and check whether the
 * tests/setup.ts nodeName shim still covers the detection path DOMPurify
 * uses.
 */
describe("sanitizer environment canary", () => {
  it("strips <script> under the test DOM — if this fails, see the comment above", () => {
    // Non-callable payload: happy-dom executes inline scripts during
    // sanitization (CLAUDE.md happy-dom gotchas).
    const out = sanitize("<p>Hello world</p><script>var canary = 1;</script>");

    expect(out).toContain("Hello world");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("canary");
  });

  it("strips event-handler attributes under the test DOM", () => {
    const out = sanitize('<img src="x.png" onerror="var canary = 1;">');

    expect(out).not.toContain("onerror");
    expect(out).not.toContain("canary");
  });
});
