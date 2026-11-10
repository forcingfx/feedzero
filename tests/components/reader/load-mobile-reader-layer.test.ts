/**
 * First-open flicker (owner report, 2026-11-10): on a phone's first visit,
 * opening an article showed a blank cover while the reader's code chunk
 * downloaded, then the list again, then the reader sliding in. The chunk
 * is now preloaded once the list shows, through one memoized loader that
 * the lazy component shares, so both reuse the same request.
 */
import { describe, it, expect } from "vitest";
import { loadMobileReaderLayer } from "@/components/reader/load-mobile-reader-layer.ts";

describe("loadMobileReaderLayer", () => {
  it("returns the same request every time, so preload and render share it", () => {
    expect(loadMobileReaderLayer()).toBe(loadMobileReaderLayer());
  });

  it("resolves to the reader layer module", async () => {
    const mod = await loadMobileReaderLayer();
    expect(typeof mod.default).toBe("function");
  });
});
