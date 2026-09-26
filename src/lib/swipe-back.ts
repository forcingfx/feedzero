/** Share of the layer width past which a slow release goes back. */
export const SWIPE_BACK_DISTANCE_RATIO = 0.35;

/** Release speed (px/s) that counts as a flick, whatever the distance. */
export const SWIPE_BACK_FLICK_VELOCITY = 400;

interface SwipeRelease {
  /** How far right the layer sits at release, in px. */
  offsetX: number;
  /** Horizontal speed at release, in px/s; positive is rightward. */
  velocityX: number;
  /** Layer width in px. */
  width: number;
}

/**
 * Decide whether releasing a swipe-back drag leaves the reader. Like the
 * native iOS gesture, speed OR distance commits: a quick short flick
 * goes back, as does a slow drag past about a third of the screen. A
 * release while moving back left cancels, so the user can change their
 * mind mid-drag.
 */
export function shouldCommitSwipeBack({ offsetX, velocityX, width }: SwipeRelease): boolean {
  if (offsetX <= 0) return false;
  if (velocityX >= SWIPE_BACK_FLICK_VELOCITY) return true;
  if (velocityX <= -SWIPE_BACK_FLICK_VELOCITY) return false;
  return offsetX >= width * SWIPE_BACK_DISTANCE_RATIO;
}
