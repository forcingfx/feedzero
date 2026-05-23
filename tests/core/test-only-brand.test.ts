import { describe, expect, it } from "vitest";
import {
  TEST_ONLY,
  assertNotTestOnlyInProduction,
  isTestOnly,
  markTestOnly,
} from "@/core/test-only-brand";

describe("test-only-brand", () => {
  describe("markTestOnly / isTestOnly", () => {
    it("brands an object so isTestOnly returns true", () => {
      const adapter = { get: () => null };
      markTestOnly(adapter);
      expect(isTestOnly(adapter)).toBe(true);
    });

    it("returns false for objects that were never branded", () => {
      const adapter = { get: () => null };
      expect(isTestOnly(adapter)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isTestOnly(null)).toBe(false);
      expect(isTestOnly(undefined)).toBe(false);
      expect(isTestOnly("memory")).toBe(false);
      expect(isTestOnly(42)).toBe(false);
    });

    it("uses Symbol.for so cross-realm checks still match", () => {
      // Symbol.for-based brand survives even if the helper module is
      // duplicated by a bundler (each copy resolves to the same global
      // symbol). A bare local Symbol would silently produce false negatives.
      const adapter = markTestOnly({});
      const externallyKeyedBrand = Symbol.for("feedzero.testOnlyAdapter");
      expect(
        (adapter as Record<symbol, unknown>)[externallyKeyedBrand],
      ).toBe(true);
      expect(TEST_ONLY).toBe(externallyKeyedBrand);
    });

    it("brand is non-enumerable so it doesn't leak through JSON.stringify", () => {
      // Surfaces would be confusing if a server response suddenly carried a
      // `Symbol(...)` field. Non-enumerable keeps it private.
      const adapter = markTestOnly({ get: () => null });
      const keys = Object.keys(adapter);
      expect(keys).toEqual(["get"]);
    });
  });

  describe("assertNotTestOnlyInProduction", () => {
    it("throws when production env meets a branded adapter", () => {
      const adapter = markTestOnly({ get: () => null });
      expect(() =>
        assertNotTestOnlyInProduction(adapter, "test.context", {
          NODE_ENV: "production",
        }),
      ).toThrow(/test-only adapter in production/);
    });

    it("includes the context label in the thrown message", () => {
      // A failed deploy log will show only the message — the label has to
      // tell the operator WHICH resolver fell through to memory.
      const adapter = markTestOnly({});
      expect(() =>
        assertNotTestOnlyInProduction(adapter, "sync.resolveAdapter", {
          NODE_ENV: "production",
        }),
      ).toThrow(/sync\.resolveAdapter/);
    });

    it("does not throw in non-production envs", () => {
      const adapter = markTestOnly({ get: () => null });
      expect(() =>
        assertNotTestOnlyInProduction(adapter, "ctx", { NODE_ENV: "test" }),
      ).not.toThrow();
      expect(() =>
        assertNotTestOnlyInProduction(adapter, "ctx", {
          NODE_ENV: "development",
        }),
      ).not.toThrow();
      expect(() =>
        assertNotTestOnlyInProduction(adapter, "ctx", {}),
      ).not.toThrow();
    });

    it("does not throw in production when the adapter is not branded", () => {
      const adapter = { get: () => null };
      expect(() =>
        assertNotTestOnlyInProduction(adapter, "ctx", {
          NODE_ENV: "production",
        }),
      ).not.toThrow();
    });

    it("defaults to process.env when no env argument is passed", () => {
      // Production resolvers will call the helper with no env arg. Pin the
      // default so a future refactor that drops process.env is caught.
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const adapter = markTestOnly({});
        expect(() => assertNotTestOnlyInProduction(adapter, "ctx")).toThrow(
          /test-only adapter in production/,
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });
});
