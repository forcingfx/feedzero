/**
 * SortPill — the article-sort control rebuilt on ExpandingPill.
 * Replaces the previous SortMenu (text+icon button). Same modes,
 * same handler, new visual.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortPill } from "@/components/articles/sort-pill.tsx";
import type { ArticleSortMode } from "@feedzero/core/types";

describe("SortPill", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  function renderPill(mode: ArticleSortMode = "newest") {
    return render(<SortPill mode={mode} onChange={onChange} />);
  }

  it("shows the current mode label", () => {
    renderPill("unread-first");
    expect(screen.getByText("Unread first")).toBeInTheDocument();
  });

  it("opens a menu with every sort mode when clicked", async () => {
    const user = userEvent.setup();
    renderPill("newest");
    await user.click(screen.getByRole("button", { name: /sort/i }));
    expect(
      await screen.findByRole("menuitem", { name: /newest first/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /oldest first/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /unread first/i }),
    ).toBeInTheDocument();
  });

  it("calls onChange with the chosen mode", async () => {
    const user = userEvent.setup();
    renderPill("newest");
    await user.click(screen.getByRole("button", { name: /sort/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /unread first/i }),
    );
    expect(onChange).toHaveBeenCalledWith("unread-first");
  });

  it("aria-label describes the current sort mode for screen readers", () => {
    renderPill("oldest");
    const btn = screen.getByRole("button", { name: /sort.*oldest first/i });
    expect(btn).toBeInTheDocument();
  });

  it("forwards data-testid for downstream queries", () => {
    render(<SortPill mode="newest" onChange={onChange} dataTestId="sort-pill" />);
    expect(screen.getByTestId("sort-pill")).toBeInTheDocument();
  });
});
