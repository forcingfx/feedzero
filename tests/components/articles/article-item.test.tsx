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

  it("does not re-render when props are unchanged", () => {
    const article = mockArticle();
    const onSelect = () => {};

    // Wrap ArticleItem to track renders
    function Wrapper({ count }: { count: number }) {
      // count forces Wrapper to re-render, but ArticleItem should skip
      return (
        <>
          <span data-testid="count">{count}</span>
          <ArticleItem
            article={article}
            isSelected={false}
            onSelect={onSelect}
          />
        </>
      );
    }

    const { rerender } = render(<Wrapper count={0} />);
    const titleEl = screen.getByText("Test Article");
    const initialHtml = titleEl.closest("li")!.innerHTML;

    // Re-render parent with different prop — ArticleItem props unchanged
    rerender(<Wrapper count={1} />);
    const afterHtml = titleEl.closest("li")!.innerHTML;

    // Memoized component should produce identical DOM
    expect(afterHtml).toBe(initialHtml);
  });

  describe("visual polish", () => {
    it("has transition-colors for smooth hover effect", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
        />,
      );
      const li = container.querySelector("li");
      expect(li?.className).toContain("transition-colors");
    });

    it("shows accent bar on selected item", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={true}
          onSelect={() => {}}
        />,
      );
      const li = container.querySelector("li");
      // The bar uses a color change on selection, not a width change.
      expect(li?.className).toContain("aria-selected:border-l-primary");
    });

    it("reserves space for the accent bar so selection does not shift text", () => {
      // If border-l-2 is only added on selection, the 2px border pushes
      // the text inward by 2px when the user clicks an article — a visible
      // horizontal jiggle. Reserve the space always (transparent border)
      // and only swap the color on selection.
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
        />,
      );
      const li = container.querySelector("li");
      expect(li?.className).toContain("border-l-2");
      expect(li?.className).toContain("border-l-transparent");
    });

    it("dims read article titles", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle({ read: true })}
          isSelected={false}
          onSelect={() => {}}
        />,
      );
      const titleDiv = container.querySelector(".text-foreground\\/70");
      expect(titleDiv).toBeInTheDocument();
    });

    it("shows full contrast for unread article titles", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle({ read: false })}
          isSelected={false}
          onSelect={() => {}}
        />,
      );
      const titleDiv = container.querySelector(".text-foreground");
      expect(titleDiv).toBeInTheDocument();
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
        "/api/icon?domain=example.com",
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

  describe("star + favicon alignment (mobile-friendly)", () => {
    it("renders the starred indicator in a dedicated side column, not inline in the title", () => {
      // The old layout dropped the Star inline after the title with
      // `align-text-bottom`, which looked floor-aligned on multi-line
      // titles and disappeared into the wrap. The side column gives it
      // a deterministic anchor (top-right) and unblocks the favicon
      // moving to the bottom-right.
      const { container } = render(
        <ArticleItem
          article={mockArticle({ starred: true })}
          isSelected={false}
          onSelect={() => {}}
        />,
      );

      const star = screen.getByTestId("article-star-indicator");
      const title = screen.getByText("Test Article");
      expect(title.contains(star)).toBe(false);

      const side = container.querySelector(
        '[data-testid="article-item-side"]',
      );
      expect(side).not.toBeNull();
      expect(side!.contains(star)).toBe(true);
    });

    it("when both starred and a favicon source are present, the favicon sits below the star", () => {
      // Star takes the prime top-right slot; favicon moves to bottom-right
      // when both render in the same side column.
      const { container } = render(
        <ArticleItem
          article={mockArticle({ starred: true })}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
          feedSiteUrl="https://example.com"
        />,
      );

      const side = container.querySelector(
        '[data-testid="article-item-side"]',
      )!;
      const star = screen.getByTestId("article-star-indicator");
      const favicon = container.querySelector("img")!;
      expect(side.contains(star)).toBe(true);
      expect(side.contains(favicon)).toBe(true);

      // Star precedes favicon in DOM order (top before bottom under the
      // column's vertical layout).
      const cmp = star.compareDocumentPosition(favicon);
      expect(cmp & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("renders the favicon in the side column even when the article is not starred", () => {
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
          feedSiteUrl="https://example.com"
        />,
      );

      const side = container.querySelector(
        '[data-testid="article-item-side"]',
      )!;
      const favicon = container.querySelector("img")!;
      expect(side.contains(favicon)).toBe(true);
    });
  });
});
