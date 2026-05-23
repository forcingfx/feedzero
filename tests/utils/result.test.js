import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  fromPromise,
} from "@feedzero/core/utils/result";

describe("Result", () => {
  describe("ok", () => {
    it("should create a success result", () => {
      const r = ok(42);
      expect(r).toEqual({ ok: true, value: 42 });
    });

    it("should handle null values", () => {
      const r = ok(null);
      expect(r.ok).toBe(true);
      expect(r.value).toBeNull();
    });
  });

  describe("err", () => {
    it("should create an error result", () => {
      const r = err("something failed");
      expect(r).toEqual({ ok: false, error: "something failed" });
    });
  });

  describe("isOk / isErr", () => {
    it("should identify ok results", () => {
      expect(isOk(ok(1))).toBe(true);
      expect(isOk(err("x"))).toBe(false);
    });

    it("should identify err results", () => {
      expect(isErr(err("x"))).toBe(true);
      expect(isErr(ok(1))).toBe(false);
    });
  });

  describe("unwrap", () => {
    it("should return value for ok", () => {
      expect(unwrap(ok("hello"))).toBe("hello");
    });

    it("should throw for err", () => {
      expect(() => unwrap(err("bad"))).toThrow("Unwrap called on err: bad");
    });
  });

  describe("unwrapOr", () => {
    it("should return value for ok", () => {
      expect(unwrapOr(ok(5), 0)).toBe(5);
    });

    it("should return fallback for err", () => {
      expect(unwrapOr(err("x"), 0)).toBe(0);
    });
  });

  describe("map", () => {
    it("should transform ok values", () => {
      const r = map(ok(2), (x) => x * 3);
      expect(r).toEqual(ok(6));
    });

    it("should pass through err", () => {
      const r = map(err("x"), (x) => x * 3);
      expect(r).toEqual(err("x"));
    });
  });

  describe("mapErr", () => {
    it("should transform error", () => {
      const r = mapErr(err("x"), (e) => `wrapped: ${e}`);
      expect(r).toEqual(err("wrapped: x"));
    });

    it("should pass through ok", () => {
      const r = mapErr(ok(1), (e) => `wrapped: ${e}`);
      expect(r).toEqual(ok(1));
    });
  });

  describe("andThen", () => {
    it("should chain ok results", () => {
      const double = (x) => ok(x * 2);
      const r = andThen(ok(5), double);
      expect(r).toEqual(ok(10));
    });

    it("should short-circuit on err", () => {
      const double = (x) => ok(x * 2);
      const r = andThen(err("fail"), double);
      expect(r).toEqual(err("fail"));
    });

    it("should propagate errors from the chained function", () => {
      const failIfNeg = (x) => (x < 0 ? err("negative") : ok(x));
      const r = andThen(ok(-1), failIfNeg);
      expect(r).toEqual(err("negative"));
    });
  });

  describe("fromPromise", () => {
    it("should wrap a resolved promise as ok", async () => {
      const r = await fromPromise(Promise.resolve(42), (e) => String(e));
      expect(r).toEqual(ok(42));
    });

    it("should wrap a rejected promise as err", async () => {
      const r = await fromPromise(
        Promise.reject(new Error("boom")),
        (e) => e.message,
      );
      expect(r).toEqual(err("boom"));
    });
  });
});
