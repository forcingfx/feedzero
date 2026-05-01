import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePullToAdvance, PULL_ZONE_HEIGHT } from "@/hooks/use-pull-to-advance";

/** Build a mock scroll container whose scroll properties are mutable. */
function makeScrollEl(clientHeight = 600, scrollHeight = 1200) {
  const el = document.createElement("div");
  let scrollTop = 0;
  let scrollToTarget = 0;
  Object.defineProperty(el, "clientHeight", { get: () => clientHeight });
  Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight });
  Object.defineProperty(el, "scrollTop", {
    get: () => scrollTop,
    set: (v: number) => { scrollTop = v; },
    configurable: true,
  });
  el.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    scrollToTarget = top ?? 0;
    scrollTop = scrollToTarget;
  }) as unknown as typeof el.scrollTo;
  return {
    el,
    setScrollTop: (v: number) => { scrollTop = v; },
    getScrollToTarget: () => scrollToTarget,
  };
}

/** Dispatch a scroll event then a scrollend event. */
function scrollAndEnd(el: HTMLElement) {
  el.dispatchEvent(new Event("scroll"));
  el.dispatchEvent(new Event("scrollend"));
}

describe("usePullToAdvance — bottom (next article)", () => {
  let onNext: ReturnType<typeof vi.fn>;
  let onPrev: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onNext = vi.fn();
    onPrev = vi.fn();
  });

  it("bottomProgress is 0 when scrollTop is before the pull zone", () => {
    const { el, setScrollTop } = makeScrollEl(600, 1200);
    const scrollRef = { current: el };

    const { result } = renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: true, hasPrev: false, onNext, onPrev }),
    );

    // Natural article end: scrollTop = scrollHeight - clientHeight - PULL_ZONE_HEIGHT
    setScrollTop(1200 - 600 - PULL_ZONE_HEIGHT);
    act(() => { el.dispatchEvent(new Event("scroll")); });

    expect(result.current.bottomProgress).toBe(0);
  });

  it("bottomProgress rises as user scrolls into the pull zone", () => {
    const { el, setScrollTop } = makeScrollEl(600, 1200);
    const scrollRef = { current: el };

    const { result } = renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: true, hasPrev: false, onNext, onPrev }),
    );

    // Half-way into pull zone
    setScrollTop(1200 - 600 - PULL_ZONE_HEIGHT + PULL_ZONE_HEIGHT / 2);
    act(() => { el.dispatchEvent(new Event("scroll")); });

    expect(result.current.bottomProgress).toBeGreaterThan(0);
    expect(result.current.bottomProgress).toBeLessThan(1);
  });

  it("calls onNext when scrollend occurs at full pull-zone depth", () => {
    const { el, setScrollTop } = makeScrollEl(600, 1200);
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: true, hasPrev: false, onNext, onPrev }),
    );

    // Fully into pull zone (at scrollHeight - clientHeight)
    setScrollTop(1200 - 600);
    act(() => { scrollAndEnd(el); });

    expect(onNext).toHaveBeenCalledOnce();
  });

  it("does NOT call onNext when scrollend occurs before pull threshold", () => {
    const { el, setScrollTop } = makeScrollEl(600, 1200);
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: true, hasPrev: false, onNext, onPrev }),
    );

    // Only 30px into pull zone — below threshold
    setScrollTop(1200 - 600 - PULL_ZONE_HEIGHT + 30);
    act(() => { scrollAndEnd(el); });

    expect(onNext).not.toHaveBeenCalled();
  });

  it("snaps back to article end when scrollend occurs below threshold", () => {
    const { el, setScrollTop, getScrollToTarget } = makeScrollEl(600, 1200);
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: true, hasPrev: false, onNext, onPrev }),
    );

    setScrollTop(1200 - 600 - PULL_ZONE_HEIGHT + 30);
    act(() => { scrollAndEnd(el); });

    // Should scroll back to just before the pull zone
    expect(getScrollToTarget()).toBe(1200 - 600 - PULL_ZONE_HEIGHT);
  });

  it("does nothing on bottom scroll when hasNext is false", () => {
    const { el, setScrollTop } = makeScrollEl(600, 1200);
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: false, onNext, onPrev }),
    );

    setScrollTop(1200 - 600);
    act(() => { scrollAndEnd(el); });

    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("usePullToAdvance — top (previous article)", () => {
  let onNext: ReturnType<typeof vi.fn>;
  let onPrev: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onNext = vi.fn();
    onPrev = vi.fn();
  });

  it("topPullPx increases as user pulls down from scrollTop=0", () => {
    const { el } = makeScrollEl();
    const scrollRef = { current: el };

    const { result } = renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: true, onNext, onPrev }),
    );

    act(() => {
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 100 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 180 } as Touch] }));
    });

    expect(result.current.topPullPx).toBeGreaterThan(0);
  });

  it("calls onPrev when touchend occurs past the pull threshold", () => {
    const { el } = makeScrollEl();
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: true, onNext, onPrev }),
    );

    act(() => {
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 0 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 90 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchend", {}));
    });

    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("does NOT call onPrev when touchend occurs below the pull threshold", () => {
    const { el } = makeScrollEl();
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: true, onNext, onPrev }),
    );

    act(() => {
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 0 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 30 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchend", {}));
    });

    expect(onPrev).not.toHaveBeenCalled();
  });

  it("resets topPullPx after touchend", () => {
    const { el } = makeScrollEl();
    const scrollRef = { current: el };

    const { result } = renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: true, onNext, onPrev }),
    );

    act(() => {
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 0 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 50 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchend", {}));
    });

    expect(result.current.topPullPx).toBe(0);
  });

  it("does not start pull when scrollTop is not at top", () => {
    const { el, setScrollTop } = makeScrollEl();
    const scrollRef = { current: el };
    setScrollTop(100); // not at top

    const { result } = renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: true, onNext, onPrev }),
    );

    act(() => {
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 0 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 90 } as Touch] }));
    });

    expect(result.current.topPullPx).toBe(0);
  });

  it("does nothing on top pull when hasPrev is false", () => {
    const { el } = makeScrollEl();
    const scrollRef = { current: el };

    renderHook(() =>
      usePullToAdvance({ scrollRef, hasNext: false, hasPrev: false, onNext, onPrev }),
    );

    act(() => {
      el.dispatchEvent(new TouchEvent("touchstart", { touches: [{ clientY: 0 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [{ clientY: 90 } as Touch] }));
      el.dispatchEvent(new TouchEvent("touchend", {}));
    });

    expect(onPrev).not.toHaveBeenCalled();
  });
});
