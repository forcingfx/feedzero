import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleItem } from "@/components/articles/article-item.tsx";

const mockArticle = (overrides = {}) => ({
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "Test Article",
  link: "https://example.com/a1",
  content: "<p>content</p>",
  summary: "summary",
  author: "Author Name",
  publishedAt: Date.now(),
  read: false,
  createdAt: Date.now(),
  ...overrides,
});

describe("ArticleItem", () => {
  it("renders article title", () => {
    render(
      <ArticleItem
        article={mockArticle()}
        isSelected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Test Article")).toBeInTheDocument();
  });

  it("renders author when present", () => {
    render(
      <ArticleItem
        article={mockArticle()}
        isSelected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText(/Author Name/)).toBeInTheDocument();
  });

  describe("feedTitle prop", () => {
    it("renders feed title when feedTitle prop is provided", () => {
      render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
        />,
      );

      expect(screen.getByText(/Tech News/)).toBeInTheDocument();
    });

    it("does not render feed title when feedTitle is not provided", () => {
      render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
        />,
      );

      expect(screen.queryByText(/Tech News/)).not.toBeInTheDocument();
    });

    it("renders feed title before author", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
        />,
      );

      const metaLine = container.querySelector(".text-xs");
      expect(metaLine?.textContent).toMatch(/Tech News.*Author Name/);
    });
  });

  describe("feedSiteUrl prop (favicon in global view)", () => {
    it("renders favicon when feedSiteUrl is provided", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
          feedSiteUrl="https://example.com"
        />,
      );

      const img = container.querySelector("img");
      expect(img!.getAttribute("src")).toBe(
        "/api/icon?url=https%3A%2F%2Fexample.com%2Ffavicon.ico",
      );
    });

    it("does not render favicon when feedSiteUrl is not provided", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
        />,
      );

      expect(container.querySelector("img")).not.toBeInTheDocument();
    });

    it("renders fallback icon when feedSiteUrl is invalid", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
          feedSiteUrl="not-a-url"
        />,
      );

      // FeedFavicon shows Rss icon as fallback for invalid URLs
      expect(container.querySelector("img")).not.toBeInTheDocument();
    });
  });
});
