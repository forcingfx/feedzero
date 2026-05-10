import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getLicenseToken,
  setLicenseToken,
  clearLicenseToken,
  hasLicenseToken,
  LICENSE_TOKEN_STORAGE_KEY,
} from "@/core/license/license-token-store";

// localStorage mock — matches the pattern in tests/core/storage/key-material.test.ts
// because happy-dom in this project's vitest setup doesn't expose localStorage globally.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("license-token-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getLicenseToken returns null when no token is stored", () => {
    expect(getLicenseToken()).toBeNull();
  });

  it("setLicenseToken persists the token to localStorage", () => {
    setLicenseToken("fz_payload.sig");
    expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).toBe("fz_payload.sig");
  });

  it("getLicenseToken reads back what was stored", () => {
    setLicenseToken("fz_abc.def");
    expect(getLicenseToken()).toBe("fz_abc.def");
  });

  it("clearLicenseToken removes the entry", () => {
    setLicenseToken("fz_x.y");
    clearLicenseToken();
    expect(getLicenseToken()).toBeNull();
    expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("hasLicenseToken returns true only when a non-empty token is stored", () => {
    expect(hasLicenseToken()).toBe(false);
    setLicenseToken("fz_x.y");
    expect(hasLicenseToken()).toBe(true);
    clearLicenseToken();
    expect(hasLicenseToken()).toBe(false);
  });

  it("setLicenseToken with empty string is the same as clear (no half-state)", () => {
    setLicenseToken("fz_x.y");
    setLicenseToken("");
    expect(getLicenseToken()).toBeNull();
    expect(hasLicenseToken()).toBe(false);
  });

  it("trims whitespace before storing (paste from email often includes trailing newline)", () => {
    setLicenseToken("  fz_payload.sig  \n");
    expect(getLicenseToken()).toBe("fz_payload.sig");
  });

  it("rejects values that don't have the fz_ prefix (defensive)", () => {
    setLicenseToken("not-a-feedzero-token");
    expect(getLicenseToken()).toBeNull();
  });
});
