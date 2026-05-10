import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BillingCancelled } from "@/pages/billing-cancelled";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/billing/cancelled"]}>
      <BillingCancelled />
    </MemoryRouter>,
  );
}

describe("BillingCancelled page", () => {
  it("renders a heading explaining no charge happened", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /cancel|no charge|no problem/i }),
    ).toBeInTheDocument();
  });

  it("includes a link back to the app", () => {
    renderPage();
    const link = screen.getByRole("link", {
      name: /back to feedzero|continue|home|reader|feeds/i,
    });
    expect(link).toHaveAttribute("href", "/feeds");
  });

  it("does NOT render the license token input (no successful purchase to enter token for)", () => {
    renderPage();
    expect(screen.queryByPlaceholderText(/fz_/i)).not.toBeInTheDocument();
  });
});
