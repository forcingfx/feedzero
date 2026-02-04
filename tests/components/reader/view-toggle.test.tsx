import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewToggle } from "@/components/reader/view-toggle.tsx";

describe("ViewToggle", () => {
  it("returns null when modes has 1 or fewer items", () => {
    const { container } = render(
      <ViewToggle modes={["feed"]} activeMode="feed" onModeChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders buttons for each mode", () => {
    render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Feed" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Extracted" }),
    ).toBeInTheDocument();
  });

  it("Feed button has correct text", () => {
    render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Feed")).toBeInTheDocument();
  });

  it("Extracted button has correct text", () => {
    render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Extracted")).toBeInTheDocument();
  });

  it("calls onModeChange when button clicked", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={onModeChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Extracted" }));
    expect(onModeChange).toHaveBeenCalledWith("extracted");
  });

  it("active mode button is checked", () => {
    render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={vi.fn()}
      />,
    );
    const feedBtn = screen.getByRole("radio", { name: "Feed" });
    expect(feedBtn).toHaveAttribute("data-state", "on");
  });
});
