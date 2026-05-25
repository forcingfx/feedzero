/**
 * Activation constraints for the sidebar feed-list DnD.
 *
 * Mobile users were dragging a feed the moment their finger touched the
 * list — there was no way to scroll without picking a feed up. @dnd-kit
 * `PointerSensor` with `{ distance: 8 }` (the old config) treats the
 * first 8px of finger travel as the start of a drag, which is exactly
 * the start of every scroll swipe. The fix is per-input sensors:
 *
 *   - Mouse: small distance threshold → snappy desktop drag.
 *   - Touch: short hold + tiny tolerance → a scroll gesture leaves the
 *     tolerance window before the delay elapses and is classified as
 *     scroll. A deliberate long-press still picks a feed up.
 *
 * Numeric values are exported so the unit test can lock them down —
 * shortening the hold below ~200ms reintroduces the original bug.
 */

import {
  MouseSensor,
  TouchSensor,
  type MouseSensorOptions,
  type TouchSensorOptions,
} from "@dnd-kit/core";

export const FEED_LIST_MOUSE_DISTANCE_PX = 8;
export const FEED_LIST_TOUCH_HOLD_MS = 250;
export const FEED_LIST_TOUCH_TOLERANCE_PX = 5;

export const FEED_LIST_MOUSE_SENSOR_OPTIONS: MouseSensorOptions = {
  activationConstraint: { distance: FEED_LIST_MOUSE_DISTANCE_PX },
};

export const FEED_LIST_TOUCH_SENSOR_OPTIONS: TouchSensorOptions = {
  activationConstraint: {
    delay: FEED_LIST_TOUCH_HOLD_MS,
    tolerance: FEED_LIST_TOUCH_TOLERANCE_PX,
  },
};

export type FeedListSensorDescriptor =
  | { kind: "mouse"; sensor: typeof MouseSensor; options: MouseSensorOptions }
  | { kind: "touch"; sensor: typeof TouchSensor; options: TouchSensorOptions };

/**
 * Sensor descriptors consumed by `sidebar-feed-list.tsx`. Returned as a
 * plain array rather than calling `useSensors` here so this module
 * stays pure (no React) and trivially testable.
 */
export function buildFeedListSensorDescriptors(): FeedListSensorDescriptor[] {
  return [
    { kind: "mouse", sensor: MouseSensor, options: FEED_LIST_MOUSE_SENSOR_OPTIONS },
    { kind: "touch", sensor: TouchSensor, options: FEED_LIST_TOUCH_SENSOR_OPTIONS },
  ];
}
