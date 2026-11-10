import { useEffect, useRef, type ReactNode, type PointerEvent } from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
  type Transition,
} from "motion/react";
import { shouldCommitSwipeBack } from "@/lib/swipe-back.ts";

/** iOS's navigation curve: fast start, long gentle settle. */
const IOS_EASE = [0.32, 0.72, 0, 1] as const;
const ENTER: Transition = { type: "tween", ease: IOS_EASE, duration: 0.3 };
const EXIT: Transition = { type: "tween", ease: IOS_EASE, duration: 0.22 };
const SNAP_BACK: Transition = { type: "spring", stiffness: 500, damping: 45 };
const INSTANT: Transition = { duration: 0 };

/**
 * Full-viewport layer hosting the mobile reader above the article list.
 * Slides in from the right on mount. A rightward drag anywhere on it
 * follows the finger (Motion drag); a flick or a drag past about a third
 * of the width slides it off screen and THEN calls `onBack`, so the
 * route change never cuts an animation short. An early release springs
 * back.
 *
 * Drags start by hand (`dragListener={false}`) for three reasons:
 * Motion's own listener sets `user-select: none`, which would make
 * article text uncopyable; `<pre>` blocks keep their native horizontal
 * pan; and only touch drags count, since in a narrow desktop window a
 * mouse drag is text selection. Not edge-gated: mobile browsers own the
 * screen edge for their own back gesture.
 */
export default function MobileReaderLayer({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  // Pixels, never "100%": Motion cannot resolve a percentage offset
  // without a layout measurement, so a drag caught mid-entry would jump.
  const x = useMotionValue(reduceMotion ? 0 : window.innerWidth);
  const dragControls = useDragControls();
  const lockedAxis = useRef<"x" | "y" | null>(null);

  useEffect(() => {
    const entry = animate(x, 0, reduceMotion ? INSTANT : ENTER);
    return () => entry.stop();
  }, [x, reduceMotion]);

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (event.target instanceof Element && event.target.closest("pre")) return;
    lockedAxis.current = null;
    dragControls.start(event);
  }

  function finishSwipe(_: unknown, info: PanInfo) {
    const width = layerRef.current?.clientWidth || window.innerWidth;
    // A drag Motion locked to the y axis is a scroll: the layer never
    // moved, and its stray horizontal speed must not count as a flick.
    const offsetX = lockedAxis.current === "x" ? info.offset.x : 0;
    const release = { offsetX, velocityX: info.velocity.x, width };
    if (shouldCommitSwipeBack(release)) {
      void animate(x, width, reduceMotion ? INSTANT : EXIT).then(onBack);
    } else {
      void animate(x, 0, reduceMotion ? INSTANT : SNAP_BACK);
    }
  }

  return (
    <motion.div
      ref={layerRef}
      data-testid="reader-layer"
      data-reader-layer
      className="absolute inset-0 z-20 bg-background will-change-transform"
      style={{ x }}
      drag="x"
      dragListener={false}
      dragControls={dragControls}
      dragDirectionLock
      onDirectionLock={(axis) => (lockedAxis.current = axis)}
      dragConstraints={{ left: 0 }}
      dragElastic={0}
      dragMomentum={false}
      onPointerDown={startSwipe}
      onDragEnd={finishSwipe}
    >
      {children}
    </motion.div>
  );
}
