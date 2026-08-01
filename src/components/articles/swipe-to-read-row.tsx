import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import type { Article } from "@feedzero/core/types";

/** Rightward travel (px) required to commit the read/unread toggle. */
const COMMIT_THRESHOLD = 64;
/** Movement (px) before we decide whether the gesture is ours. */
const ARM_SLOP = 12;
/** Cap on the visual translate so the row can't fly off-screen. */
const MAX_PULL = 120;

interface SwipeToReadRowProps {
  article: Article;
  /** Off on desktop — mouse users have hover affordances and keyboard. */
  enabled: boolean;
  children: ReactNode;
}

/**
 * Swipe-RIGHT on an article row toggles read/unread (Mail muscle
 * memory). Only rightward, deliberately: on mobile the article list is
 * the leftmost snap-pager panel, so leftward swipes page to the reader
 * — a leftward row action would fight that gesture. Rightward has no
 * pager meaning (nothing further left), making it conflict-free.
 *
 * Gesture arbitration: we arm only once the drag proves
 * rightward-dominant (dx > 1.5·|dy| past a small slop); vertical
 * drags stay with the list scroller and leftward drags with the pager.
 * After arming we preventDefault() further touchmoves so the browser
 * doesn't pan mid-drag — that requires a NON-passive native listener
 * (React's root touch listeners are passive, so this cannot use
 * synthetic onTouchMove).
 */
export function SwipeToReadRow({
  article,
  enabled,
  children,
}: SwipeToReadRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const dxRef = useRef(0);
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    armed: boolean;
    aborted: boolean;
  } | null>(null);
  // article.read at gesture-commit time, read via ref so the listeners
  // (bound once per enabled-toggle) never capture a stale flag.
  const readRef = useRef(article.read);
  readRef.current = article.read;
  const idRef = useRef(article.id);
  idRef.current = article.id;

  useEffect(() => {
    const el = rootRef.current;
    if (!enabled || !el) return;

    function setPull(value: number) {
      dxRef.current = value;
      setDx(value);
    }

    function handleStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      gestureRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        armed: false,
        aborted: false,
      };
    }

    function handleMove(e: TouchEvent) {
      const g = gestureRef.current;
      const t = e.touches[0];
      if (!g || g.aborted || !t) return;
      const rawDx = t.clientX - g.startX;
      const rawDy = t.clientY - g.startY;

      if (!g.armed) {
        if (Math.abs(rawDx) < ARM_SLOP && Math.abs(rawDy) < ARM_SLOP) return;
        if (rawDx > 0 && rawDx > Math.abs(rawDy) * 1.5) {
          g.armed = true;
        } else {
          // Leftward or vertical-dominant: the pager / scroller owns it.
          g.aborted = true;
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      setPull(Math.max(0, Math.min(rawDx, MAX_PULL)));
    }

    function handleEnd() {
      const g = gestureRef.current;
      gestureRef.current = null;
      const commit = Boolean(g?.armed) && dxRef.current >= COMMIT_THRESHOLD;
      setPull(0);
      if (!commit) return;
      const { markAsRead, markUnread } = useArticleStore.getState();
      if (readRef.current) void markUnread([idRef.current]);
      else void markAsRead(idRef.current);
    }

    el.addEventListener("touchstart", handleStart, { passive: true });
    el.addEventListener("touchmove", handleMove, { passive: false });
    el.addEventListener("touchend", handleEnd);
    el.addEventListener("touchcancel", handleEnd);
    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", handleEnd);
    };
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  const pastThreshold = dx >= COMMIT_THRESHOLD;
  const Icon = article.read ? Undo2 : CheckCheck;

  return (
    <div
      ref={rootRef}
      data-testid="swipe-to-read-row"
      className="relative overflow-hidden"
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center pl-4 transition-colors",
          pastThreshold
            ? "bg-primary text-primary-foreground"
            : "bg-primary/15 text-primary",
          dx === 0 && "hidden",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div
        className="relative bg-background"
        style={{
          transform: dx > 0 ? `translateX(${dx}px)` : undefined,
          transition: dx === 0 ? "transform 150ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
