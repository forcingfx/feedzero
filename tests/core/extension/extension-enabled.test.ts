import { describe, it, expect, afterEach, vi } from "vitest";
import { isExtensionEnabled } from "@/core/extension/extension-enabled.ts";

describe("isExtensionEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true only when VITE_EXTENSION_ENABLED is the string "1"', () => {
    vi.stubEnv("VITE_EXTENSION_ENABLED", "1");
    expect(isExtensionEnabled()).toBe(true);
  });

  it("returns false when unset (shippable default — extension surface hidden)", () => {
    vi.stubEnv("VITE_EXTENSION_ENABLED", "");
    expect(isExtensionEnabled()).toBe(false);
  });

  it('returns false for truthy-but-not-"1" values (defensive)', () => {
    vi.stubEnv("VITE_EXTENSION_ENABLED", "true");
    expect(isExtensionEnabled()).toBe(false);
    vi.stubEnv("VITE_EXTENSION_ENABLED", "yes");
    expect(isExtensionEnabled()).toBe(false);
    vi.stubEnv("VITE_EXTENSION_ENABLED", "0");
    expect(isExtensionEnabled()).toBe(false);
  });
});
