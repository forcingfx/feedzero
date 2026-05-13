/**
 * Viewport meta tag contract test.
 *
 * Background (2026-05-13 user report): mobile dialog inputs were covered by
 * the soft keyboard. Part of the fix is the `interactive-widget=resizes-content`
 * directive in the viewport meta tag (Chrome Android 108+ honors it by
 * resizing the visual viewport when the keyboard opens, which lets
 * `top: 50%` reposition above the keyboard line).
 *
 * If a future edit to index.html drops this directive, every mobile dialog
 * with an input regresses. This test guards the contract.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_HTML = readFileSync(
  resolve(__dirname, "..", "index.html"),
  "utf-8",
);

describe("index.html viewport meta", () => {
  it("declares interactive-widget=resizes-content for mobile-keyboard handling", () => {
    expect(INDEX_HTML).toMatch(
      /<meta[^>]*name=["']viewport["'][^>]*interactive-widget=resizes-content/,
    );
  });

  it("keeps the existing viewport baseline (width, scale, viewport-fit)", () => {
    // Pins the existing behavior so a future "just clean up the meta tag"
    // edit can't accidentally drop the iOS notch handling.
    expect(INDEX_HTML).toMatch(/width=device-width/);
    expect(INDEX_HTML).toMatch(/initial-scale=1/);
    expect(INDEX_HTML).toMatch(/viewport-fit=cover/);
  });
});
