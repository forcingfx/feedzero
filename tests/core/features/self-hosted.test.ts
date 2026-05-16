import { describe, it, expect, afterEach, vi } from "vitest";
import { isSelfHosted } from "@/core/features/self-hosted";

describe("isSelfHosted", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when VITE_SELF_HOSTED is the string \"1\"", () => {
    vi.stubEnv("VITE_SELF_HOSTED", "1");
    expect(isSelfHosted()).toBe(true);
  });

  it("returns false when VITE_SELF_HOSTED is unset", () => {
    vi.stubEnv("VITE_SELF_HOSTED", "");
    expect(isSelfHosted()).toBe(false);
  });

  it("returns false for truthy-but-not-\"1\" values (defensive)", () => {
    vi.stubEnv("VITE_SELF_HOSTED", "true");
    expect(isSelfHosted()).toBe(false);
    vi.stubEnv("VITE_SELF_HOSTED", "yes");
    expect(isSelfHosted()).toBe(false);
    vi.stubEnv("VITE_SELF_HOSTED", "0");
    expect(isSelfHosted()).toBe(false);
  });
});
