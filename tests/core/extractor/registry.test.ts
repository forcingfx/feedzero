import { describe, it, expect, beforeEach } from "vitest";
import { ok } from "@feedzero/core/utils/result";
import type { SiteAdapter } from "../../../src/core/extractor/adapters/types.ts";

// We test a fresh registry instance each time to avoid cross-test pollution.
// Import the class indirectly by creating a mock adapter and using the registry.

// Since registry is a singleton, we'll import and test it directly.
// The registry module is small enough that re-importing works.
import { registry } from "../../../src/core/extractor/adapters/registry.ts";

function makeFakeAdapter(name: string, domains: string[]): SiteAdapter {
  return {
    name,
    domains,
    extract: (_text: string, _url: string) =>
      ok({ content: `<p>${name}</p>`, title: name, author: "", excerpt: "" }),
  };
}

describe("AdapterRegistry", () => {
  beforeEach(() => {
    // Registry is a singleton — we need to test with it as-is.
    // Tests should use unique domains to avoid conflicts.
  });

  it("returns null for unknown domains", () => {
    expect(registry.findAdapter("https://unknown-domain-xyz.com/page")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(registry.findAdapter("not-a-url")).toBeNull();
  });

  it("finds a registered adapter by domain", () => {
    const adapter = makeFakeAdapter("test-adapter", ["test-registry.example.com"]);
    registry.register(adapter);
    expect(registry.findAdapter("https://test-registry.example.com/some/path")).toBe(adapter);
  });

  it("registers adapter for multiple domains", () => {
    const adapter = makeFakeAdapter("multi-domain", [
      "multi-a.example.com",
      "multi-b.example.com",
    ]);
    registry.register(adapter);
    expect(registry.findAdapter("https://multi-a.example.com/")).toBe(adapter);
    expect(registry.findAdapter("https://multi-b.example.com/page")).toBe(adapter);
  });

  it("returns null for partial domain matches", () => {
    const adapter = makeFakeAdapter("partial", ["partial.example.com"]);
    registry.register(adapter);
    expect(registry.findAdapter("https://not-partial.example.com/")).toBeNull();
  });
});
