import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StageSkeleton } from "@/components/loading/stage-skeleton.tsx";

/**
 * Fallback for lazy stage routes (Explore/Stats/Settings/Signal). A
 * blank flash reads as "broken"; a pulsing layout reads as "loading".
 */
describe("<StageSkeleton>", () => {
  it("announces itself as a loading status region", () => {
    render(<StageSkeleton />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", expect.stringMatching(/loading/i));
  });

  it("renders pulsing placeholder blocks that mirror a stage layout", () => {
    const { container } = render(<StageSkeleton />);
    expect(
      container.querySelectorAll("[data-slot='skeleton']").length,
    ).toBeGreaterThanOrEqual(3);
  });
});
