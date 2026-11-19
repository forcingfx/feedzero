import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FeedFavicon } from "../../../src/components/feeds/feed-favicon.tsx";

describe("FeedFavicon avatar mode", () => {
  it("default (no avatar prop) is a rounded square with no ring", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/rounded-sm/);
    expect(img.className).not.toMatch(/ring-/);
  });

  it("avatar=true renders a circular, filled, ring-less favicon", () => {
    const { container } = render(
      <FeedFavicon siteUrl="https://example.com" avatar />,
    );
    const img = container.querySelector("img")!;
    expect(img.className).toMatch(/rounded-full/);
    expect(img.className).not.toMatch(/ring-1/);
  });
});
