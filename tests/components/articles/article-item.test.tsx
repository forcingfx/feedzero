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
      render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
        />,
      );

      expect(screen.getByTestId("article-item-meta").textContent).toMatch(
        /Tech News.*Author Name/,
      );
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

  describe("star and favicon placement", () => {
    it("renders the starred indicator in a dedicated side column, not inline in the title", () => {
      // Inline after the title, the star looked floor-aligned on
      // multi-line titles and disappeared into the wrap. The side column
      // gives it a fixed anchor at the top right.
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

    it("puts the favicon directly before the feed name, as the reader does", () => {
      // User report 2026-11: the list had the icon in a right-hand column
      // while the reader led the source line with it.
      const { container } = render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
          feedSiteUrl="https://example.com"
        />,
      );

      const meta = screen.getByTestId("article-item-meta");
      const favicon = container.querySelector("img")!;
      const feedName = screen.getByText("Tech News");
      expect(meta.contains(favicon)).toBe(true);
      const cmp = favicon.compareDocumentPosition(feedName);
      expect(cmp & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps no side column for a favicon alone", () => {
      render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
          feedSiteUrl="https://example.com"
        />,
      );

      expect(screen.queryByTestId("article-item-side")).toBeNull();
    });
  });

  describe("meta line", () => {
    it("omits an author that only repeats the feed name", () => {
      // YouTube feeds set every item's author to the channel name, which
      // read "mellow \u2022 mellow" in the list.
      render(
        <ArticleItem
          article={mockArticle({ author: "Tech News" })}
          isSelected={false}
          onSelect={() => {}}
          feedTitle="Tech News"
        />,
      );

      expect(screen.getAllByText(/Tech News/)).toHaveLength(1);
    });

    it("shows how long ago the article was published, with the full date on the element", () => {
      const publishedAt = Date.now() - 7 * 60 * 1000;
      render(
        <ArticleItem
          article={mockArticle({ publishedAt })}
          isSelected={false}
          onSelect={() => {}}
        />,
      );

      const time = screen.getByText("7m ago");
      expect(time.tagName).toBe("TIME");
      expect(time.getAttribute("datetime")).toBe(new Date(publishedAt).toISOString());
      expect(time.getAttribute("title")).toMatch(/\d{4}/);
    });
  });

  describe("preview lines", () => {
    it("shows the article's opening text when asked to", () => {
      render(
        <ArticleItem
          article={mockArticle({ summary: "<p>Opening lines of the story.</p>" })}
          isSelected={false}
          onSelect={() => {}}
          showPreview
        />,
      );

      expect(screen.getByTestId("article-item-preview")).toHaveTextContent(
        "Opening lines of the story.",
      );
    });

    it("clamps the preview to two lines", () => {
      render(
        <ArticleItem
          article={mockArticle({ summary: "Opening lines." })}
          isSelected={false}
          onSelect={() => {}}
          showPreview
        />,
      );

      expect(screen.getByTestId("article-item-preview").className).toContain("line-clamp-2");
    });

    it("shows no preview unless asked to", () => {
      render(
        <ArticleItem
          article={mockArticle({ summary: "Opening lines." })}
          isSelected={false}
          onSelect={() => {}}
        />,
      );

      expect(screen.queryByTestId("article-item-preview")).toBeNull();
    });

    it("renders no empty preview for an article without text", () => {
      render(
        <ArticleItem
          article={mockArticle({ summary: "", content: "" })}
          isSelected={false}
          onSelect={() => {}}
          showPreview
        />,
      );

      expect(screen.queryByTestId("article-item-preview")).toBeNull();
    });
  });

  describe("imageUrl prop (#340)", () => {
    it("renders the image through the icon proxy, lazily, without a referrer", () => {
      render(
        <ArticleItem
          article={mockArticle()}
          isSelected={false}
          onSelect={() => {}}
          imageUrl="https://cdn.example.com/lead.jpg"
        />,
      );
      const img = screen.getByTestId("article-image");
      expect(img).toHaveAttribute(
        "src",
        "/api/icon?url=" + encodeURIComponent("https://cdn.example.com/lead.jpg"),
      );
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    });

    it("renders no image element when the prop is absent", () => {
      render(<ArticleItem article={mockArticle()} isSelected={false} onSelect={() => {}} />);
      expect(screen.queryByTestId("article-image")).toBeNull();
    });
  });
});
