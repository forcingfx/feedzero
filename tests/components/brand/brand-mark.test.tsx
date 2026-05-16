import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "@/components/brand/brand-mark.tsx";

describe("BrandMark", () => {
  it("renders the 192x192 PNG so the icon stays crisp at any in-product size", () => {
    render(<BrandMark className="size-8" />);
    const img = screen.getByRole("img", { name: /feedzero/i });
    expect(img.getAttribute("src")).toBe("/icon-192.png");
  });

  it("merges caller-supplied class names with the base utility classes", () => {
    render(<BrandMark className="size-16 ring-2" />);
    const img = screen.getByRole("img", { name: /feedzero/i });
    expect(img.className).toContain("size-16");
    expect(img.className).toContain("ring-2");
    // Base classes are preserved so non-shrinking + non-draggable behaviors
    // can't be lost by callers passing only sizing.
    expect(img.className).toContain("shrink-0");
    expect(img.className).toContain("select-none");
  });

  it("accepts an empty alt so the mark can sit next to the wordmark without double-announcing", () => {
    const { container } = render(<BrandMark alt="" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("alt")).toBe("");
  });
});
