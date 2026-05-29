/**
 * AppShellSkeleton — first-paint placeholder while AppInit waits on the
 * local DB. The skeleton must mirror AppLayout's chrome (sidebar +
 * empty content on desktop, header + content + bottom drawer strip on
 * mobile) so the boot-to-app transition doesn't visually snap.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShellSkeleton } from "@/components/loading/app-shell-skeleton.tsx";

function setDesktop(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop && query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("AppShellSkeleton", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setDesktop(true);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("announces the loading state for assistive tech", () => {
    render(<AppShellSkeleton />);
    expect(screen.getByRole("status")).toHaveAccessibleName(/loading/i);
  });

  it("renders the desktop sidebar placeholder", () => {
    setDesktop(true);
    const { container } = render(<AppShellSkeleton />);
    // The desktop chrome is a sidebar (border-r) plus an empty content
    // area — assert via the shell class so the layout intent is locked.
    expect(container.querySelector("aside.border-r")).toBeTruthy();
  });

  it("renders the mobile header + bottom-drawer chrome", () => {
    setDesktop(false);
    const { container } = render(<AppShellSkeleton />);
    // Mobile shell: top header (h-12 border-b) and a bottom strip
    // matching the nav drawer footprint (border-t).
    expect(container.querySelector("header.border-b")).toBeTruthy();
    expect(container.querySelector(".border-t")).toBeTruthy();
  });
});
