import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleGroupStack } from "@/components/articles/article-group-stack.tsx";
import type { ArticleGroup } from "@/lib/group-articles.ts";
import type { Article } from "@/types/index.ts";

function makeArticle(id: string, overrides: Partial<Article> = {}): Article {
  const now = Date.now();
  return {
    id,
    feedId: "feed-a",
    guid: id,
    title: `Article ${id}`,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: now,
    read: false,
    createdAt: now,
    ...overrides,
  };
}

function makeGroup(articleIds: string[]): ArticleGroup {
  const articles = articleIds.map((id) => makeArticle(id));
  return {
    kind: "group",
    id: `g:feed-a:${articleIds[0]}:${articleIds.length}`,
    feedId: "feed-a",
    articles,
  };
}

describe("ArticleGroupStack", () => {
  it("renders the top card with the top article's title when collapsed", () => {
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Article 1")).toBeInTheDocument();
    expect(screen.queryByText("Article 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Article 3")).not.toBeInTheDocument();
  });

  it("shows a '+N more' chevron with N = length - 1", () => {
    const group = makeGroup(["1", "2", "3", "4"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Show 3 more/ })).toBeInTheDocument();
  });

  it("chevron is sized to a 44x44 touch target (min-h-11 min-w-11)", () => {
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
      />,
    );
    const chevron = screen.getByRole("button", { name: /Show 2 more/ });
    expect(chevron.className).toMatch(/min-h-11/);
    expect(chevron.className).toMatch(/min-w-11/);
  });

  it("renders exactly one role=option when collapsed (the top card)", () => {
    const group = makeGroup(["1", "2", "3", "4"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
      />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("clicking the chevron expands the stack: N role=option after click", async () => {
    const user = userEvent.setup();
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Show 2 more/ }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("Article 1")).toBeInTheDocument();
    expect(screen.getByText("Article 2")).toBeInTheDocument();
    expect(screen.getByText("Article 3")).toBeInTheDocument();
  });

  it("clicking the inner Collapse button collapses back to one role=option", async () => {
    const user = userEvent.setup();
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Show 2 more/ }));
    await user.click(screen.getByRole("button", { name: /Collapse/ }));
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("chevron click does NOT call onSelect (stopPropagation works)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Show 2 more/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the top card calls onSelect with the top article", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const group = makeGroup(["top", "two", "three"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByText("Article top"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("top");
  });

  it("isSelected propagates to the matching ArticleItem (aria-selected=true)", () => {
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId="1"
        onSelect={() => {}}
      />,
    );
    const option = screen.getByRole("option");
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("feedTitle and feedSiteUrl props propagate to the top card", () => {
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
        feedTitle="Aggregator Feed"
        feedSiteUrl="https://aggregator.example.com"
      />,
    );
    expect(screen.getByText(/Aggregator Feed/)).toBeInTheDocument();
  });

  it("aria-label on the chevron references the feed title for screen readers", () => {
    const group = makeGroup(["1", "2", "3"]);
    render(
      <ArticleGroupStack
        group={group}
        selectedArticleId={undefined}
        onSelect={() => {}}
        feedTitle="Aggregator Feed"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Show 2 more.*Aggregator Feed/ }),
    ).toBeInTheDocument();
  });
});
