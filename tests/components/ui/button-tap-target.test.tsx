import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button.tsx";

/**
 * Tier-2 structural: compact icon buttons must carry an expanded hit
 * area so their effective tap target reaches the 44px Apple HIG floor
 * while the rendered size stays compact (size-8 = 32px + 2×6px = 44px).
 */
describe("Button tap targets", () => {
  it("icon-sm expands its effective hit area to ≥44px", () => {
    render(
      <Button size="icon-sm" aria-label="compact">
        x
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "compact" });
    expect(btn.className).toContain("after:-inset-1.5");
    expect(btn.className).toContain("after:absolute");
  });
});
