import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BillingSuccess } from "@/pages/billing-success";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

function renderWithRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BillingSuccess />
    </MemoryRouter>,
  );
}

describe("BillingSuccess page", () => {
  it("renders a confirmation heading", () => {
    renderWithRoute("/billing/success");
    expect(
      screen.getByRole("heading", { name: /thanks|welcome|success/i }),
    ).toBeInTheDocument();
  });

  it("includes the LicenseTokenInput so the user can paste their token", () => {
    renderWithRoute("/billing/success?session_id=cs_test_xyz");
    // The input is the LicenseTokenInput from PR Y, which renders a labeled
    // text input with placeholder "fz_..." and a Save button.
    expect(screen.getByPlaceholderText(/fz_/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save/i }),
    ).toBeInTheDocument();
  });

  it("shows the masked Stripe session_id when present (lets the user confirm Stripe acked)", () => {
    renderWithRoute("/billing/success?session_id=cs_test_a1b2c3d4e5f6");
    // Expose enough of the session id to verify, but not in a UX-heavy way —
    // matters mostly for support debugging.
    expect(screen.getByText(/cs_test_a1b2c3d4e5f6/)).toBeInTheDocument();
  });

  it("renders a link back to the app", () => {
    renderWithRoute("/billing/success");
    const link = screen.getByRole("link", {
      name: /back to feedzero|continue|home|reader/i,
    });
    expect(link).toHaveAttribute("href", "/feeds");
  });

  it("renders without the session_id query param (defensive — direct nav)", () => {
    renderWithRoute("/billing/success");
    expect(
      screen.getByRole("heading", { name: /thanks|welcome|success/i }),
    ).toBeInTheDocument();
    // No session_id text should appear when the param is absent
    expect(screen.queryByText(/cs_/)).not.toBeInTheDocument();
  });
});
