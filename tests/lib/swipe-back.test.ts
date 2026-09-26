import { describe, it, expect } from "vitest";
import { shouldCommitSwipeBack } from "@/lib/swipe-back";

const WIDTH = 390; // Pixel-5-class phone

describe("shouldCommitSwipeBack", () => {
  // The old gesture committed on distance alone (96px), so the quick
  // short flick people actually use to go back did nothing. Native
  // back gestures commit on speed OR distance; this mirrors that.
  it("a quick short flick goes back", () => {
    expect(shouldCommitSwipeBack({ offsetX: 40, velocityX: 600, width: WIDTH })).toBe(true);
  });

  it("a slow drag past roughly a third of the width goes back", () => {
    expect(shouldCommitSwipeBack({ offsetX: 150, velocityX: 0, width: WIDTH })).toBe(true);
  });

  it("a slow short drag snaps back", () => {
    expect(shouldCommitSwipeBack({ offsetX: 80, velocityX: 50, width: WIDTH })).toBe(false);
  });

  it("dragging far and then flicking back left cancels (the user changed their mind)", () => {
    expect(shouldCommitSwipeBack({ offsetX: 250, velocityX: -600, width: WIDTH })).toBe(false);
  });

  it("a layer that never moved does not go back, whatever the speed", () => {
    // A vertical scroll locks the drag to the y axis; its stray
    // horizontal velocity must not count as a flick.
    expect(shouldCommitSwipeBack({ offsetX: 0, velocityX: 900, width: WIDTH })).toBe(false);
  });
});
