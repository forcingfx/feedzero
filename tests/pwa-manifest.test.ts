/**
 * PWA manifest contract test.
 *
 * The manifest enables (a) installable PWA shell, (b) home-screen app
 * shortcuts (long-press on iOS 16+ / Android, right-click on Windows) for
 * the most-used flows. If a future edit drops the shortcuts or the manifest
 * link, mobile users silently lose discoverability without any visible UI
 * regression — this test guards both.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_HTML = readFileSync(
  resolve(__dirname, "..", "index.html"),
  "utf-8",
);

const MANIFEST = JSON.parse(
  readFileSync(
    resolve(__dirname, "..", "public", "manifest.webmanifest"),
    "utf-8",
  ),
);

describe("PWA manifest wiring", () => {
  it("index.html links the manifest", () => {
    expect(INDEX_HTML).toMatch(
      /<link[^>]*rel=["']manifest["'][^>]*href=["']\/manifest\.webmanifest["']/,
    );
  });
});

describe("manifest.webmanifest content", () => {
  it("declares standalone display with start_url that lands on the feeds view", () => {
    expect(MANIFEST.display).toBe("standalone");
    expect(MANIFEST.start_url).toBe("/feeds");
  });

  it("supplies name + short_name + description so installers render proper labels", () => {
    expect(MANIFEST.name).toBe("FeedZero");
    expect(MANIFEST.short_name).toBe("FeedZero");
    expect(typeof MANIFEST.description).toBe("string");
    expect(MANIFEST.description.length).toBeGreaterThan(0);
  });

  it("provides at least one icon installers can use", () => {
    expect(Array.isArray(MANIFEST.icons)).toBe(true);
    expect(MANIFEST.icons.length).toBeGreaterThan(0);
    for (const icon of MANIFEST.icons) {
      expect(icon.src).toMatch(/^\//);
      expect(icon.type).toMatch(/^image\//);
    }
  });
});

describe("manifest shortcuts", () => {
  // Long-press app icon (iOS 16+/Android) / right-click (Win) reveals these.
  // Each shortcut needs a name, a short_name (chip label), and a URL inside
  // our routing scope.
  it("ships the three quick-access shortcuts", () => {
    expect(Array.isArray(MANIFEST.shortcuts)).toBe(true);
    expect(MANIFEST.shortcuts.length).toBeGreaterThanOrEqual(3);
  });

  it("each shortcut has name, short_name, and URL", () => {
    for (const shortcut of MANIFEST.shortcuts) {
      expect(typeof shortcut.name).toBe("string");
      expect(shortcut.name.length).toBeGreaterThan(0);
      expect(typeof shortcut.short_name).toBe("string");
      expect(shortcut.short_name.length).toBeGreaterThan(0);
      expect(typeof shortcut.url).toBe("string");
      expect(shortcut.url.startsWith("/")).toBe(true);
    }
  });

  it("includes the All-unread shortcut pointing at /feeds/all (ALL_FEEDS_ID)", () => {
    // ALL_FEEDS_ID = "all" in src/utils/constants.ts. If that ever changes,
    // this test forces an update in lockstep.
    const allShortcut = MANIFEST.shortcuts.find(
      (s: { url: string }) => s.url === "/feeds/all",
    );
    expect(allShortcut).toBeDefined();
  });

  it("includes an Add-feed shortcut routed under /feeds", () => {
    const addShortcut = MANIFEST.shortcuts.find((s: { url: string }) =>
      s.url.startsWith("/feeds"),
    );
    expect(addShortcut).toBeDefined();
    expect(MANIFEST.shortcuts.some((s: { name: string }) => /add/i.test(s.name))).toBe(true);
  });
});
