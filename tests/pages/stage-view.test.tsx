/**
 * StageView on mobile (2026-11-10, glass bars). Ordinary pages scroll in
 * StageView's <main>, which runs under both glass bars and pads by
 * --chrome-top / --chrome-bottom. A page that scrolls inside its own box
 * (Signal: pinned tabs over its own scroller) asks for `selfScrolling`:
 * the <main> then only clears the header and does not scroll itself, so
 * there is one scroller, not two nested ones.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StageView } from "@/pages/stage-view.tsx";

vi.mock("@/hooks/use-media-query.ts", () => ({
  useMediaQuery: vi.fn().mockReturnValue(false),
  useIsDesktop: vi.fn().mockReturnValue(false),
}));

describe("<StageView> on mobile", () => {
  it("scrolls in <main> and clears both glass bars", () => {
    render(<StageView><p>page</p></StageView>);
    const main = screen.getByRole("main");
    expect(main.className).toContain("overflow-y-auto");
    expect(main.className).toContain("pt-[var(--chrome-top,0px)]");
    expect(main.className).toContain("pb-[var(--chrome-bottom,0px)]");
  });

  it("selfScrolling: <main> clears the header only and does not scroll", () => {
    render(<StageView selfScrolling><p>page</p></StageView>);
    const main = screen.getByRole("main");
    expect(main.className).not.toContain("overflow-y-auto");
    expect(main.className).toContain("overflow-hidden");
    expect(main.className).toContain("pt-[var(--chrome-top,0px)]");
    expect(main.className).not.toContain("pb-[var(--chrome-bottom,0px)]");
  });
});
