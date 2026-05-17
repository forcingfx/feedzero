import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/settings/theme-toggle";

function renderWithProvider() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  it("renders the three theme options (light, dark, system)", () => {
    renderWithProvider();
    expect(screen.getByRole("radio", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /system/i })).toBeInTheDocument();
  });

  it("flips the html.dark class when the user selects dark", async () => {
    // The token overrides in src/index.css target `.dark` on the root —
    // toggling the theme has to update that class. next-themes does the
    // dom mutation; we just verify the user-observable outcome.
    const user = userEvent.setup();
    renderWithProvider();
    await user.click(screen.getByRole("radio", { name: /dark/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class when the user selects light", async () => {
    const user = userEvent.setup();
    renderWithProvider();
    await user.click(screen.getByRole("radio", { name: /dark/i }));
    await user.click(screen.getByRole("radio", { name: /light/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
