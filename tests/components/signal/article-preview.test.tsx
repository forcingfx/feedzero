import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ArticlePreview } from "@/components/signal/article-preview.tsx";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import type { Article } from "@/types/index.ts";

const NOW = new Date("2026-05-21T12:00:00Z").getTime();

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    feedId: "f1",
    guid: "a1",
    title: "Council approves the budget",
    link: "https://example.com/a1",
    content: "",
    summary: "",
    author: "",
    publishedAt: NOW,
    read: false,
    createdAt: NOW,
    ...overrides,
  };
}

function renderPreview(article: Article) {
  return render(
    <MemoryRouter>
      <ArticlePreview article={article} feedTitle="Outlet" now={NOW} onOpen={() => {}} />
    </MemoryRouter>,
  );
}

describe("ArticlePreview", () => {
  beforeEach(() => {
    useExtractionStore.setState({ cache: {}, statusMap: {}, paywallMap: {} });
  });

  it("shows the feed content head when the feed includes a body", () => {
    renderPreview(makeArticle({ content: "<p>The council voted to approve the new budget.</p>" }));
    expect(screen.getByText(/council voted to approve the new budget/i)).toBeInTheDocument();
    expect(screen.queryByText(/didn't include a preview/i)).toBeNull();
  });

  it("falls back to the feed summary when content is empty", () => {
    renderPreview(makeArticle({ summary: "<p>A short summary of the story.</p>" }));
    expect(screen.getByText(/a short summary of the story/i)).toBeInTheDocument();
  });

  it("falls back to persisted extracted content for a synced article", () => {
    renderPreview(makeArticle({ extractedContent: "<p>Full extracted article body here.</p>" }));
    expect(screen.getByText(/full extracted article body here/i)).toBeInTheDocument();
  });

  it("uses the extraction store cache when present", () => {
    const article = makeArticle();
    useExtractionStore.setState({ cache: { [article.link]: "<p>Cached extracted text.</p>" } });
    renderPreview(article);
    expect(screen.getByText(/cached extracted text/i)).toBeInTheDocument();
  });

  it("offers an explicit Load preview action when no body is available", () => {
    renderPreview(makeArticle());
    expect(screen.getByText(/this feed didn't include a preview/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load preview/i })).toBeInTheDocument();
  });

  it("clicking Load preview asks the extraction store to fetch the article", async () => {
    const article = makeArticle();
    const extractInBackground = vi.fn();
    useExtractionStore.setState({ extractInBackground });
    renderPreview(article);
    await userEvent.click(screen.getByRole("button", { name: /load preview/i }));
    expect(extractInBackground).toHaveBeenCalledWith(article.link);
  });

  it("shows a loading state while extraction is in flight", () => {
    const article = makeArticle();
    useExtractionStore.setState({ statusMap: { [article.link]: "extracting" } });
    renderPreview(article);
    expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
  });

  it("shows a recoverable message and hides Load when extraction failed", () => {
    const article = makeArticle();
    useExtractionStore.setState({ statusMap: { [article.link]: "failed" } });
    renderPreview(article);
    expect(screen.getByText(/couldn't load a preview/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load preview/i })).toBeNull();
  });
});
