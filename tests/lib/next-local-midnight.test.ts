/**
 * `nextLocalMidnight` produces the timestamp of the next 00:00:00 in
 * the browser's local timezone — the schedule anchor for the
 * midnight Signal refresh hook. Pure; tested with a clock-stub.
 *
 * The helper uses `Date.setHours(0, 0, 0, 0)` + +1 day, which is
 * unambiguous regardless of host timezone. DST transitions are
 * handled by setHours's own normalization, so the helper doesn't
 * need to special-case them.
 */
import { describe, it, expect } from "vitest";
import { nextLocalMidnight } from "@/lib/next-local-midnight";

describe("nextLocalMidnight", () => {
  it("returns midnight tomorrow when called at noon", () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const next = nextLocalMidnight(noon);
    const expected = new Date(noon);
    expected.setHours(24, 0, 0, 0); // next-day 00:00 local
    expect(next).toBe(expected.getTime());
  });

  it("returns tomorrow's midnight (not today's) when called at 00:00 sharp", () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const next = nextLocalMidnight(midnight);
    const expected = new Date(midnight);
    expected.setHours(24, 0, 0, 0);
    expect(next).toBe(expected.getTime());
  });

  it("returns tomorrow's midnight when called at 23:59:59 local", () => {
    const lateNight = new Date();
    lateNight.setHours(23, 59, 59, 0);
    const next = nextLocalMidnight(lateNight);
    const expected = new Date(lateNight);
    expected.setHours(24, 0, 0, 0);
    expect(next).toBe(expected.getTime());
  });

  it("is always strictly greater than `now`", () => {
    // Sweep ten random points in the day to be safe.
    for (let i = 0; i < 10; i++) {
      const t = new Date();
      t.setHours(Math.floor(Math.random() * 24), 0, 0, 0);
      expect(nextLocalMidnight(t)).toBeGreaterThan(t.getTime());
    }
  });
});
