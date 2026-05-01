import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewToggle } from "@/components/reader/view-toggle.tsx";

describe("ViewToggle", () => {
  it("renders Feed and Full text buttons (no Original)", () => {
    render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByText("Full text")).toBeInTheDocument();
    expect(screen.queryByText("Original")).not.toBeInTheDocument();
  });

  it("never returns null — always renders even without articleLink", () => {
    const { container } = render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    expect(container.innerHTML).not.toBe("");
  });

  it("Feed button has correct text", () => {
    render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Feed")).toBeInTheDocument();
  });

  it("calls onModeChange when Full text clicked", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="available"
        onModeChange={onModeChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /Full text/ }));
    expect(onModeChange).toHaveBeenCalledWith("extracted");
  });

  it("active mode button is checked", () => {
    render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    const feedBtn = screen.getByRole("radio", { name: /Feed/ });
    expect(feedBtn).toHaveAttribute("data-state", "on");
  });

  it("shows Kbd h hint on the Full text button", () => {
    const { container } = render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    const kbdTexts = Array.from(container.querySelectorAll("kbd")).map(
      (k) => k.textContent,
    );
    expect(kbdTexts).toContain("h");
  });

  describe("Full text button states", () => {
    it("is clickable when status is idle", () => {
      render(
        <ViewToggle
          activeMode="feed"
          extractionStatus="idle"
          onModeChange={vi.fn()}
        />,
      );
      const btn = screen.getByRole("radio", { name: /Full text/ });
      expect(btn).not.toBeDisabled();
    });

    it("is disabled and shows spinner when extracting", () => {
      const { container } = render(
        <ViewToggle
          activeMode="feed"
          extractionStatus="extracting"
          onModeChange={vi.fn()}
        />,
      );
      const btn = screen.getByRole("radio", { name: /Full text/ });
      expect(btn).toBeDisabled();
      expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("is clickable when status is available", () => {
      render(
        <ViewToggle
          activeMode="feed"
          extractionStatus="available"
          onModeChange={vi.fn()}
        />,
      );
      const btn = screen.getByRole("radio", { name: /Full text/ });
      expect(btn).not.toBeDisabled();
    });

    it("is disabled with title when status is failed", () => {
      render(
        <ViewToggle
          activeMode="feed"
          extractionStatus="failed"
          onModeChange={vi.fn()}
        />,
      );
      const btn = screen.getByRole("radio", { name: /Full text/ });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute(
        "title",
        "Extraction didn't find additional content",
      );
    });
  });
});
