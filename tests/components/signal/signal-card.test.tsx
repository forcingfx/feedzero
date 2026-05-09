import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignalCard } from "../../../src/components/signal/signal-card.tsx";
import type { ResolvedTopStory } from "../../../src/stores/signal-store.ts";
import type { Article, Feed } from "../../../src/types";

const ARTICLE_A: Article = {
  id: "a1",
  feedId: "f1",
  guid: "a1",
  title: "T1",
  link: "https://tc.example.com/m5",
  content: "",
  summary: "",
  author: "",
  publishedAt: 1_700_000_000_000,
  read: false,
  createdAt: 1_700_000_000_000,
};
const ARTICLE_B: Article = { ...ARTICLE_A, id: "a2", feedId: "f2", link: "https://verge.example.com/m5", title: "T2" };

const STORY: ResolvedTopStory = {
  id: "a1|a2",
  headline: "M5 chip leaps neural performance",
  blurb: "Apple unveils M5 with major neural-engine gains.",
  articles: [ARTICLE_A, ARTICLE_B],
};

const FEEDS: Record<string, Feed> = {
  f1: { id: "f1", url: "u", title: "TechCrunch", description: "", siteUrl: "https://tc.example.com", createdAt: 0, updatedAt: 0 },
  f2: { id: "f2", url: "u", title: "The Verge", description: "", siteUrl: "https://verge.example.com", createdAt: 0, updatedAt: 0 },
};

describe("SignalCard", () => {
  it("renders headline and blurb", () => {
    render(<SignalCard story={STORY} feeds={FEEDS} variant="tile" onOpen={vi.fn()} />);
    expect(screen.getByText(/M5 chip leaps neural performance/)).toBeInTheDocument();
    expect(screen.getByText(/Apple unveils M5/)).toBeInTheDocument();
  });

  it("clicking the card calls onOpen with the story", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<SignalCard story={STORY} feeds={FEEDS} variant="hero" onOpen={onOpen} />);
    await user.click(screen.getByRole("article"));
    expect(onOpen).toHaveBeenCalledWith(STORY);
  });

  it("shows source-attribution row with one entry per unique feed", () => {
    render(<SignalCard story={STORY} feeds={FEEDS} variant="tile" onOpen={vi.fn()} />);
    const sources = screen.getByTestId("signal-card-sources");
    expect(within(sources).getByText("TechCrunch")).toBeInTheDocument();
    expect(within(sources).getByText("The Verge")).toBeInTheDocument();
  });

  it("renders relative date", () => {
    render(<SignalCard story={STORY} feeds={FEEDS} variant="tile" onOpen={vi.fn()} />);
    expect(screen.getByTestId("signal-card-date")).toBeInTheDocument();
  });

  it("renders an image when an article has one", () => {
    const article: Article = {
      ...ARTICLE_A,
      content: '<img src="https://cdn.example.com/hero.jpg">',
    };
    const story: ResolvedTopStory = { ...STORY, articles: [article, ARTICLE_B] };
    const { container } = render(
      <SignalCard story={story} feeds={FEEDS} variant="hero" onOpen={vi.fn()} />,
    );
    const img = container.querySelector('img[src="https://cdn.example.com/hero.jpg"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("hero with image becomes a splash (image fills card, white text)", () => {
    const article: Article = {
      ...ARTICLE_A,
      content: '<img src="https://cdn.example.com/hero.jpg">',
    };
    const story: ResolvedTopStory = { ...STORY, articles: [article, ARTICLE_B] };
    render(<SignalCard story={story} feeds={FEEDS} variant="hero" onOpen={vi.fn()} />);
    const heading = screen.getByText(/M5 chip leaps/);
    expect(heading.className).toMatch(/text-white/);
  });

  it("hero without image keeps default text color", () => {
    render(<SignalCard story={STORY} feeds={FEEDS} variant="hero" onOpen={vi.fn()} />);
    const heading = screen.getByText(/M5 chip leaps/);
    expect(heading.className).not.toMatch(/text-white/);
  });

  it("brief variant suppresses the image even if one is available", () => {
    const article: Article = {
      ...ARTICLE_A,
      content: '<img src="https://cdn.example.com/hero.jpg">',
    };
    const story: ResolvedTopStory = { ...STORY, articles: [article, ARTICLE_B] };
    const { container } = render(
      <SignalCard story={story} feeds={FEEDS} variant="brief" onOpen={vi.fn()} />,
    );
    expect(container.querySelector('img[src^="https://cdn"]')).toBeNull();
  });

  it("all variants are break-inside-avoid (CSS columns masonry)", () => {
    for (const variant of ["hero", "tile", "brief"] as const) {
      const { container, unmount } = render(
        <SignalCard story={STORY} feeds={FEEDS} variant={variant} onOpen={vi.fn()} />,
      );
      const article = container.querySelector("article")!;
      expect(article.className).toMatch(/break-inside-avoid/);
      unmount();
    }
  });
});
