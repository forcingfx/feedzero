// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Pin-tests for the first-load bundle (audit 2026-Q4, finding 2).
 *
 * Product decision these freeze: the first load pays only for what every
 * visitor uses. Two libraries broke that by accident, not by design:
 *
 * - `motion` (about 50 kB gzipped) drives the mobile reader's swipe-back.
 *   Desktop never mounts that layer, and a phone needs it only once an
 *   article is open, so the layer is a lazy chunk. The gesture code itself
 *   is untouched: rebuilding it without real hardware is forbidden
 *   (CLAUDE.md, "Gesture work").
 * - `hash-wasm` is already imported lazily in argon2.ts, but the chunking
 *   rule's catch-all put it in the eager vendor chunk, which undid the
 *   lazy import. Its own chunk keeps it lazy.
 */
const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("first-load bundle", () => {
  it("keeps motion in its own lazy chunk and out of the eager vendor bucket", () => {
    const config = read("vite.config.js");
    expect(config).toMatch(/node_modules\/motion\//);
    expect(config).toMatch(/node_modules\/motion-dom\//);
    expect(config).toMatch(/node_modules\/framer-motion\//);
    expect(config).toMatch(/"vendor-motion"/);
  });

  it("keeps hash-wasm in its own lazy chunk", () => {
    const config = read("vite.config.js");
    expect(config).toMatch(/node_modules\/hash-wasm\//);
    expect(config).toMatch(/"vendor-argon2"/);
  });

  it("the feeds route does not import motion statically; the mobile reader layer is lazy", () => {
    const route = read("src/pages/feeds-route.tsx");
    expect(route).not.toMatch(/from "motion\/react"/);
    expect(route).toMatch(/lazy\(\s*\(\)\s*=>\s*import\("@\/components\/reader\/mobile-reader-layer\.tsx"\)/);
    const layer = read("src/components/reader/mobile-reader-layer.tsx");
    expect(layer).toMatch(/from "motion\/react"/);
  });
});
