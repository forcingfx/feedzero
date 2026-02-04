import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ArticleContent } from "@/components/reader/article-content.tsx";

describe("ArticleContent", () => {
  it("renders sanitized HTML content", () => {
    const { container } = render(
      <ArticleContent html="<p>Hello world</p>" />,
    );
    expect(container.querySelector("p")?.textContent).toBe("Hello world");
  });

  it("strips script tags via DOMPurify", () => {
    const { container } = render(
      <ArticleContent html='<p>Safe</p><script>var x = 1;</script>' />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Safe");
  });

  it("preserves target attribute on links", () => {
    const { container } = render(
      <ArticleContent html='<a href="https://example.com" target="_blank">Link</a>' />,
    );
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("target")).toBe("_blank");
  });

  it("has max-w-180 class for readability", () => {
    const { container } = render(<ArticleContent html="<p>text</p>" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("max-w-180");
  });

  it("has animation classes", () => {
    const { container } = render(<ArticleContent html="<p>text</p>" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("animate-in");
    expect(wrapper?.className).toContain("fade-in");
  });

  it("handles empty string without error", () => {
    const { container } = render(<ArticleContent html="" />);
    expect(container.firstElementChild).not.toBeNull();
  });
});
