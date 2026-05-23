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

describe("index.html iOS PWA meta tags (native-app feel)", () => {
  // Without these, "Add to Home Screen" on iOS still opens FeedZero inside
  // the Safari chrome — the URL bar, tab bar and bottom toolbar all stay,
  // which immediately reveals it's not a native app. The standalone meta
  // tags + the manifest's "display":"standalone" together unlock a
  // chrome-less fullscreen launch on both iOS and Android.

  it("declares apple-mobile-web-app-capable=yes for standalone iOS launch", () => {
    expect(INDEX_HTML).toMatch(
      /<meta[^>]*name=["']apple-mobile-web-app-capable["'][^>]*content=["']yes["']/,
    );
  });

  it("declares the legacy mobile-web-app-capable=yes for older Android browsers", () => {
    expect(INDEX_HTML).toMatch(
      /<meta[^>]*name=["']mobile-web-app-capable["'][^>]*content=["']yes["']/,
    );
  });

  it("declares a status-bar style so the iOS status bar blends with the app", () => {
    // black-translucent lets the app paint behind the status bar; combined
    // with env(safe-area-inset-top) in body padding, content stays clear.
    expect(INDEX_HTML).toMatch(
      /<meta[^>]*name=["']apple-mobile-web-app-status-bar-style["'][^>]*content=["'](black-translucent|default|black)["']/,
    );
  });

  it("declares an apple-mobile-web-app-title for the home-screen icon label", () => {
    expect(INDEX_HTML).toMatch(
      /<meta[^>]*name=["']apple-mobile-web-app-title["'][^>]*content=["']FeedZero["']/,
    );
  });
});
