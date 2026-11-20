import { describe, it, expect, afterEach } from "vitest";
import {
  computeSystemTextScale,
  applySystemTextScale,
  followSystemTextScale,
  SYSTEM_TEXT_SCALE_VAR,
} from "@/lib/system-text-scale.ts";

/**
 * The app's sizes follow the device's text size (owner request,
 * 2026-11-20). The scale is the device's size over that platform's
 * default, so 1 means "the person changed nothing".
 */
describe("computeSystemTextScale", () => {
  it("is 1 at the browser's default font size", () => {
    expect(computeSystemTextScale({ browserDefaultPx: 16, appleBodyPx: null })).toBe(1);
  });

  it("grows with a larger browser default", () => {
    expect(computeSystemTextScale({ browserDefaultPx: 20, appleBodyPx: null })).toBe(1.25);
  });

  it("shrinks with a smaller one", () => {
    expect(computeSystemTextScale({ browserDefaultPx: 14, appleBodyPx: null })).toBe(0.875);
  });

  it("uses Dynamic Type on Apple touch devices, where 17px is the default body size", () => {
    expect(computeSystemTextScale({ browserDefaultPx: 16, appleBodyPx: 17 })).toBe(1);
    expect(computeSystemTextScale({ browserDefaultPx: 16, appleBodyPx: 23 })).toBeCloseTo(1.353, 3);
  });

  // Pin: accessibility sizes can reach three times the default. Past 2x
  // the fixed chrome (tab bar, pills) stops fitting a phone, so the app
  // follows up to there and no further.
  it("is held between 0.75 and 2", () => {
    expect(computeSystemTextScale({ browserDefaultPx: 64, appleBodyPx: null })).toBe(2);
    expect(computeSystemTextScale({ browserDefaultPx: 6, appleBodyPx: null })).toBe(0.75);
  });

  it("falls back to 1 when the size cannot be measured", () => {
    expect(computeSystemTextScale({ browserDefaultPx: 0, appleBodyPx: null })).toBe(1);
    expect(computeSystemTextScale({ browserDefaultPx: Number.NaN, appleBodyPx: null })).toBe(1);
  });
});

describe("applySystemTextScale", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(SYSTEM_TEXT_SCALE_VAR);
  });

  it("publishes the scale on the root element for the stylesheet to use", () => {
    applySystemTextScale(() => ({ browserDefaultPx: 20, appleBodyPx: null }));
    expect(document.documentElement.style.getPropertyValue(SYSTEM_TEXT_SCALE_VAR)).toBe("1.25");
  });

  it("leaves no measuring elements behind", () => {
    const before = document.body.childElementCount;
    applySystemTextScale();
    expect(document.body.childElementCount).toBe(before);
  });
});

describe("followSystemTextScale", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(SYSTEM_TEXT_SCALE_VAR);
  });

  it("applies the scale at once", () => {
    const stop = followSystemTextScale();
    expect(document.documentElement.style.getPropertyValue(SYSTEM_TEXT_SCALE_VAR)).not.toBe("");
    stop();
  });

  // Changing the device's text size means leaving for its settings, so
  // coming back to the app is when a new value has to be picked up.
  it("measures again when the app returns to the foreground, until stopped", () => {
    const root = document.documentElement;
    const stop = followSystemTextScale();

    root.style.setProperty(SYSTEM_TEXT_SCALE_VAR, "stale");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.style.getPropertyValue(SYSTEM_TEXT_SCALE_VAR)).not.toBe("stale");

    stop();
    root.style.setProperty(SYSTEM_TEXT_SCALE_VAR, "stale");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root.style.getPropertyValue(SYSTEM_TEXT_SCALE_VAR)).toBe("stale");
  });
});
