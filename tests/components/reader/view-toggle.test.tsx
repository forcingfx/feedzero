import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewToggle } from "@/components/reader/view-toggle.tsx";

describe("ViewToggle", () => {
  it("returns null when modes has 1 or fewer items and no articleLink", () => {
    const { container } = render(
      <ViewToggle modes={["feed"]} activeMode="feed" onModeChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders when only articleLink provided (for Original button)", () => {
    render(
      <ViewToggle
        modes={["feed"]}
        activeMode="feed"
        articleLink="https://example.com"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Original")).toBeInTheDocument();
  });

  it("renders buttons for each mode", () => {
    render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: /Feed/ })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Extracted/ }),
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
    await user.click(screen.getByRole("radio", { name: /Extracted/ }));
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
    const feedBtn = screen.getByRole("radio", { name: /Feed/ });
    expect(feedBtn).toHaveAttribute("data-state", "on");
  });

  it("shows Kbd E hint on the Extracted button", () => {
    const { container } = render(
      <ViewToggle
        modes={["feed", "extracted"]}
        activeMode="feed"
        onModeChange={vi.fn()}
      />,
    );
    const kbds = container.querySelectorAll("kbd");
    expect(kbds.length).toBe(1);
    expect(kbds[0].textContent).toBe("E");
  });

  describe("Original button", () => {
    it("renders Original button when articleLink is provided", () => {
      render(
        <ViewToggle
          modes={["feed", "extracted"]}
          activeMode="feed"
          articleLink="https://example.com"
          onModeChange={vi.fn()}
        />,
      );
      expect(screen.getByText("Original")).toBeInTheDocument();
    });

    it("does not render Original button when articleLink is not provided", () => {
      render(
        <ViewToggle
          modes={["feed", "extracted"]}
          activeMode="feed"
          onModeChange={vi.fn()}
        />,
      );
      expect(screen.queryByText("Original")).not.toBeInTheDocument();
    });

    it("Original button has external link icon", () => {
      const { container } = render(
        <ViewToggle
          modes={["feed", "extracted"]}
          activeMode="feed"
          articleLink="https://example.com"
          onModeChange={vi.fn()}
        />,
      );
      // lucide-react ExternalLink icon renders as svg
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("shows Kbd O hint on the Original button", () => {
      const { container } = render(
        <ViewToggle
          modes={["feed", "extracted"]}
          activeMode="feed"
          articleLink="https://example.com"
          onModeChange={vi.fn()}
        />,
      );
      const kbds = container.querySelectorAll("kbd");
      const kbdTexts = Array.from(kbds).map((k) => k.textContent);
      expect(kbdTexts).toContain("E");
      expect(kbdTexts).toContain("O");
    });

    it("Original button links to articleLink", () => {
      render(
        <ViewToggle
          modes={["feed", "extracted"]}
          activeMode="feed"
          articleLink="https://example.com/article"
          onModeChange={vi.fn()}
        />,
      );
      // The anchor is rendered with role="radio" from the toggle group
      const link = screen.getByRole("radio", { name: /Original/ });
      expect(link).toHaveAttribute("href", "https://example.com/article");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });
});
