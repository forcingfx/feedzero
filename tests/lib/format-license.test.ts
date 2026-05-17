import { describe, it, expect } from "vitest";
import { maskToken } from "@/lib/format-license";

describe("maskToken", () => {
  it("preserves the fz_ prefix and the dot separator", () => {
    const out = maskToken("fz_abc.def");
    expect(out.startsWith("fz_")).toBe(true);
    expect(out).toContain(".");
  });

  it("matches the input length so reveal/hide doesn't jitter layout", () => {
    const token = "fz_abcdefghij.klmnop";
    expect(maskToken(token).length).toBe(token.length);
  });

  it("replaces the payload and signature with bullets of matching length", () => {
    expect(maskToken("fz_abc.de")).toBe("fz_•••.••");
  });

  it("falls back to all-bullets for malformed tokens", () => {
    expect(maskToken("garbage")).toMatch(/^•+$/);
  });

  it("pads at least 8 bullets even for very short malformed tokens", () => {
    expect(maskToken("x").length).toBeGreaterThanOrEqual(8);
  });

  it("handles a missing signature (no dot)", () => {
    expect(maskToken("fz_abcdef")).toBe("fz_••••••");
  });
});
