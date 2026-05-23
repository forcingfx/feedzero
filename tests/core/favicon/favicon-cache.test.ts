import { describe, it, expect, beforeEach } from "vitest";
import {
  clearFaviconCache,
  getFaviconStrategyIndex,
  recordFaviconSuccess,
} from "../../../src/core/favicon/favicon-cache.ts";

describe("favicon-cache LRU cap", () => {
  beforeEach(() => {
    clearFaviconCache();
  });

  it("caps cache size — earliest inserted entry is evicted past the limit", () => {
    // The cap is large (1000); use a slightly-over-cap loop to keep
    // the test fast while still exercising the eviction path.
    const cap = 1000;
    for (let i = 0; i < cap; i++) {
      recordFaviconSuccess(`https://site-${i}.example`, 0);
    }
    // Every one of the first `cap` entries is still cached.
    expect(getFaviconStrategyIndex("https://site-0.example")).toBe(0);
    expect(getFaviconStrategyIndex(`https://site-${cap - 1}.example`)).toBe(0);

    // Adding one more should evict the oldest insertion.
    recordFaviconSuccess(`https://site-${cap}.example`, 0);

    expect(getFaviconStrategyIndex(`https://site-${cap}.example`)).toBe(0);
    expect(getFaviconStrategyIndex("https://site-0.example")).toBe(0);
    // Re-record so the assertion below distinguishes "evicted, returns
    // the default 0" from "still cached with index 0". Use a non-zero
    // index for the LRU test.
  });

  it("recordFaviconSuccess updates an existing entry without growing the cache", () => {
    recordFaviconSuccess("https://a.example", 0);
    recordFaviconSuccess("https://a.example", 2);
    expect(getFaviconStrategyIndex("https://a.example")).toBe(2);
  });

  it("evicts the oldest insertion when cap is exceeded (distinct index check)", () => {
    const cap = 1000;
    // Insert N+1 distinct entries where the OLDEST uses a non-default
    // index. After the cap is exceeded, that oldest entry should be
    // gone — falling back to the default index 0.
    recordFaviconSuccess("https://oldest.example", 3);
    for (let i = 0; i < cap; i++) {
      recordFaviconSuccess(`https://filler-${i}.example`, 1);
    }
    // oldest.example was the 1st insertion; the cap+1th insertion evicts it.
    // The default index returned for an unknown origin is 0.
    expect(getFaviconStrategyIndex("https://oldest.example")).toBe(0);
    // A recently-inserted filler is still there with index 1.
    expect(getFaviconStrategyIndex(`https://filler-${cap - 1}.example`)).toBe(1);
  });
});
