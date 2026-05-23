import { describe, expect, it } from "vitest";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import { isTestOnly } from "@/core/test-only-brand";

describe("createMemoryAdapter is branded test-only", () => {
  // Branding is the defense-in-depth signal that catches anyone who bypasses
  // resolveAdapter() and constructs the memory adapter directly. The
  // resolveAdapter prod-guard test in resolve-adapter-prod-guard.test.ts
  // proves the resolver enforces the brand.
  it("returns an adapter that isTestOnly recognises", () => {
    const adapter = createMemoryAdapter();
    expect(isTestOnly(adapter)).toBe(true);
  });
});
