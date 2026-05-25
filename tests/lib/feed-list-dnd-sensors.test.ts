/**
 * Activation constraints for the sidebar feed-list DnD.
 *
 * Mobile users were reporting that the first finger-down to scroll the
 * feed list immediately picked a feed up and dragged it — making the
 * list effectively un-scrollable. The fix is to split the sensor by
 * input: mouse keeps the small-distance threshold (instant drag once
 * you've moved 8px), touch requires a brief hold-press before drag
 * activates (so a scroll gesture doesn't trip it). The numeric values
 * live in `feed-list-dnd-sensors.ts` so a regression that loses the
 * mobile hold-to-drag, or shortens it below the comfort threshold,
 * trips this test.
 */
import { describe, it, expect } from "vitest";
import {
  FEED_LIST_MOUSE_DISTANCE_PX,
  FEED_LIST_TOUCH_HOLD_MS,
  FEED_LIST_TOUCH_TOLERANCE_PX,
  buildFeedListSensorDescriptors,
} from "@/lib/feed-list-dnd-sensors.ts";

describe("feed-list DnD sensor constraints", () => {
  it("mouse activates after a small movement so desktop drag stays snappy", () => {
    expect(FEED_LIST_MOUSE_DISTANCE_PX).toBe(8);
  });

  it("touch requires a hold long enough that a scroll swipe never trips drag", () => {
    // 250ms is the @dnd-kit recommended floor for mobile hold-to-drag —
    // long enough for the user's first scroll-swipe to pass the
    // tolerance window and be classified as scroll, short enough that
    // an intentional long-press feels responsive.
    expect(FEED_LIST_TOUCH_HOLD_MS).toBeGreaterThanOrEqual(200);
    expect(FEED_LIST_TOUCH_HOLD_MS).toBeLessThanOrEqual(400);
  });

  it("touch tolerance leaves room for finger jitter during the hold", () => {
    expect(FEED_LIST_TOUCH_TOLERANCE_PX).toBeGreaterThan(0);
    expect(FEED_LIST_TOUCH_TOLERANCE_PX).toBeLessThan(FEED_LIST_MOUSE_DISTANCE_PX);
  });

  it("emits one mouse descriptor and one touch descriptor with the right activation constraints", () => {
    const descriptors = buildFeedListSensorDescriptors();
    expect(descriptors).toHaveLength(2);

    const mouse = descriptors.find((d) => d.kind === "mouse");
    expect(mouse?.options.activationConstraint).toEqual({
      distance: FEED_LIST_MOUSE_DISTANCE_PX,
    });

    const touch = descriptors.find((d) => d.kind === "touch");
    expect(touch?.options.activationConstraint).toEqual({
      delay: FEED_LIST_TOUCH_HOLD_MS,
      tolerance: FEED_LIST_TOUCH_TOLERANCE_PX,
    });
  });
});
