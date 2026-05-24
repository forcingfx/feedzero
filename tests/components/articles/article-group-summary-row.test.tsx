import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleGroupSummaryRow } from "@/components/articles/article-group-summary-row.tsx";

describe("ArticleGroupSummaryRow", () => {
  it("when collapsed: shows '+N more from <feed>' with a chevron down", () => {
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={4}
        feedTitle="TechCrunch"
        onToggle={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent(/4 more/);
    expect(btn).toHaveTextContent(/TechCrunch/);
  });

  it("when open: shows 'Collapse' with a chevron up", () => {
    render(
      <ArticleGroupSummaryRow
        open={true}
        hiddenCount={4}
        feedTitle="TechCrunch"
        onToggle={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent(/Collapse/);
  });

  it("falls back to 'this feed' when no feedTitle is provided (per-feed view)", () => {
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={3}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveTextContent(/this feed/);
  });

  it("is NOT a role='option' — keyboard nav (j/k) must skip it", () => {
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={3}
        feedTitle="Aggregator"
        onToggle={() => {}}
      />,
    );
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("clicking the row calls onToggle exactly once", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={3}
        feedTitle="Aggregator"
        onToggle={onToggle}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("button has min-h-11 (44px touch target) for mobile accessibility", () => {
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={3}
        feedTitle="Aggregator"
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole("button").className).toMatch(/min-h-11/);
  });

  it("provides an aria-label describing the action and feed", () => {
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={5}
        feedTitle="TechCrunch"
        onToggle={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Show 5 more.*TechCrunch/ }),
    ).toBeInTheDocument();
  });

  it("aria-label switches to 'Collapse' when open", () => {
    render(
      <ArticleGroupSummaryRow
        open={true}
        hiddenCount={5}
        feedTitle="TechCrunch"
        onToggle={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Collapse.*TechCrunch/ }),
    ).toBeInTheDocument();
  });

  it("renders the feed favicon when feedSiteUrl is provided", () => {
    render(
      <ArticleGroupSummaryRow
        open={false}
        hiddenCount={5}
        feedTitle="TechCrunch"
        feedSiteUrl="https://techcrunch.com"
        onToggle={() => {}}
      />,
    );
    const favicon = screen.getByRole("button").querySelector("img");
    expect(favicon).not.toBeNull();
    expect(favicon?.getAttribute("src")).toContain(
      "/api/icon?domain=techcrunch.com",
    );
  });
});
