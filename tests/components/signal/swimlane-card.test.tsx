import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SwimlaneCard } from "../../../src/components/signal/swimlane-card.tsx";
import type { Article, Feed } from "../../../src/types";

const ARTICLE: Article = {
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "Some article title",
  link: "https://example.com/a1",
  content: "",
  summary: "Short summary",
  author: "",
  publishedAt: Date.now() - 60 * 60 * 1000,
  read: false,
  createdAt: Date.now(),
};

const FEED: Feed = {
  id: "f1",
  url: "https://example.com/feed",
  title: "Example Feed",
  description: "",
  siteUrl: "https://example.com",
  createdAt: 0,
  updatedAt: 0,
};

describe("SwimlaneCard", () => {
  it("renders the article title", () => {
    render(<SwimlaneCard article={ARTICLE} feed={FEED} onOpen={vi.fn()} />);
    expect(screen.getByText("Some article title")).toBeInTheDocument();
  });

  it("renders source feed name", () => {
    render(<SwimlaneCard article={ARTICLE} feed={FEED} onOpen={vi.fn()} />);
    expect(screen.getByText("Example Feed")).toBeInTheDocument();
  });

  it("renders relative date", () => {
    render(<SwimlaneCard article={ARTICLE} feed={FEED} onOpen={vi.fn()} />);
    expect(screen.getByTestId("swimlane-card-date")).toBeInTheDocument();
  });

  it("renders an image when the article has one", () => {
    const article: Article = {
      ...ARTICLE,
      content: '<img src="https://cdn.example.com/x.jpg">',
    };
    const { container } = render(
      <SwimlaneCard article={article} feed={FEED} onOpen={vi.fn()} />,
    );
    const img = container.querySelector('img[src="https://cdn.example.com/x.jpg"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("clicking calls onOpen with the article", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<SwimlaneCard article={ARTICLE} feed={FEED} onOpen={onOpen} />);
    await user.click(screen.getByRole("article"));
    expect(onOpen).toHaveBeenCalledWith(ARTICLE);
  });

  it("has a fixed width so it works in a horizontal scroller", () => {
    const { container } = render(
      <SwimlaneCard article={ARTICLE} feed={FEED} onOpen={vi.fn()} />,
    );
    const article = container.querySelector("article")!;
    // Tailwind w-[Npx] or w-N or max-w-N — any explicit width counts.
    expect(article.className).toMatch(/\bw-\[|\bw-\d|min-w-/);
    // Must not shrink in a flex row.
    expect(article.className).toMatch(/shrink-0|flex-shrink-0/);
  });
});
