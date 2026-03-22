import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewToggle } from "@/components/reader/view-toggle.tsx";

describe("ViewToggle", () => {
  it("always renders all three buttons", () => {
    render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Feed")).toBeInTheDocument();
    expect(screen.getByText("Extracted")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
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

  it("calls onModeChange when Extracted clicked", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(
      <ViewToggle
        activeMode="feed"
        extractionStatus="available"
        onModeChange={onModeChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /Extracted/ }));
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

  it("shows Kbd E hint on the Extracted button", () => {
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
    expect(kbdTexts).toContain("E");
  });

  it("shows Kbd O hint on the Original button", () => {
    const { container } = render(
      <ViewToggle
        activeMode="feed"
        articleLink="https://example.com"
        extractionStatus="idle"
        onModeChange={vi.fn()}
      />,
    );
    const kbdTexts = Array.from(container.querySelectorAll("kbd")).map(
      (k) => k.textContent,
    );
    expect(kbdTexts).toContain("O");
  });

  describe("Extracted button states", () => {
    it("is clickable when status is idle", () => {
      render(
        <ViewToggle
          activeMode="feed"
          extractionStatus="idle"
          onModeChange={vi.fn()}
        />,
      );
      const btn = screen.getByRole("radio", { name: /Extracted/ });
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
      const btn = screen.getByRole("radio", { name: /Extracted/ });
      expect(btn).toBeDisabled();
      // Spinner SVG (Loader2) should be present
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
      const btn = screen.getByRole("radio", { name: /Extracted/ });
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
      const btn = screen.getByRole("radio", { name: /Extracted/ });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute(
        "title",
        "Extraction didn't find additional content",
      );
    });
  });

  describe("Original button", () => {
    it("renders as a link when articleLink is provided", () => {
      render(
        <ViewToggle
          activeMode="feed"
          articleLink="https://example.com/article"
          extractionStatus="idle"
          onModeChange={vi.fn()}
        />,
      );
      const link = screen.getByRole("radio", { name: /Original/ });
      expect(link).toHaveAttribute("href", "https://example.com/article");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("is disabled when no articleLink provided", () => {
      render(
        <ViewToggle
          activeMode="feed"
          extractionStatus="idle"
          onModeChange={vi.fn()}
        />,
      );
      const btn = screen.getByRole("radio", { name: /Original/ });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("title", "No link available");
    });

    it("has external link icon", () => {
      const { container } = render(
        <ViewToggle
          activeMode="feed"
          articleLink="https://example.com"
          extractionStatus="idle"
          onModeChange={vi.fn()}
        />,
      );
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });
});
